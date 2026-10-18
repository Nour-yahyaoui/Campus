//! CampusSphere primary API.
//!
//! Implemented with Actix Web and sqlx against the same PostgreSQL schema the
//! Next.js services use. The documented compatible subset is served here; the
//! rest of the product's mutations still live in the TypeScript service layer
//! and are explicitly refused with 503 rather than silently accepted.
//!
//! Build/run: `cargo run -p campussphere-api` with DATABASE_URL set.
//! Health: GET /health/live, GET /health/ready.

use actix_cors::Cors;
use actix_web::http::header;
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use campussphere_application::{
    list_clubs, list_events, list_projects, search, session_user, ApiError, AppState, ListParams,
};
use campussphere_shared_types::{ApiErrorBody, ApiErrorCode, ApiErrorDetail, HealthBody};
use campussphere_telemetry::RequestTimer;
use serde::Deserialize;
use std::time::Instant;

/// 120 requests per minute per hashed client address and route. Limits live in
/// PostgreSQL so every instance agrees; see infrastructure::consume_rate_limit.
async fn guard_rate(state: &AppState, request: &HttpRequest, route: &str) -> Result<(), ApiError> {
    let forwarded = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .unwrap_or("unknown");
    let hash = campussphere_security::hash_token(forwarded);
    let bucket = format!("rust:{}:{}", &hash[..24.min(hash.len())], route);
    let allowed = campussphere_infrastructure::consume_rate_limit(&state.pool, &bucket, 120, 60)
        .await
        .map_err(|_| ApiError::unavailable("Rate limiting is temporarily unavailable."))?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::rate_limited(
            "Too many requests. Try again shortly.",
        ))
    }
}

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Deserialize)]
struct ListQuery {
    limit: Option<i64>,
    category: Option<String>,
    q: Option<String>,
    cursor: Option<String>,
    when: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
}

fn correlation_id(request: &HttpRequest) -> String {
    request
        .headers()
        .get("x-correlation-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.len() >= 8 && value.len() <= 64)
        .map(str::to_string)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
}

fn with_headers(mut response: HttpResponse, correlation: &str) -> HttpResponse {
    response.headers_mut().insert(
        header::HeaderName::from_static("x-correlation-id"),
        header::HeaderValue::from_str(correlation)
            .unwrap_or_else(|_| header::HeaderValue::from_static("unknown")),
    );
    response
}

fn params_from(query: &ListQuery) -> ListParams {
    ListParams {
        limit: query.limit,
        category: query.category.clone(),
        search: query.q.clone(),
        cursor: query.cursor.clone(),
        when: query.when.clone(),
    }
}

static STARTED: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

async fn live() -> impl Responder {
    let started = STARTED.get_or_init(Instant::now);
    HttpResponse::Ok().json(HealthBody {
        status: "ok".into(),
        service: "campussphere-rust-api".into(),
        version: VERSION.into(),
        uptime_seconds: started.elapsed().as_secs(),
    })
}

async fn ready(state: web::Data<AppState>) -> HttpResponse {
    let started = Instant::now();
    if !campussphere_infrastructure::ping(&state.pool).await {
        return HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "status": "unavailable",
            "checks": { "database": { "ok": false } }
        }));
    }
    let migrations = campussphere_infrastructure::migrations_applied(&state.pool)
        .await
        .unwrap_or(0);
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "checks": {
            "database": { "ok": true, "latencyMs": started.elapsed().as_millis() },
            "migrations": { "ok": migrations > 0, "applied": migrations }
        }
    }))
}

async fn clubs(
    request: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<ListQuery>,
) -> Result<HttpResponse, ApiError> {
    let timer = RequestTimer::start("/api/v1/clubs", "GET");
    guard_rate(&state, &request, "/api/v1/clubs").await?;
    let correlation = correlation_id(&request);
    let page = list_clubs(&state, &params_from(&query))
        .await
        .map_err(|error| error.with_correlation(&correlation))?;
    timer.finish(&state.pool, 200);
    Ok(with_headers(
        HttpResponse::Ok()
            .insert_header((header::CACHE_CONTROL, "public, max-age=30, stale-while-revalidate=60"))
            .json(serde_json::json!({ "data": page.items, "meta": { "nextCursor": page.next_cursor } })),
        &correlation,
    ))
}

async fn events(
    request: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<ListQuery>,
) -> Result<HttpResponse, ApiError> {
    let timer = RequestTimer::start("/api/v1/events", "GET");
    guard_rate(&state, &request, "/api/v1/events").await?;
    let correlation = correlation_id(&request);
    let page = list_events(&state, &params_from(&query))
        .await
        .map_err(|error| error.with_correlation(&correlation))?;
    timer.finish(&state.pool, 200);
    Ok(with_headers(
        HttpResponse::Ok()
            .insert_header((header::CACHE_CONTROL, "public, max-age=30, stale-while-revalidate=60"))
            .json(serde_json::json!({ "data": page.items, "meta": { "nextCursor": page.next_cursor } })),
        &correlation,
    ))
}

async fn projects(
    request: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<ListQuery>,
) -> Result<HttpResponse, ApiError> {
    let timer = RequestTimer::start("/api/v1/projects", "GET");
    guard_rate(&state, &request, "/api/v1/projects").await?;
    let correlation = correlation_id(&request);
    let page = list_projects(&state, &params_from(&query))
        .await
        .map_err(|error| error.with_correlation(&correlation))?;
    timer.finish(&state.pool, 200);
    Ok(with_headers(
        HttpResponse::Ok()
            .insert_header((header::CACHE_CONTROL, "public, max-age=30, stale-while-revalidate=60"))
            .json(serde_json::json!({ "data": page.items, "meta": { "nextCursor": page.next_cursor } })),
        &correlation,
    ))
}

