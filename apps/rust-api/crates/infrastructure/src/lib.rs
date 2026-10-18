//! PostgreSQL access. Every query is parameterised, bounded and uses the same
//! schema and transaction rules as the TypeScript service layer.
//!
//! There are deliberately no `sqlx::query!` macros: the Rust build must not
//! require a live database at compile time, which keeps CI reproducible and
//! makes it possible to build the Docker image without staging credentials.

use chrono::{DateTime, Utc};
use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::{PgPool, Row};
use std::time::Duration;
use uuid::Uuid;

pub const MAX_PAGE_SIZE: i64 = 48;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub type StoreResult<T> = Result<T, StoreError>;

pub async fn connect(database_url: &str, max_connections: u32) -> StoreResult<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(max_connections.clamp(1, 50))
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(30))
        .after_connect(|connection, _meta| {
            Box::pin(async move {
                // Bound every statement so one slow query cannot hold a
                // connection or a request indefinitely.
                //
                // One statement per query: sqlx prepares these, and PostgreSQL
                // rejects multiple commands in a prepared statement ("cannot
                // insert multiple commands into a prepared statement"), which
                // fails after_connect and every connection with it.
                for statement in ["set statement_timeout = 10000", "set lock_timeout = 5000"] {
                    sqlx::query(statement).execute(&mut *connection).await?;
                }
                Ok(())
            })
        })
        .connect(database_url)
        .await?;
    Ok(pool)
}

