//! Read-side application services exposed by the Rust API.
//!
//! Scope is intentionally explicit: these are the contract-compatible routes
//! documented in `openapi/openapi.yaml`. Mutations live in the TypeScript
//! service layer today; the Rust API refuses them with 503 rather than
//! pretending to write. See docs/ARCHITECTURE.md for the migration path.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use campussphere_infrastructure::{StoreError, MAX_PAGE_SIZE};
use campussphere_shared_types::{
    ClubCategory, ClubRef, ClubSummary, EventCategory, EventSummary, Paginated, ProjectCategory,
    ProjectSummary, SessionUser, UserRef,
};
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub mod error;
pub use error::ApiError;

pub struct AppState {
    pub pool: PgPool,
    pub site_url: String,
    /// Reserved for cookie-issuing endpoints; the Rust subset does not mint
    /// sessions yet, so the field is intentionally unused rather than faked.
    #[allow(dead_code)]
    pub secure_cookies: bool,
}

#[derive(Debug, Clone, Default)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub category: Option<String>,
    pub search: Option<String>,
    pub cursor: Option<String>,
    pub when: Option<String>,
}

fn limit_or_default(requested: Option<i64>) -> i64 {
    requested.unwrap_or(12).clamp(1, MAX_PAGE_SIZE)
}

fn encode_cursor(at: DateTime<Utc>, id: Uuid) -> String {
    URL_SAFE_NO_PAD.encode(format!("{}|{}", at.to_rfc3339(), id))
}

fn decode_cursor(raw: &str) -> Option<(DateTime<Utc>, Uuid)> {
    let decoded = URL_SAFE_NO_PAD.decode(raw).ok()?;
    let text = String::from_utf8(decoded).ok()?;
    let (at, id) = text.split_once('|')?;
    Some((at.parse().ok()?, Uuid::parse_str(id).ok()?))
}

fn category_from(value: &str) -> ClubCategory {
    match value {
        "academic" => ClubCategory::Academic,
        "arts" => ClubCategory::Arts,
        "career" => ClubCategory::Career,
        "cultural" => ClubCategory::Cultural,
        "environment" => ClubCategory::Environment,
        "media" => ClubCategory::Media,
        "sports" => ClubCategory::Sports,
        "technology" => ClubCategory::Technology,
        "volunteering" => ClubCategory::Volunteering,
        _ => ClubCategory::Other,
    }
}

fn project_category_from(value: &str) -> ProjectCategory {
    match value {
        "software" => ProjectCategory::Software,
        "robotics" => ProjectCategory::Robotics,
        "research" => ProjectCategory::Research,
        "volunteering" => ProjectCategory::Volunteering,
        "gardening" => ProjectCategory::Gardening,
        "creative" => ProjectCategory::Creative,
        "campus-improvement" => ProjectCategory::CampusImprovement,
        "entrepreneurship" => ProjectCategory::Entrepreneurship,
        _ => ProjectCategory::Other,
    }
}

fn event_category_from(value: &str) -> EventCategory {
    match value {
        "academic" => EventCategory::Academic,
        "arts" => EventCategory::Arts,
        "career" => EventCategory::Career,
        "community" => EventCategory::Community,
        "competition" => EventCategory::Competition,
        "cultural" => EventCategory::Cultural,
        "environment" => EventCategory::Environment,
        "sports" => EventCategory::Sports,
        "technology" => EventCategory::Technology,
        _ => EventCategory::Other,
    }
}

pub async fn list_clubs(state: &AppState, params: &ListParams) -> Result<Paginated<ClubSummary>, ApiError> {
    let limit = limit_or_default(params.limit);
    let rows = campussphere_infrastructure::list_clubs(
        &state.pool,
        campussphere_infrastructure::ClubListQuery {
            limit,
            category: params.category.as_deref(),
            search: params.search.as_deref(),
            cursor: params.cursor.as_deref().and_then(decode_cursor),
        },
    )
    .await?;

    use sqlx::Row;
    let has_more = rows.len() > limit as usize;
    let mut items = Vec::with_capacity(rows.len().min(limit as usize));
    let mut last_key: Option<(DateTime<Utc>, Uuid)> = None;
    for row in rows.into_iter().take(limit as usize) {
        last_key = Some((row.get("created_at"), row.get("id")));
        items.push(ClubSummary {
            id: row.get("id"),
            slug: row.get("slug"),
            name: row.get("name"),
            tagline: row.get("tagline"),
            category: category_from(row.get::<String, _>("category").as_str()),
            logo_url: row.get("logo_url"),
            verified: row.get("verified"),
            membership_policy: row.get("membership_policy"),
            member_count: row.get("member_count"),
            upcoming_event_count: row.get("upcoming_event_count"),
        });
    }
    let next_cursor = if has_more {
        last_key.map(|(at, id)| encode_cursor(at, id))
    } else {
        None
    };
    Ok(Paginated { items, next_cursor })
}