async fn search_handler(
    request: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<SearchQuery>,
) -> Result<HttpResponse, ApiError> {
    let timer = RequestTimer::start("/api/v1/search", "GET");
    guard_rate(&state, &request, "/api/v1/search").await?;
    let correlation = correlation_id(&request);
    let term = query.q.clone().unwrap_or_default();
    let kind = query.kind.clone().unwrap_or_else(|| "all".into());
    if !matches!(kind.as_str(), "all" | "clubs" | "projects" | "events") {
        return Err(
            ApiError::bad_request("type must be one of all, clubs, projects, events")
                .with_correlation(&correlation),
        );
    }
    let results = search(&state, &term, &kind)
        .await
        .map_err(|error| error.with_correlation(&correlation))?;
    timer.finish(&state.pool, 200);
    Ok(with_headers(
        HttpResponse::Ok()
            .insert_header((header::CACHE_CONTROL, "no-store"))
            .json(serde_json::json!({ "data": results })),
        &correlation,
    ))
}

fn session_token(request: &HttpRequest) -> Option<String> {
    if let Some(value) = request.headers().get(header::AUTHORIZATION) {
        if let Ok(text) = value.to_str() {
            if let Some(token) = text.strip_prefix("Bearer ") {
                let trimmed = token.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    if let Some(value) = request.headers().get(header::COOKIE) {
        if let Ok(text) = value.to_str() {
            for part in text.split(';') {
                if let Some(token) = part.trim().strip_prefix("cs_session=") {
                    if !token.is_empty() {
                        return Some(token.to_string());
                    }
                }
            }
        }
    }
    None
}

async fn me(request: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, ApiError> {
    let correlation = correlation_id(&request);
    let token = session_token(&request).ok_or_else(|| {
        ApiError::unauthorized("Sign in to continue").with_correlation(&correlation)
    })?;
    let user = session_user(&state, &token)
        .await
        .map_err(|error| error.with_correlation(&correlation))?
        .ok_or_else(|| {
            ApiError::unauthorized("This session has expired").with_correlation(&correlation)
        })?;
    Ok(with_headers(
        HttpResponse::Ok().json(serde_json::json!({ "data": user })),
        &correlation,
    ))
}

async fn index() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "service": "campussphere-rust-api",
        "apiVersion": "v1",
        "mode": "read-only-subset",
        "note": "This API serves the documented read contract. Mutations are refused with 503 while their primary implementation remains in apps/web; see docs/ARCHITECTURE.md.",
        "endpoints": [
            "GET /health/live",
            "GET /health/ready",
            "GET /api/v1/clubs",
            "GET /api/v1/projects",
            "GET /api/v1/events",
            "GET /api/v1/search?q=",
            "GET /api/v1/me"
        ]
    }))
}

/// Anything outside the documented read subset fails loudly and honestly.
async fn unsupported(request: HttpRequest) -> HttpResponse {
    let correlation = correlation_id(&request);
    let body = ApiErrorBody {
        error: ApiErrorDetail {
            code: ApiErrorCode::Unavailable,
            message: format!(
                "{} {} is not part of the Rust API's implemented read subset. No change was made; use the primary mutation service.",
                request.method(),
                request.path()
            ),
            details: None,
            correlation_id: Some(correlation.clone()),
        },
    };
    with_headers(
        HttpResponse::ServiceUnavailable()
            .insert_header((header::CACHE_CONTROL, "no-store"))
            .json(body),
        &correlation,
    )
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let _ = dotenvy::dotenv();
    campussphere_telemetry::init("campussphere-rust-api");

    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        eprintln!("DATABASE_URL is required.");
        std::process::exit(2);
    });
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(8080);
    let site_url = std::env::var("NEXT_PUBLIC_SITE_URL")
        .unwrap_or_else(|_| "http://localhost:3000".to_string());
    let pool = campussphere_infrastructure::connect_with_retry(&database_url, 10, 5)
        .await
        .map_err(|error| {
            eprintln!("Could not connect to PostgreSQL: {error}");
            std::io::Error::other("database unavailable")
        })?;

    let state = web::Data::new(AppState {
        pool: pool.clone(),
        site_url: site_url.clone(),
        secure_cookies: std::env::var("NODE_ENV")
            .map(|value| value == "production")
            .unwrap_or(false),
    });

    tracing::info!(port, "starting campussphere-api on 0.0.0.0");

    HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin(&state.site_url)
            .allowed_methods(vec!["GET", "HEAD", "OPTIONS"])
            .allowed_header(header::AUTHORIZATION)
            .allowed_header(header::CONTENT_TYPE)
            .supports_credentials()
            .max_age(3600);

        App::new()
            .app_data(state.clone())
            .wrap(cors)
            .wrap(actix_web::middleware::Logger::default())
            .wrap(
                actix_web::middleware::DefaultHeaders::new()
                    .add((header::X_CONTENT_TYPE_OPTIONS, "nosniff"))
                    .add((header::REFERRER_POLICY, "no-referrer"))
                    .add((header::X_FRAME_OPTIONS, "DENY"))
                    .add((header::CACHE_CONTROL, "no-store")),
            )
            .service(
                web::scope("/api/v1")
                    .route("/clubs", web::get().to(clubs))
                    .route("/projects", web::get().to(projects))
                    .route("/events", web::get().to(events))
                    .route("/search", web::get().to(search_handler))
                    .route("/me", web::get().to(me))
                    .route("/{tail:.*}", web::to(unsupported)),
            )
            .route("/health/live", web::get().to(live))
            .route("/health/ready", web::get().to(ready))
            .route("/", web::get().to(index))
            .default_service(web::to(unsupported))
    })
    .bind(("0.0.0.0", port))?
    .shutdown_timeout(15)
    .run()
    .await
}