/// A suspended Neon branch or a container started at the same moment as its
/// database can refuse the first connections. Retrying briefly keeps the
/// service up instead of crash-looping until the platform gives up.
pub async fn connect_with_retry(
    database_url: &str,
    max_connections: u32,
    attempts: u32,
) -> StoreResult<PgPool> {
    let attempts = attempts.max(1);
    let mut last_error: Option<StoreError> = None;
    for attempt in 1..=attempts {
        match connect(database_url, max_connections).await {
            Ok(pool) => return Ok(pool),
            Err(error) => {
                tracing::warn!(attempt, attempts, error = %error, "database connection attempt failed");
                last_error = Some(error);
                if attempt < attempts {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    }
    Err(last_error.expect("the loop runs at least once"))
}

// Migrations are applied by exactly one process (`npm run db:migrate`, also
// used by CI and deployment jobs). The API only reads the ledger: running
// migrations from every instance would race and is explicitly avoided. The
// schema files under `migrations/` are the single source of truth for both
// backends. This is why the `migrate` sqlx feature is intentionally unused.

pub async fn ping(pool: &PgPool) -> bool {
    sqlx::query("select 1").execute(pool).await.is_ok()
}

pub struct ClubListQuery<'a> {
    pub limit: i64,
    pub category: Option<&'a str>,
    pub search: Option<&'a str>,
    pub cursor: Option<(DateTime<Utc>, Uuid)>,
}

pub async fn list_clubs(pool: &PgPool, query: ClubListQuery<'_>) -> StoreResult<Vec<PgRow>> {
    let limit = query.limit.clamp(1, MAX_PAGE_SIZE) + 1;
    let pattern = query
        .search
        .map(|value| format!("%{}%", value.replace('%', "\\%")));
    let rows = sqlx::query(
        r#"
        select c.id, c.slug, c.name, c.tagline, c.category::text as category,
               -- ::text matters: this column is a Postgres enum and the API
               -- decodes it into a String, which fails otherwise.
               c.logo_url, c.verified, c.membership_policy::text as membership_policy,
               (select count(*) from club_memberships m
                 where m.club_id = c.id and m.status = 'active') as member_count,
               (select count(*) from events e
                 where e.club_id = c.id and e.status = 'published' and e.starts_at > now()) as upcoming_event_count,
               c.created_at
          from clubs c
         where c.status = 'active'
           and ($2::text is null or c.category::text = $2)
           and ($3::text is null or c.name ilike $3 or c.tagline ilike $3 or c.description ilike $3)
           and ($4::timestamptz is null or (c.created_at, c.id) < ($4, $5))
         order by c.created_at desc, c.id desc
         limit $1
        "#,
    )
    .bind(limit)
    .bind(query.category)
    .bind(pattern)
    .bind(query.cursor.map(|cursor| cursor.0))
    .bind(query.cursor.map(|cursor| cursor.1))
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub struct EventListQuery<'a> {
    pub limit: i64,
    pub category: Option<&'a str>,
    pub search: Option<&'a str>,
    pub when: &'a str,
    pub cursor: Option<(DateTime<Utc>, Uuid)>,
}

pub async fn list_events(pool: &PgPool, query: EventListQuery<'_>) -> StoreResult<Vec<PgRow>> {
    let limit = query.limit.clamp(1, MAX_PAGE_SIZE) + 1;
    let pattern = query
        .search
        .map(|value| format!("%{}%", value.replace('%', "\\%")));
    let rows = sqlx::query(
        r#"
        select e.id, e.slug, e.title, e.summary, e.category::text as category, e.status::text as status,
               e.starts_at, e.ends_at, e.timezone, e.venue_name, e.online_url, e.capacity,
               (select count(*) from event_registrations r
                 where r.event_id = e.id and r.status in ('registered','attended')) as registered_count,
               (select count(*) from event_registrations r
                 where r.event_id = e.id and r.status = 'waitlisted') as waitlist_count,
               c.id as club_id, c.slug as club_slug, c.name as club_name
          from events e
          left join clubs c on c.id = e.club_id
         where e.status = 'published'
           and ($2::text = 'all'
                or ($2 = 'upcoming' and e.ends_at >= now())
                or ($2 = 'past' and e.ends_at < now()))
           and ($3::text is null or e.category::text = $3)
           and ($4::text is null or e.title ilike $4 or e.summary ilike $4 or e.description ilike $4)
           and ($5::timestamptz is null or (e.starts_at, e.id) < ($5, $6))
         order by e.starts_at asc, e.id asc
         limit $1
        "#,
    )
    .bind(limit)
    .bind(query.when)
    .bind(query.category)
    .bind(pattern)
    .bind(query.cursor.map(|cursor| cursor.0))
    .bind(query.cursor.map(|cursor| cursor.1))
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub struct ProjectListQuery<'a> {
    pub limit: i64,
    pub category: Option<&'a str>,
    pub search: Option<&'a str>,
    pub cursor: Option<(DateTime<Utc>, Uuid)>,
}

pub async fn list_projects(pool: &PgPool, query: ProjectListQuery<'_>) -> StoreResult<Vec<PgRow>> {
    let limit = query.limit.clamp(1, MAX_PAGE_SIZE) + 1;
    let pattern = query
        .search
        .map(|value| format!("%{}%", value.replace('%', "\\%")));
    let rows = sqlx::query(
        r#"
        select p.id, p.slug, p.title, p.summary, p.category::text as category, p.status::text as status,
               p.approved_at,
               u.id as lead_id, u.name as lead_name, u.avatar_url as lead_avatar,
               c.id as club_id, c.slug as club_slug, c.name as club_name,
               (select count(*) from project_members pm where pm.project_id = p.id) as member_count,
               -- open seats: every role's slots minus its accepted applications,
               -- floored at zero per role and summed. The parentheses matter —
               -- this expression was once unbalanced and broke the whole query.
               (select coalesce(sum(greatest(r.slots - (
                    select count(*) from project_applications a
                     where a.role_id = r.id and a.status = 'accepted'), 0)), 0)
                  from project_roles r where r.project_id = p.id) as open_roles
          from projects p
          join users u on u.id = p.lead_id
          left join clubs c on c.id = p.club_id
         where p.status = 'approved' and p.visibility = 'public'
           and ($2::text is null or p.category::text = $2)
           and ($3::text is null or p.title ilike $3 or p.summary ilike $3 or p.description ilike $3)
           and ($4::timestamptz is null or (p.approved_at, p.id) < ($4, $5))
         order by p.approved_at desc, p.id desc
         limit $1
        "#,
    )
    .bind(limit)
    .bind(query.category)
    .bind(pattern)
    .bind(query.cursor.map(|cursor| cursor.0))
    .bind(query.cursor.map(|cursor| cursor.1))
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn resolve_session(pool: &PgPool, token_hash: &str) -> StoreResult<Option<PgRow>> {
    let row = sqlx::query(
        r#"
        select s.id as session_id, s.expires_at,
               u.id, u.name, u.email, u.avatar_url,
               array_to_string(u.roles::text[], ',') as roles
          from sessions s
          join users u on u.id = s.user_id
         where s.token_hash = $1
           and s.revoked_at is null
           and s.expires_at > now()
           and u.status = 'active'
         limit 1
        "#,
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Fixed-window counters in PostgreSQL, shared with the TypeScript services so
/// a limit holds no matter which backend receives the request.
pub async fn consume_rate_limit(
    pool: &PgPool,
    bucket: &str,
    limit: i32,
    window_seconds: i32,
) -> StoreResult<bool> {
    let row = sqlx::query(
        r#"
        insert into rate_limit_counters (bucket, window_start, hits)
        values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
        on conflict (bucket, window_start)
        do update set hits = rate_limit_counters.hits + 1
        returning hits
        "#,
    )
    .bind(bucket)
    .bind(window_seconds)
    .fetch_one(pool)
    .await?;
    let hits: i32 = row.try_get("hits").unwrap_or(1);
    Ok(hits <= limit)
}

pub async fn migrations_applied(pool: &PgPool) -> StoreResult<i64> {
    let row = sqlx::query("select count(*) as count from schema_migrations")
        .fetch_one(pool)
        .await?;
    Ok(row.try_get::<i64, _>("count").unwrap_or(0))
}