pub async fn list_events(state: &AppState, params: &ListParams) -> Result<Paginated<EventSummary>, ApiError> {
    use sqlx::Row;
    let limit = limit_or_default(params.limit);
    let when = params.when.as_deref().unwrap_or("upcoming");
    let when = match when {
        "past" | "all" => when,
        _ => "upcoming",
    };
    let rows = campussphere_infrastructure::list_events(
        &state.pool,
        campussphere_infrastructure::EventListQuery {
            limit,
            category: params.category.as_deref(),
            search: params.search.as_deref(),
            when,
            cursor: params.cursor.as_deref().and_then(decode_cursor),
        },
    )
    .await?;
    let has_more = rows.len() > limit as usize;
    let mut next_cursor = None;
    let mut items = Vec::new();
    for row in rows.into_iter().take(limit as usize) {
        let starts_at: DateTime<Utc> = row.get("starts_at");
        let id: Uuid = row.get("id");
        next_cursor = Some(encode_cursor(starts_at, id));
        let club_id: Option<Uuid> = row.get("club_id");
        items.push(EventSummary {
            id,
            slug: row.get("slug"),
            title: row.get("title"),
            summary: row.get("summary"),
            category: event_category_from(row.get::<String, _>("category").as_str()),
            status: row.get("status"),
            starts_at,
            ends_at: row.get("ends_at"),
            timezone: row.get("timezone"),
            venue_name: row.get("venue_name"),
            is_online: row.get::<Option<String>, _>("online_url").is_some() && row.get::<Option<String>, _>("venue_name").is_none(),
            capacity: row.get("capacity"),
            registered_count: row.get("registered_count"),
            waitlist_count: row.get("waitlist_count"),
            club: club_id.map(|club_id| ClubRef {
                id: club_id,
                slug: row.get("club_slug"),
                name: row.get("club_name"),
            }),
        });
    }
    if !has_more {
        next_cursor = None;
    }
    Ok(Paginated { items, next_cursor })
}

pub async fn list_projects(state: &AppState, params: &ListParams) -> Result<Paginated<ProjectSummary>, ApiError> {
    use sqlx::Row;
    let limit = limit_or_default(params.limit);
    let rows = campussphere_infrastructure::list_projects(
        &state.pool,
        campussphere_infrastructure::ProjectListQuery {
            limit,
            category: params.category.as_deref(),
            search: params.search.as_deref(),
            cursor: params.cursor.as_deref().and_then(decode_cursor),
        },
    )
    .await?;
    let has_more = rows.len() > limit as usize;
    let mut items = Vec::new();
    let mut next_cursor = None;
    for row in rows.into_iter().take(limit as usize) {
        let club_id: Option<Uuid> = row.get("club_id");
        let approved_at: Option<DateTime<Utc>> = row.get("approved_at");
        if let Some(at) = approved_at {
            next_cursor = Some(encode_cursor(at, row.get("id")));
        }
        items.push(ProjectSummary {
            id: row.get("id"),
            slug: row.get("slug"),
            title: row.get("title"),
            summary: row.get("summary"),
            category: project_category_from(row.get::<String, _>("category").as_str()),
            status: row.get("status"),
            open_roles: row.get("open_roles"),
            member_count: row.get("member_count"),
            lead: UserRef {
                id: row.get("lead_id"),
                name: row.get("lead_name"),
                avatar_url: row.get("lead_avatar"),
            },
            club: club_id.map(|club_id| ClubRef {
                id: club_id,
                slug: row.get("club_slug"),
                name: row.get("club_name"),
            }),
            approved_at,
        });
    }
    if !has_more {
        next_cursor = None;
    }
    Ok(Paginated { items, next_cursor })
}

#[derive(serde::Serialize)]
pub struct SearchResults {
    pub query: String,
    pub clubs: Vec<ClubSummary>,
    pub projects: Vec<ProjectSummary>,
    pub events: Vec<EventSummary>,
    pub total: usize,
}

pub async fn search(state: &AppState, query: &str, kind: &str) -> Result<SearchResults, ApiError> {
    let trimmed = query.trim();
    if trimmed.chars().count() < 2 {
        return Ok(SearchResults {
            query: trimmed.to_string(),
            clubs: Vec::new(),
            projects: Vec::new(),
            events: Vec::new(),
            total: 0,
        });
    }
    let params = ListParams {
        limit: Some(5),
        search: Some(trimmed.to_string()),
        ..Default::default()
    };
    let clubs = if kind == "all" || kind == "clubs" {
        list_clubs(state, &params).await?.items
    } else {
        Vec::new()
    };
    let projects = if kind == "all" || kind == "projects" {
        list_projects(state, &params).await?.items
    } else {
        Vec::new()
    };
    let events = if kind == "all" || kind == "events" {
        list_events(
            state,
            &ListParams {
                when: Some("upcoming".into()),
                ..params
            },
        )
        .await?
        .items
    } else {
        Vec::new()
    };
    let total = clubs.len() + projects.len() + events.len();
    Ok(SearchResults {
        query: trimmed.to_string(),
        clubs,
        projects,
        events,
        total,
    })
}

/// Session tokens arrive as `Authorization: Bearer …` (server-to-server) or as
/// the HttpOnly cookie (browser). Only the hash is compared in the database.
pub async fn session_user(state: &AppState, raw_token: &str) -> Result<Option<SessionUser>, ApiError> {
    if raw_token.len() < 20 || raw_token.len() > 200 {
        return Ok(None);
    }
    let hash = campussphere_security::hash_token(raw_token);
    let row = match campussphere_infrastructure::resolve_session(&state.pool, &hash).await? {
        Some(row) => row,
        None => return Ok(None),
    };
    use sqlx::Row;
    let roles: String = row.get("roles");
    Ok(Some(SessionUser {
        id: row.get("id"),
        name: row.get("name"),
        email: row.get("email"),
        roles: roles
            .split(',')
            .filter(|role| !role.is_empty())
            .map(str::to_string)
            .collect(),
        avatar_url: row.get("avatar_url"),
    }))
}

impl From<StoreError> for ApiError {
    fn from(error: StoreError) -> Self {
        tracing::error!(error = %error, "database failure");
        ApiError::unavailable("The database is not available right now.")
    }
}
