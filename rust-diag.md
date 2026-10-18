# Rust diagnostics

## cargo generate-lockfile
`exit=0`
```
[1m[92m    Updating[0m crates.io index
[1m[92m     Locking[0m 289 packages to highest compatible versions
[1m[92m      Adding[0m base64 v0.22.1 [1m[33m(available: v0.23.1)[0m
[1m[92m      Adding[0m brotli-decompressor v6.0.1 [1m[33m(available: v6.1.0)[0m
[1m[92m      Adding[0m generic-array v0.14.7 [1m[33m(available: v0.14.9)[0m
[1m[92m      Adding[0m rand v0.8.8 [1m[33m(available: v0.10.3)[0m
[1m[92m      Adding[0m sha2 v0.10.9 [1m[33m(available: v0.11.1)[0m
[1m[92m      Adding[0m sqlx v0.8.6 [1m[33m(available: v0.9.0)[0m
[1m[92m      Adding[0m thiserror v1.0.69 [1m[33m(available: v2.0.21)[0m
```
## cargo fmt --check
`exit=1`
```diff
Diff in /home/runner/work/Campus/Campus/apps/rust-api/src/main.rs:11:
 use actix_cors::Cors;
 use actix_web::http::header;
 use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, Responder};
-use campussphere_application::{list_clubs, list_events, list_projects, search, session_user, ApiError, AppState, ListParams};
-use campussphere_shared_types::{ApiErrorCode, ApiErrorDetail, ApiErrorBody, HealthBody};
+use campussphere_application::{
+    list_clubs, list_events, list_projects, search, session_user, ApiError, AppState, ListParams,
+};
+use campussphere_shared_types::{ApiErrorBody, ApiErrorCode, ApiErrorDetail, HealthBody};
 use campussphere_telemetry::RequestTimer;
 use serde::Deserialize;
 use std::time::Instant;
Diff in /home/runner/work/Campus/Campus/apps/rust-api/src/main.rs:35:
     if allowed {
         Ok(())
     } else {
-        Err(ApiError::rate_limited("Too many requests. Try again shortly."))
+        Err(ApiError::rate_limited(
+            "Too many requests. Try again shortly.",
+        ))
     }
 }
 
Diff in /home/runner/work/Campus/Campus/apps/rust-api/src/main.rs:189:
     let term = query.q.clone().unwrap_or_default();
     let kind = query.kind.clone().unwrap_or_else(|| "all".into());
     if !matches!(kind.as_str(), "all" | "clubs" | "projects" | "events") {
-        return Err(ApiError::bad_request("type must be one of all, clubs, projects, events")
-            .with_correlation(&correlation));
+        return Err(
+            ApiError::bad_request("type must be one of all, clubs, projects, events")
+                .with_correlation(&correlation),
+        );
     }
     let results = search(&state, &term, &kind)
         .await
Diff in /home/runner/work/Campus/Campus/apps/rust-api/src/main.rs:231:
 
 async fn me(request: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, ApiError> {
     let correlation = correlation_id(&request);
-    let token = session_token(&request)
-        .ok_or_else(|| ApiError::unauthorized("Sign in to continue").with_correlation(&correlation))?;
+    let token = session_token(&request).ok_or_else(|| {
+        ApiError::unauthorized("Sign in to continue").with_correlation(&correlation)
+    })?;
     let user = session_user(&state, &token)
         .await
         .map_err(|error| error.with_correlation(&correlation))?
Diff in /home/runner/work/Campus/Campus/apps/rust-api/src/main.rs:239:
-        .ok_or_else(|| ApiError::unauthorized("This session has expired").with_correlation(&correlation))?;
+        .ok_or_else(|| {
+            ApiError::unauthorized("This session has expired").with_correlation(&correlation)
+        })?;
     Ok(with_headers(
         HttpResponse::Ok().json(serde_json::json!({ "data": user })),
         &correlation,
Diff in /home/runner/work/Campus/Campus/apps/rust-api/src/main.rs:309:
     let state = web::Data::new(AppState {
         pool: pool.clone(),
         site_url: site_url.clone(),
-        secure_cookies: std::env::var("NODE_ENV").map(|value| value == "production").unwrap_or(false),
+        secure_cookies: std::env::var("NODE_ENV")
+            .map(|value| value == "production")
+            .unwrap_or(false),
     });
 
     tracing::info!(port, "starting campussphere-api on 0.0.0.0");
Diff in /home/runner/work/Campus/Campus/crates/application/src/error.rs:23:
     }
 
     pub fn bad_request(message: impl Into<String>) -> Self {
-        Self::new(StatusCode::BAD_REQUEST, ApiErrorCode::InvalidRequest, message)
+        Self::new(
+            StatusCode::BAD_REQUEST,
+            ApiErrorCode::InvalidRequest,
+            message,
+        )
     }
 
     pub fn unauthorized(message: impl Into<String>) -> Self {
Diff in /home/runner/work/Campus/Campus/crates/application/src/error.rs:30:
-        Self::new(StatusCode::UNAUTHORIZED, ApiErrorCode::Unauthorized, message)
+        Self::new(
+            StatusCode::UNAUTHORIZED,
+            ApiErrorCode::Unauthorized,
+            message,
+        )
     }
 
     pub fn not_found(message: impl Into<String>) -> Self {
Diff in /home/runner/work/Campus/Campus/crates/application/src/error.rs:35:
     }
 
     pub fn rate_limited(message: impl Into<String>) -> Self {
-        Self::new(StatusCode::TOO_MANY_REQUESTS, ApiErrorCode::RateLimited, message)
+        Self::new(
+            StatusCode::TOO_MANY_REQUESTS,
+            ApiErrorCode::RateLimited,
+            message,
+        )
     }
 
     pub fn unavailable(message: impl Into<String>) -> Self {
Diff in /home/runner/work/Campus/Campus/crates/application/src/lib.rs:96:
     }
 }
 
-pub async fn list_clubs(state: &AppState, params: &ListParams) -> Result<Paginated<ClubSummary>, ApiError> {
+pub async fn list_clubs(
+    state: &AppState,
+    params: &ListParams,
+) -> Result<Paginated<ClubSummary>, ApiError> {
     let limit = limit_or_default(params.limit);
     let rows = campussphere_infrastructure::list_clubs(
         &state.pool,
Diff in /home/runner/work/Campus/Campus/crates/application/src/lib.rs:136:
     Ok(Paginated { items, next_cursor })
 }
 
-pub async fn list_events(state: &AppState, params: &ListParams) -> Result<Paginated<EventSummary>, ApiError> {
+pub async fn list_events(
+    state: &AppState,
+    params: &ListParams,
+) -> Result<Paginated<EventSummary>, ApiError> {
     use sqlx::Row;
     let limit = limit_or_default(params.limit);
     let when = params.when.as_deref().unwrap_or("upcoming");
Diff in /home/runner/work/Campus/Campus/crates/application/src/lib.rs:174:
             ends_at: row.get("ends_at"),
             timezone: row.get("timezone"),
             venue_name: row.get("venue_name"),
-            is_online: row.get::<Option<String>, _>("online_url").is_some() && row.get::<Option<String>, _>("venue_name").is_none(),
+            is_online: row.get::<Option<String>, _>("online_url").is_some()
+                && row.get::<Option<String>, _>("venue_name").is_none(),
             capacity: row.get("capacity"),
             registered_count: row.get("registered_count"),
             waitlist_count: row.get("waitlist_count"),
Diff in /home/runner/work/Campus/Campus/crates/application/src/lib.rs:191:
     Ok(Paginated { items, next_cursor })
 }
 
-pub async fn list_projects(state: &AppState, params: &ListParams) -> Result<Paginated<ProjectSummary>, ApiError> {
+pub async fn list_projects(
+    state: &AppState,
+    params: &ListParams,
+) -> Result<Paginated<ProjectSummary>, ApiError> {
     use sqlx::Row;
     let limit = limit_or_default(params.limit);
     let rows = campussphere_infrastructure::list_projects(
Diff in /home/runner/work/Campus/Campus/crates/application/src/lib.rs:301:
 
 /// Session tokens arrive as `Authorization: Bearer …` (server-to-server) or as
 /// the HttpOnly cookie (browser). Only the hash is compared in the database.
-pub async fn session_user(state: &AppState, raw_token: &str) -> Result<Option<SessionUser>, ApiError> {
+pub async fn session_user(
+    state: &AppState,
+    raw_token: &str,
+) -> Result<Option<SessionUser>, ApiError> {
     if raw_token.len() < 20 || raw_token.len() > 200 {
         return Ok(None);
     }
Diff in /home/runner/work/Campus/Campus/crates/domain/src/lib.rs:38:
     waitlist_enabled: bool,
     existing: Option<RegistrationState>,
 ) -> Result<RegistrationOutcome, CapacityError> {
-    if matches!(existing, Some(RegistrationState::Registered | RegistrationState::Attended | RegistrationState::Waitlisted)) {
+    if matches!(
+        existing,
+        Some(
+            RegistrationState::Registered
+                | RegistrationState::Attended
+                | RegistrationState::Waitlisted
+        )
+    ) {
         return Err(CapacityError::AlreadyRegistered);
     }
     match capacity {
Diff in /home/runner/work/Campus/Campus/crates/domain/src/lib.rs:89:
 }
 
 /// Feedback opens when the event has ended and stays open for a fortnight.
-pub fn feedback_window(starts_at: DateTime<Utc>, ends_at: DateTime<Utc>, now: DateTime<Utc>) -> Result<(), &'static str> {
+pub fn feedback_window(
+    starts_at: DateTime<Utc>,
+    ends_at: DateTime<Utc>,
+    now: DateTime<Utc>,
+) -> Result<(), &'static str> {
     if starts_at > ends_at {
         return Err("This event's start time is after its end time.");
     }
Diff in /home/runner/work/Campus/Campus/crates/domain/src/lib.rs:119:
     if trimmed.is_empty() {
         "item".to_string()
     } else {
-        trimmed.chars().take(80).collect::<String>().trim_end_matches('-').to_string()
+        trimmed
+            .chars()
+            .take(80)
+            .collect::<String>()
+            .trim_end_matches('-')
+            .to_string()
     }
 }
 
Diff in /home/runner/work/Campus/Campus/crates/domain/src/lib.rs:144:
 
     #[test]
     fn capacity_is_never_overbooked() {
-        assert_eq!(decide_registration(Some(3), 2, false, None), Ok(RegistrationOutcome::Registered));
-        assert_eq!(decide_registration(Some(3), 3, true, None), Ok(RegistrationOutcome::Waitlisted));
         assert_eq!(
+            decide_registration(Some(3), 2, false, None),
+            Ok(RegistrationOutcome::Registered)
+        );
+        assert_eq!(
+            decide_registration(Some(3), 3, true, None),
+            Ok(RegistrationOutcome::Waitlisted)
+        );
+        assert_eq!(
             decide_registration(Some(3), 3, false, None),
             Err(CapacityError::CapacityExhausted)
         );
Diff in /home/runner/work/Campus/Campus/crates/domain/src/lib.rs:153:
-        assert_eq!(decide_registration(None, 9_999, false, None), Ok(RegistrationOutcome::Registered));
+        assert_eq!(
+            decide_registration(None, 9_999, false, None),
+            Ok(RegistrationOutcome::Registered)
+        );
     }
 
     #[test]
Diff in /home/runner/work/Campus/Campus/crates/domain/src/lib.rs:181:
 
     #[test]
     fn slugs_are_stable_and_readable() {
-        assert_eq!(slugify("Solar charging bench for the courtyard!"), "solar-charging-bench-for-the-courtyard");
+        assert_eq!(
+            slugify("Solar charging bench for the courtyard!"),
+            "solar-charging-bench-for-the-courtyard"
+        );
         assert_eq!(slugify("  Café — Société  "), "caf-soci-t");
         assert_eq!(slugify("***"), "item");
         assert_eq!(slugify("A".repeat(200).as_str()).len(), 80);
Diff in /home/runner/work/Campus/Campus/crates/infrastructure/src/lib.rs:60:
 
 pub async fn list_clubs(pool: &PgPool, query: ClubListQuery<'_>) -> StoreResult<Vec<PgRow>> {
     let limit = query.limit.clamp(1, MAX_PAGE_SIZE) + 1;
-    let pattern = query.search.map(|value| format!("%{}%", value.replace('%', "\\%")));
+    let pattern = query
+        .search
+        .map(|value| format!("%{}%", value.replace('%', "\\%")));
     let rows = sqlx::query(
         r#"
         select c.id, c.slug, c.name, c.tagline, c.category::text as category,
Diff in /home/runner/work/Campus/Campus/crates/infrastructure/src/lib.rs:99:
 
 pub async fn list_events(pool: &PgPool, query: EventListQuery<'_>) -> StoreResult<Vec<PgRow>> {
     let limit = query.limit.clamp(1, MAX_PAGE_SIZE) + 1;
-    let pattern = query.search.map(|value| format!("%{}%", value.replace('%', "\\%")));
+    let pattern = query
+        .search
+        .map(|value| format!("%{}%", value.replace('%', "\\%")));
     let rows = sqlx::query(
         r#"
         select e.id, e.slug, e.title, e.summary, e.category::text as category, e.status::text as status,
Diff in /home/runner/work/Campus/Campus/crates/infrastructure/src/lib.rs:142:
 
 pub async fn list_projects(pool: &PgPool, query: ProjectListQuery<'_>) -> StoreResult<Vec<PgRow>> {
     let limit = query.limit.clamp(1, MAX_PAGE_SIZE) + 1;
-    let pattern = query.search.map(|value| format!("%{}%", value.replace('%', "\\%")));
+    let pattern = query
+        .search
+        .map(|value| format!("%{}%", value.replace('%', "\\%")));
     let rows = sqlx::query(
         r#"
         select p.id, p.slug, p.title, p.summary, p.category::text as category, p.status::text as status,
Diff in /home/runner/work/Campus/Campus/crates/telemetry/src/lib.rs:14:
         .unwrap_or_else(|_| EnvFilter::new("info,campussphere=debug,actix_web=info"));
     tracing_subscriber::registry()
         .with(filter)
-        .with(tracing_subscriber::fmt::layer().json().with_current_span(true))
+        .with(
+            tracing_subscriber::fmt::layer()
+                .json()
+                .with_current_span(true),
+        )
         .init();
     tracing::info!(service, "telemetry initialised");
 }
```
## cargo build -p campussphere-api
`exit=101`
```
[1m[92m Downloading[0m crates ...
[1m[92m  Downloaded[0m actix-codec v0.5.4
[1m[92m  Downloaded[0m actix-router v0.5.4
[1m[92m  Downloaded[0m actix-macros v0.2.5
[1m[92m  Downloaded[0m atoi v2.0.0
[1m[92m  Downloaded[0m equivalent v1.0.3
[1m[92m  Downloaded[0m bytestring v1.5.1
[1m[92m  Downloaded[0m block-buffer v0.12.1
[1m[92m  Downloaded[0m tokio-macros v2.7.2
[1m[92m  Downloaded[0m tokio-stream v0.1.19
[1m[92m  Downloaded[0m impl-more v0.3.10
[1m[92m  Downloaded[0m futures-io v0.3.34
[1m[92m  Downloaded[0m fnv v1.0.7
[1m[92m  Downloaded[0m alloc-no-stdlib v3.0.0
[1m[92m  Downloaded[0m crypto-common v0.2.2
[1m[92m  Downloaded[0m crc v3.4.0
[1m[92m  Downloaded[0m idna_adapter v1.2.2
[1m[92m  Downloaded[0m home v0.5.12
[1m[92m  Downloaded[0m unicode-xid v0.2.6
[1m[92m  Downloaded[0m zerofrom v0.1.8
[1m[92m  Downloaded[0m form_urlencoded v1.2.2
[1m[92m  Downloaded[0m hex v0.4.3
[1m[92m  Downloaded[0m actix-rt v2.15.0
[1m[92m  Downloaded[0m actix-service v2.0.3
[1m[92m  Downloaded[0m byteorder v1.5.0
[1m[92m  Downloaded[0m dotenvy v0.15.7
[1m[92m  Downloaded[0m block-buffer v0.10.4
[1m[92m  Downloaded[0m cfg-if v1.0.5
[1m[92m  Downloaded[0m cpufeatures v0.3.1
[1m[92m  Downloaded[0m adler2 v2.0.1
[1m[92m  Downloaded[0m actix-utils v3.0.2
[1m[92m  Downloaded[0m local-channel v0.1.5
[1m[92m  Downloaded[0m cpufeatures v0.2.17
[1m[92m  Downloaded[0m itoa v1.0.18
[1m[92m  Downloaded[0m alloc-stdlib v0.3.0
[1m[92m  Downloaded[0m futures-core v0.3.34
[1m[92m  Downloaded[0m base64ct v1.8.3
[1m[92m  Downloaded[0m crossbeam-queue v0.3.14
[1m[92m  Downloaded[0m crypto-common v0.1.7
[1m[92m  Downloaded[0m digest v0.10.7
[1m[92m  Downloaded[0m actix-cors v0.7.2
[1m[92m  Downloaded[0m errno v0.3.14
[1m[92m  Downloaded[0m actix-web-codegen v4.4.0
[1m[92m  Downloaded[0m find-msvc-tools v0.1.14
[1m[92m  Downloaded[0m deranged v0.5.9
[1m[92m  Downloaded[0m httpdate v1.0.3
[1m[92m  Downloaded[0m futures-task v0.3.34
[1m[92m  Downloaded[0m generic-array v0.14.7
[1m[92m  Downloaded[0m sha1 v0.11.0
[1m[92m  Downloaded[0m futures-sink v0.3.34
[1m[92m  Downloaded[0m tracing-serde v0.2.0
[1m[92m  Downloaded[0m untrusted v0.9.0
[1m[92m  Downloaded[0m zerofrom-derive v0.1.8
[1m[92m  Downloaded[0m matchers v0.2.0
[1m[92m  Downloaded[0m autocfg v1.5.1
[1m[92m  Downloaded[0m version_check v0.9.5
[1m[92m  Downloaded[0m crc-catalog v2.5.0
[1m[92m  Downloaded[0m chacha20 v0.10.2
[1m[92m  Downloaded[0m core_detect v1.0.0
[1m[92m  Downloaded[0m either v1.19.0
[1m[92m  Downloaded[0m heck v0.5.0
[1m[92m  Downloaded[0m foldhash v0.2.0
[1m[92m  Downloaded[0m const-oid v0.10.2
[1m[92m  Downloaded[0m httparse v1.10.1
[1m[92m  Downloaded[0m time-core v0.1.9
[1m[92m  Downloaded[0m foldhash v0.1.5
[1m[92m  Downloaded[0m utf8_iter v1.0.4
[1m[92m  Downloaded[0m lazy_static v1.5.1
[1m[92m  Downloaded[0m percent-encoding v2.3.2
[1m[92m  Downloaded[0m potential_utf v0.1.6
[1m[92m  Downloaded[0m yoke-derive v0.8.4
[1m[92m  Downloaded[0m futures-executor v0.3.34
[1m[92m  Downloaded[0m hashlink v0.10.0
[1m[92m  Downloaded[0m scopeguard v1.2.0
[1m[92m  Downloaded[0m convert_case v0.10.0
[1m[92m  Downloaded[0m digest v0.11.3
[1m[92m  Downloaded[0m displaydoc v0.2.7
[1m[92m  Downloaded[0m num-conv v0.2.2
[1m[92m  Downloaded[0m serde_urlencoded v0.7.1
[1m[92m  Downloaded[0m const-oid v0.9.6
[1m[92m  Downloaded[0m crossbeam-utils v0.8.23
[1m[92m  Downloaded[0m semver v1.0.28
[1m[92m  Downloaded[0m signal-hook-registry v1.4.8
[1m[92m  Downloaded[0m slab v0.4.12
[1m[92m  Downloaded[0m sqlx-macros-core v0.8.6
[1m[92m  Downloaded[0m sha1 v0.10.7
[1m[92m  Downloaded[0m event-listener v5.4.2
[1m[92m  Downloaded[0m futures-channel v0.3.34
[1m[92m  Downloaded[0m thread_local v1.1.10
[1m[92m  Downloaded[0m hybrid-array v0.4.15
[1m[92m  Downloaded[0m iana-time-zone v0.1.65
[1m[92m  Downloaded[0m allocator-api2 v0.2.21
[1m[92m  Downloaded[0m bitflags v2.13.2
[1m[92m  Downloaded[0m cookie v0.16.2
[1m[92m  Downloaded[0m crc32fast v1.5.2
[1m[92m  Downloaded[0m getrandom v0.4.3
[1m[92m  Downloaded[0m spki v0.7.3
[1m[92m  Downloaded[0m rand_chacha v0.3.1
[1m[92m  Downloaded[0m local-waker v0.1.4
[1m[92m  Downloaded[0m multiversion_no_op v1.0.0
[1m[92m  Downloaded[0m num-iter v0.1.46
[1m[92m  Downloaded[0m md-5 v0.10.6
[1m[92m  Downloaded[0m parking v2.2.1
[1m[92m  Downloaded[0m powerfmt v0.2.1
[1m[92m  Downloaded[0m mime v0.3.17
[1m[92m  Downloaded[0m stable_deref_trait v1.2.1
[1m[92m  Downloaded[0m simd-adler32 v0.3.10
[1m[92m  Downloaded[0m simdutf8 v0.1.5
[1m[92m  Downloaded[0m tracing-log v0.2.0
[1m[92m  Downloaded[0m actix-server v2.10.0
[1m[92m  Downloaded[0m getrandom v0.2.17
[1m[92m  Downloaded[0m hmac v0.12.1
[1m[92m  Downloaded[0m icu_provider v2.3.1
[1m[92m  Downloaded[0m sha2 v0.10.9
[1m[92m  Downloaded[0m smallvec v1.16.3
[1m[92m  Downloaded[0m sqlx-macros v0.8.6
[1m[92m  Downloaded[0m subtle v2.6.1
[1m[92m  Downloaded[0m bytes v1.12.1
[1m[92m  Downloaded[0m icu_locale_core v2.3.0
[1m[92m  Downloaded[0m signature v2.2.0
[1m[92m  Downloaded[0m base64 v0.22.1
[1m[92m  Downloaded[0m flate2 v1.1.10
[1m[92m  Downloaded[0m icu_normalizer_data v2.3.0
[1m[92m  Downloaded[0m thiserror v2.0.21
[1m[92m  Downloaded[0m thiserror-impl v2.0.21
[1m[92m  Downloaded[0m der v0.7.10
[1m[92m  Downloaded[0m derive_more v2.1.1
[1m[92m  Downloaded[0m futures-intrusive v0.5.0
[1m[92m  Downloaded[0m serde_core v1.0.229
[1m[92m  Downloaded[0m spin v0.9.9
[1m[92m  Downloaded[0m tinyvec v1.13.3
[1m[92m  Downloaded[0m num-integer v0.1.47
[1m[92m  Downloaded[0m pkg-config v0.3.34
[1m[92m  Downloaded[0m rustc_version v0.4.1
[1m[92m  Downloaded[0m pin-project-lite v0.2.17
[1m[92m  Downloaded[0m webpki-roots v0.26.11
[1m[92m  Downloaded[0m writeable v0.6.4
[1m[92m  Downloaded[0m lock_api v0.4.14
[1m[92m  Downloaded[0m flume v0.11.1
[1m[92m  Downloaded[0m serde_derive v1.0.229
[1m[92m  Downloaded[0m time-macros v0.2.32
[1m[92m  Downloaded[0m derive_more-impl v2.1.1
[1m[92m  Downloaded[0m icu_collections v2.3.0
[1m[92m  Downloaded[0m shlex v2.0.1
[1m[92m  Downloaded[0m socket2 v0.6.5
[1m[92m  Downloaded[0m stringprep v0.1.5
[1m[92m  Downloaded[0m tinystr v0.8.4
[1m[92m  Downloaded[0m http v0.2.12
[1m[92m  Downloaded[0m icu_properties v2.3.0
[1m[92m  Downloaded[0m serde v1.0.229
[1m[92m  Downloaded[0m actix-http v3.19.0
[1m[92m  Downloaded[0m cc v1.8.0
[1m[92m  Downloaded[0m futures-util v0.3.34
[1m[92m  Downloaded[0m idna v1.1.0
[1m[92m  Downloaded[0m hashbrown v0.15.5
[1m[92m  Downloaded[0m hashbrown v0.17.1
[1m[92m  Downloaded[0m icu_properties_data v2.3.0
[1m[92m  Downloaded[0m sqlx-sqlite v0.8.6
[1m[92m  Downloaded[0m sqlx-postgres v0.8.6
[1m[92m  Downloaded[0m aho-corasick v1.1.5
[1m[92m  Downloaded[0m h2 v0.3.27
[1m[92m  Downloaded[0m hkdf v0.12.4
[1m[92m  Downloaded[0m serde_json v1.0.154
[1m[92m  Downloaded[0m sqlx v0.8.6
[1m[92m  Downloaded[0m whoami v1.6.1
[1m[92m  Downloaded[0m zeroize v1.9.1
[1m[92m  Downloaded[0m nu-ansi-term v0.50.3
[1m[92m  Downloaded[0m rustversion v1.0.23
[1m[92m  Downloaded[0m zerovec-derive v0.11.6
[1m[92m  Downloaded[0m quote v1.0.47
[1m[92m  Downloaded[0m thiserror-impl v1.0.69
[1m[92m  Downloaded[0m zmij v1.0.23
[1m[92m  Downloaded[0m pkcs8 v0.10.2
[1m[92m  Downloaded[0m ppv-lite86 v0.2.21
[1m[92m  Downloaded[0m rand_core v0.10.1
[1m[92m  Downloaded[0m yoke v0.8.3
[1m[92m  Downloaded[0m log v0.4.34
[1m[92m  Downloaded[0m once_cell v1.21.4
[1m[92m  Downloaded[0m thiserror v1.0.69
[1m[92m  Downloaded[0m jobserver v0.1.35
[1m[92m  Downloaded[0m tracing-attributes v0.1.31
[1m[92m  Downloaded[0m litemap v0.8.3
[1m[92m  Downloaded[0m unicode-ident v1.0.27
[1m[92m  Downloaded[0m parking_lot_core v0.9.12
[1m[92m  Downloaded[0m chrono v0.4.45
[1m[92m  Downloaded[0m sqlx-core v0.8.6
[1m[92m  Downloaded[0m actix-web v4.17.0
[1m[92m  Downloaded[0m brotli-decompressor v6.0.1
[1m[92m  Downloaded[0m time v0.3.55
[1m[92m  Downloaded[0m syn v2.0.119
[1m[92m  Downloaded[0m icu_normalizer v2.3.0
[1m[92m  Downloaded[0m encoding_rs v0.8.42
[1m[92m  Downloaded[0m brotli v9.0.0
[1m[92m  Downloaded[0m parking_lot v0.12.5
[1m[92m  Downloaded[0m unicode-properties v0.1.4
[1m[92m  Downloaded[0m pem-rfc7468 v0.7.0
[1m[92m  Downloaded[0m rand_core v0.6.4
[1m[92m  Downloaded[0m language-tags v0.3.2
[1m[92m  Downloaded[0m tracing-core v0.1.36
[1m[92m  Downloaded[0m pkcs1 v0.7.5
[1m[92m  Downloaded[0m unicode-bidi v0.3.18
[1m[92m  Downloaded[0m zstd-safe v8.2.0
[1m[92m  Downloaded[0m ryu v1.0.23
[1m[92m  Downloaded[0m rustls-pki-types v1.15.1
[1m[92m  Downloaded[0m proc-macro2 v1.0.107
[1m[92m  Downloaded[0m num-traits v0.2.19
[1m[92m  Downloaded[0m sharded-slab v0.1.7
[1m[92m  Downloaded[0m synstructure v0.14.0
[1m[92m  Downloaded[0m uuid v1.28.0
[1m[92m  Downloaded[0m zstd v0.14.3
[1m[92m  Downloaded[0m rustls-webpki v0.103.15
[1m[92m  Downloaded[0m tokio-util v0.7.20
[1m[92m  Downloaded[0m zerotrie v0.2.5
[1m[92m  Downloaded[0m rand v0.8.8
[1m[92m  Downloaded[0m miniz_oxide v0.9.1
[1m[92m  Downloaded[0m rsa v0.9.10
[1m[92m  Downloaded[0m memchr v2.8.3
[1m[92m  Downloaded[0m mio v1.2.4
[1m[92m  Downloaded[0m url v2.5.8
[1m[92m  Downloaded[0m rand v0.10.3
[1m[92m  Downloaded[0m regex-lite v0.1.9
[1m[92m  Downloaded[0m typenum v1.20.1
[1m[92m  Downloaded[0m sqlx-mysql v0.8.6
[1m[92m  Downloaded[0m unicode-segmentation v1.13.3
[1m[92m  Downloaded[0m indexmap v2.14.2
[1m[92m  Downloaded[0m unicode-normalization v0.1.26
[1m[92m  Downloaded[0m zerovec v0.11.8
[1m[92m  Downloaded[0m libm v0.2.16
[1m[92m  Downloaded[0m num-bigint-dig v0.8.6
[1m[92m  Downloaded[0m regex v1.13.1
[1m[92m  Downloaded[0m tracing-subscriber v0.3.23
[1m[92m  Downloaded[0m webpki-roots v1.0.9
[1m[92m  Downloaded[0m zlib-rs v0.6.8
[1m[92m  Downloaded[0m vcpkg v0.2.15
[1m[92m  Downloaded[0m syn v3.0.9
[1m[92m  Downloaded[0m zerocopy v0.8.63
[1m[92m  Downloaded[0m regex-syntax v0.8.11
[1m[92m  Downloaded[0m rustls v0.23.46
[1m[92m  Downloaded[0m tracing v0.1.44
[1m[92m  Downloaded[0m regex-automata v0.4.18
[1m[92m  Downloaded[0m zstd-sys v2.1.2+zstd.1.5.7
[1m[92m  Downloaded[0m tokio v1.53.3
[1m[92m  Downloaded[0m libc v0.2.191
[1m[92m  Downloaded[0m ring v0.17.14
[1m[92m  Downloaded[0m libsqlite3-sys v0.30.1
[1m[92m   Compiling[0m proc-macro2 v1.0.107
[1m[92m   Compiling[0m quote v1.0.47
[1m[92m   Compiling[0m unicode-ident v1.0.27
[1m[92m   Compiling[0m libc v0.2.191
[1m[92m   Compiling[0m cfg-if v1.0.5
[1m[92m   Compiling[0m serde_core v1.0.229
[1m[92m   Compiling[0m serde v1.0.229
[1m[92m   Compiling[0m version_check v0.9.5
[1m[92m   Compiling[0m pin-project-lite v0.2.17
[1m[92m   Compiling[0m syn v3.0.9
[1m[92m   Compiling[0m generic-array v0.14.7
[1m[92m   Compiling[0m once_cell v1.21.4
[1m[92m   Compiling[0m syn v2.0.119
[1m[92m   Compiling[0m jobserver v0.1.35
[1m[92m   Compiling[0m futures-core v0.3.34
[1m[92m   Compiling[0m shlex v2.0.1
[1m[92m   Compiling[0m bytes v1.12.1
[1m[92m   Compiling[0m find-msvc-tools v0.1.14
[1m[92m   Compiling[0m cc v1.8.0
[1m[92m   Compiling[0m memchr v2.8.3
[1m[92m   Compiling[0m stable_deref_trait v1.2.1
[1m[92m   Compiling[0m scopeguard v1.2.0
[1m[92m   Compiling[0m parking_lot_core v0.9.12
[1m[92m   Compiling[0m typenum v1.20.1
[1m[92m   Compiling[0m synstructure v0.14.0
[1m[92m   Compiling[0m lock_api v0.4.14
[1m[92m   Compiling[0m socket2 v0.6.5
[1m[92m   Compiling[0m log v0.4.34
[1m[92m   Compiling[0m writeable v0.6.4
[1m[92m   Compiling[0m litemap v0.8.3
[1m[92m   Compiling[0m itoa v1.0.18
[1m[92m   Compiling[0m getrandom v0.2.17
[1m[92m   Compiling[0m icu_properties_data v2.3.0
[1m[92m   Compiling[0m percent-encoding v2.3.2
[1m[92m   Compiling[0m icu_normalizer_data v2.3.0
[1m[92m   Compiling[0m utf8_iter v1.0.4
[1m[92m   Compiling[0m autocfg v1.5.1
[1m[92m   Compiling[0m errno v0.3.14
[1m[92m   Compiling[0m tracing-core v0.1.36
[1m[92m   Compiling[0m num-traits v0.2.19
[1m[92m   Compiling[0m serde_derive v1.0.229
[1m[92m   Compiling[0m zerofrom-derive v0.1.8
[1m[92m   Compiling[0m yoke-derive v0.8.4
[1m[92m   Compiling[0m zerovec-derive v0.11.6
[1m[92m   Compiling[0m zerofrom v0.1.8
[1m[92m   Compiling[0m displaydoc v0.2.7
[1m[92m   Compiling[0m yoke v0.8.3
[1m[92m   Compiling[0m tracing-attributes v0.1.31
[1m[92m   Compiling[0m zerovec v0.11.8
[1m[92m   Compiling[0m zerotrie v0.2.5
[1m[92m   Compiling[0m tinystr v0.8.4
[1m[92m   Compiling[0m potential_utf v0.1.6
[1m[92m   Compiling[0m icu_locale_core v2.3.0
[1m[92m   Compiling[0m icu_collections v2.3.0
[1m[92m   Compiling[0m equivalent v1.0.3
[1m[92m   Compiling[0m zmij v1.0.23
[1m[92m   Compiling[0m futures-io v0.3.34
[1m[92m   Compiling[0m futures-task v0.3.34
[1m[92m   Compiling[0m tokio-macros v2.7.2
[1m[92m   Compiling[0m signal-hook-registry v1.4.8
[1m[92m   Compiling[0m icu_provider v2.3.1
[1m[92m   Compiling[0m icu_properties v2.3.0
[1m[92m   Compiling[0m mio v1.2.4
[1m[92m   Compiling[0m ring v0.17.14
[1m[92m   Compiling[0m smallvec v1.16.3
[1m[92m   Compiling[0m icu_normalizer v2.3.0
[1m[92m   Compiling[0m futures-sink v0.3.34
[1m[92m   Compiling[0m serde_json v1.0.154
[1m[92m   Compiling[0m parking_lot v0.12.5
[1m[92m   Compiling[0m zeroize v1.9.1
[1m[92m   Compiling[0m tokio v1.53.3
[1m[92m   Compiling[0m rustls-pki-types v1.15.1
[1m[92m   Compiling[0m idna_adapter v1.2.2
[1m[92m   Compiling[0m rand_core v0.10.1
[1m[92m   Compiling[0m hashbrown v0.17.1
[1m[92m   Compiling[0m getrandom v0.4.3
[1m[92m   Compiling[0m zerocopy v0.8.63
[1m[92m   Compiling[0m indexmap v2.14.2
[1m[92m   Compiling[0m idna v1.1.0
[1m[92m   Compiling[0m tracing v0.1.44
[1m[92m   Compiling[0m untrusted v0.9.0
[1m[92m   Compiling[0m iana-time-zone v0.1.65
[1m[92m   Compiling[0m subtle v2.6.1
[1m[92m   Compiling[0m block-buffer v0.10.4
[1m[92m   Compiling[0m crypto-common v0.1.7
[1m[92m   Compiling[0m crossbeam-utils v0.8.23
[1m[92m   Compiling[0m cpufeatures v0.2.17
[1m[92m   Compiling[0m rustls v0.23.46
[1m[92m   Compiling[0m digest v0.10.7
[1m[92m   Compiling[0m rustls-webpki v0.103.15
[1m[92m   Compiling[0m rand_core v0.6.4
[1m[92m   Compiling[0m bitflags v2.13.2
[1m[92m   Compiling[0m foldhash v0.1.5
[1m[92m   Compiling[0m thiserror v2.0.21
[1m[92m   Compiling[0m slab v0.4.12
[1m[92m   Compiling[0m allocator-api2 v0.2.21
[1m[92m   Compiling[0m futures-util v0.3.34
[1m[92m   Compiling[0m hashbrown v0.15.5
[1m[92m   Compiling[0m webpki-roots v1.0.9
[1m[92m   Compiling[0m thiserror-impl v2.0.21
[1m[92m   Compiling[0m parking v2.2.1
[1m[92m   Compiling[0m ppv-lite86 v0.2.21
[1m[92m   Compiling[0m crc-catalog v2.5.0
[1m[92m   Compiling[0m crc v3.4.0
[1m[92m   Compiling[0m event-listener v5.4.2
[1m[92m   Compiling[0m rand_chacha v0.3.1
[1m[92m   Compiling[0m webpki-roots v0.26.11
[1m[92m   Compiling[0m hashlink v0.10.0
[1m[92m   Compiling[0m crossbeam-queue v0.3.14
[1m[92m   Compiling[0m futures-intrusive v0.5.0
[1m[92m   Compiling[0m either v1.19.0
[1m[92m   Compiling[0m form_urlencoded v1.2.2
[1m[92m   Compiling[0m pkg-config v0.3.34
[1m[92m   Compiling[0m tinyvec v1.13.3
[1m[92m   Compiling[0m unicode-normalization v0.1.26
[1m[92m   Compiling[0m zstd-sys v2.1.2+zstd.1.5.7
[1m[92m   Compiling[0m aho-corasick v1.1.5
[1m[92m   Compiling[0m base64 v0.22.1
[1m[92m   Compiling[0m hex v0.4.3
[1m[92m   Compiling[0m unicode-bidi v0.3.18
[1m[92m   Compiling[0m unicode-properties v0.1.4
[1m[92m   Compiling[0m regex-syntax v0.8.11
[1m[92m   Compiling[0m rustversion v1.0.23
[1m[92m   Compiling[0m stringprep v0.1.5
[1m[92m   Compiling[0m regex-automata v0.4.18
[1m[92m   Compiling[0m tokio-stream v0.1.19
[1m[92m   Compiling[0m url v2.5.8
[1m[92m   Compiling[0m hmac v0.12.1
[1m[92m   Compiling[0m sha2 v0.10.9
[1m[92m   Compiling[0m uuid v1.28.0
[1m[92m   Compiling[0m chrono v0.4.45
[1m[92m   Compiling[0m atoi v2.0.0
[1m[92m   Compiling[0m hybrid-array v0.4.15
[1m[92m   Compiling[0m dotenvy v0.15.7
[1m[92m   Compiling[0m byteorder v1.5.0
[1m[92m   Compiling[0m home v0.5.12
[1m[92m   Compiling[0m whoami v1.6.1
[1m[92m   Compiling[0m hkdf v0.12.4
[1m[92m   Compiling[0m sqlx-core v0.8.6
[1m[92m   Compiling[0m futures-channel v0.3.34
[1m[92m   Compiling[0m rand v0.8.8
[1m[92m   Compiling[0m md-5 v0.10.6
[1m[92m   Compiling[0m bytestring v1.5.1
[1m[92m   Compiling[0m crc32fast v1.5.2
[1m[92m   Compiling[0m alloc-no-stdlib v3.0.0
[1m[92m   Compiling[0m zstd-safe v8.2.0
[1m[92m   Compiling[0m unicode-segmentation v1.13.3
[1m[92m   Compiling[0m fnv v1.0.7
[1m[92m   Compiling[0m cpufeatures v0.3.1
[1m[92m   Compiling[0m http v0.2.12
[1m[92m   Compiling[0m convert_case v0.10.0
[1m[92m   Compiling[0m sqlx-postgres v0.8.6
[1m[92m   Compiling[0m alloc-stdlib v0.3.0
[1m[92m   Compiling[0m encoding_rs v0.8.42
[1m[92m   Compiling[0m crypto-common v0.2.2
```
## cargo clippy
`exit=101`
```
[1m[92m    Checking[0m cfg-if v1.0.5
[1m[92m   Compiling[0m libc v0.2.191
[1m[92m    Checking[0m serde_core v1.0.229
[1m[92m    Checking[0m typenum v1.20.1
[1m[92m   Compiling[0m jobserver v0.1.35
[1m[92m    Checking[0m pin-project-lite v0.2.17
[1m[92m    Checking[0m memchr v2.8.3
[1m[92m   Compiling[0m cc v1.8.0
[1m[92m   Compiling[0m zerofrom v0.1.8
[1m[92m    Checking[0m stable_deref_trait v1.2.1
[1m[92m    Checking[0m log v0.4.34
[1m[92m   Compiling[0m yoke v0.8.3
[1m[92m    Checking[0m serde v1.0.229
[1m[92m    Checking[0m futures-core v0.3.34
[1m[92m    Checking[0m scopeguard v1.2.0
[1m[92m    Checking[0m once_cell v1.21.4
[1m[92m    Checking[0m bytes v1.12.1
[1m[92m    Checking[0m smallvec v1.16.3
[1m[92m    Checking[0m parking_lot_core v0.9.12
[1m[92m    Checking[0m lock_api v0.4.14
[1m[92m    Checking[0m zerovec v0.11.8
[1m[92m    Checking[0m parking_lot v0.12.5
[1m[92m    Checking[0m tracing-core v0.1.36
[1m[92m    Checking[0m errno v0.3.14
[1m[92m   Compiling[0m ring v0.17.14
[1m[92m    Checking[0m rand_core v0.10.1
[1m[92m    Checking[0m itoa v1.0.18
[1m[92m    Checking[0m signal-hook-registry v1.4.8
[1m[92m    Checking[0m mio v1.2.4
[1m[92m    Checking[0m socket2 v0.6.5
[1m[92m    Checking[0m futures-sink v0.3.34
[1m[92m   Compiling[0m generic-array v0.14.7
[1m[92m    Checking[0m tokio v1.53.3
[1m[92m    Checking[0m getrandom v0.4.3
[1m[92m   Compiling[0m tinystr v0.8.4
[1m[92m   Compiling[0m litemap v0.8.3
[1m[92m   Compiling[0m writeable v0.6.4
[1m[92m    Checking[0m icu_locale_core v2.3.0
[1m[92m    Checking[0m tracing v0.1.44
[1m[92m   Compiling[0m potential_utf v0.1.6
[1m[92m    Checking[0m zerotrie v0.2.5
[1m[92m    Checking[0m getrandom v0.2.17
[1m[92m    Checking[0m subtle v2.6.1
[1m[92m    Checking[0m utf8_iter v1.0.4
[1m[92m   Compiling[0m icu_provider v2.3.1
[1m[92m    Checking[0m icu_collections v2.3.0
[1m[92m    Checking[0m block-buffer v0.10.4
[1m[92m    Checking[0m crypto-common v0.1.7
[1m[92m    Checking[0m equivalent v1.0.3
[1m[92m    Checking[0m percent-encoding v2.3.2
[1m[92m   Compiling[0m zeroize v1.9.1
[1m[92m   Compiling[0m rustls v0.23.46
[1m[92m   Compiling[0m digest v0.10.7
[1m[92m   Compiling[0m rustls-pki-types v1.15.1
[1m[92m    Checking[0m zmij v1.0.23
[1m[92m    Checking[0m num-traits v0.2.19
[1m[92m    Checking[0m icu_properties_data v2.3.0
[1m[92m    Checking[0m icu_normalizer_data v2.3.0
[1m[92m    Checking[0m futures-io v0.3.34
[1m[92m    Checking[0m futures-task v0.3.34
[1m[92m    Checking[0m slab v0.4.12
[1m[92m    Checking[0m serde_json v1.0.154
[1m[92m   Compiling[0m icu_properties v2.3.0
[1m[92m    Checking[0m futures-util v0.3.34
[1m[92m   Compiling[0m icu_normalizer v2.3.0
[1m[92m    Checking[0m iana-time-zone v0.1.65
[1m[92m    Checking[0m hashbrown v0.17.1
[1m[92m   Compiling[0m untrusted v0.9.0
[1m[92m    Checking[0m indexmap v2.14.2
[1m[92m    Checking[0m idna_adapter v1.2.2
[1m[92m    Checking[0m chrono v0.4.45
[1m[92m    Checking[0m form_urlencoded v1.2.2
[1m[92m    Checking[0m uuid v1.28.0
[1m[92m   Compiling[0m zerocopy v0.8.63
[1m[92m   Compiling[0m allocator-api2 v0.2.21
[1m[92m   Compiling[0m foldhash v0.1.5
[1m[92m   Compiling[0m hashbrown v0.15.5
[1m[92m   Compiling[0m rustls-webpki v0.103.15
[1m[92m   Compiling[0m ppv-lite86 v0.2.21
[1m[92m   Compiling[0m idna v1.1.0
[1m[92m   Compiling[0m webpki-roots v1.0.9
[1m[92m   Compiling[0m rand_core v0.6.4
[1m[92m   Compiling[0m crossbeam-utils v0.8.23
[1m[92m    Checking[0m base64 v0.22.1
[1m[92m   Compiling[0m cpufeatures v0.2.17
[1m[92m   Compiling[0m parking v2.2.1
[1m[92m   Compiling[0m tinyvec v1.13.3
[1m[92m    Checking[0m bitflags v2.13.2
[1m[92m   Compiling[0m crc-catalog v2.5.0
[1m[92m   Compiling[0m crc v3.4.0
[1m[92m   Compiling[0m unicode-normalization v0.1.26
[1m[92m   Compiling[0m event-listener v5.4.2
[1m[92m    Checking[0m sha2 v0.10.9
[1m[92m   Compiling[0m tokio-stream v0.1.19
[1m[92m   Compiling[0m crossbeam-queue v0.3.14
[1m[92m    Checking[0m rand_chacha v0.3.1
[1m[92m    Checking[0m url v2.5.8
[1m[92m   Compiling[0m webpki-roots v0.26.11
[1m[92m   Compiling[0m futures-intrusive v0.5.0
[1m[92m   Compiling[0m hashlink v0.10.0
[1m[92m   Compiling[0m thiserror v2.0.21
[1m[92m   Compiling[0m hmac v0.12.1
[1m[92m   Compiling[0m either v1.19.0
[1m[92m    Checking[0m aho-corasick v1.1.5
[1m[92m    Checking[0m regex-syntax v0.8.11
[1m[92m   Compiling[0m unicode-bidi v0.3.18
[1m[92m   Compiling[0m unicode-properties v0.1.4
[1m[92m   Compiling[0m zstd-sys v2.1.2+zstd.1.5.7
[1m[92m   Compiling[0m stringprep v0.1.5
[1m[92m   Compiling[0m hkdf v0.12.4
[1m[92m   Compiling[0m rand v0.8.8
[1m[92m    Checking[0m regex-automata v0.4.18
[1m[92m   Compiling[0m futures-channel v0.3.34
[1m[92m   Compiling[0m atoi v2.0.0
[1m[92m   Compiling[0m md-5 v0.10.6
[1m[92m   Compiling[0m whoami v1.6.1
[1m[92m   Compiling[0m home v0.5.12
[1m[92m   Compiling[0m byteorder v1.5.0
[1m[92m   Compiling[0m dotenvy v0.15.7
[1m[92m    Checking[0m hex v0.4.3
[1m[92m   Compiling[0m sqlx-core v0.8.6
[1m[92m   Compiling[0m sqlx-postgres v0.8.6
[1m[92m    Checking[0m hybrid-array v0.4.15
[1m[92m    Checking[0m alloc-no-stdlib v3.0.0
[1m[92m    Checking[0m fnv v1.0.7
[1m[92m    Checking[0m cpufeatures v0.3.1
[1m[92m    Checking[0m http v0.2.12
[1m[92m    Checking[0m alloc-stdlib v0.3.0
[1m[92m    Checking[0m crypto-common v0.2.2
[1m[92m    Checking[0m block-buffer v0.12.1
[1m[92m    Checking[0m tokio-util v0.7.20
[1m[92m    Checking[0m local-waker v0.1.4
[1m[92m    Checking[0m const-oid v0.10.2
[1m[92m   Compiling[0m sqlx-macros-core v0.8.6
[1m[92m    Checking[0m adler2 v2.0.1
[1m[92m   Compiling[0m num-conv v0.2.2
[1m[92m   Compiling[0m time-core v0.1.9
[1m[92m    Checking[0m simd-adler32 v0.3.10
[1m[92m   Compiling[0m time-macros v0.2.32
[1m[92m    Checking[0m miniz_oxide v0.9.1
[1m[92m    Checking[0m digest v0.11.3
[1m[92m    Checking[0m crc32fast v1.5.2
[1m[92m    Checking[0m brotli-decompressor v6.0.1
[1m[92m   Compiling[0m sqlx-macros v0.8.6
[1m[92m    Checking[0m chacha20 v0.10.2
[1m[92m   Compiling[0m bytestring v1.5.1
[1m[92m    Checking[0m actix-service v2.0.3
[1m[92m    Checking[0m deranged v0.5.9
[1m[92m    Checking[0m simdutf8 v0.1.5
[1m[92m    Checking[0m sqlx v0.8.6
[1m[92m    Checking[0m core_detect v1.0.0
[1m[92m    Checking[0m powerfmt v0.2.1
[1m[92m   Compiling[0m regex-lite v0.1.9
[1m[92m    Checking[0m encoding_rs v0.8.42
[1m[92m    Checking[0m time v0.3.55
[1m[92m   Compiling[0m actix-router v0.5.4
[1m[92m    Checking[0m rand v0.10.3
[1m[92m    Checking[0m brotli v9.0.0
[1m[92m    Checking[0m flate2 v1.1.10
[1m[92m    Checking[0m sha1 v0.11.0
[1m[92m    Checking[0m httparse v1.10.1
[1m[92m    Checking[0m derive_more v2.1.1
[1m[92m    Checking[0m local-channel v0.1.5
[1m[92m    Checking[0m actix-utils v3.0.2
[1m[92m    Checking[0m actix-codec v0.5.4
[1m[92m    Checking[0m h2 v0.3.27
[1m[92m    Checking[0m regex v1.13.1
[1m[92m    Checking[0m actix-rt v2.15.0
[1m[92m    Checking[0m language-tags v0.3.2
[1m[92m   Compiling[0m zstd-safe v8.2.0
[1m[92m    Checking[0m zstd v0.14.3
[1m[92m    Checking[0m foldhash v0.2.0
[1m[92m    Checking[0m mime v0.3.17
[1m[92m    Checking[0m httpdate v1.0.3
[1m[92m    Checking[0m ryu v1.0.23
[1m[92m    Checking[0m serde_urlencoded v0.7.1
[1m[92m    Checking[0m thiserror v1.0.69
[1m[92m    Checking[0m actix-server v2.10.0
[1m[92m    Checking[0m cookie v0.16.2
[1m[92m   Compiling[0m actix-web-codegen v4.4.0
[1m[92m    Checking[0m campussphere-shared-types v0.1.0 (/home/runner/work/Campus/Campus/crates/shared-types)
[1m[92m    Checking[0m impl-more v0.3.10
[1m[92m    Checking[0m lazy_static v1.5.1
[1m[92m    Checking[0m matchers v0.2.0
[1m[92m    Checking[0m sharded-slab v0.1.7
[1m[92m    Checking[0m tracing-serde v0.2.0
[1m[92m    Checking[0m tracing-log v0.2.0
[1m[92m    Checking[0m thread_local v1.1.10
[1m[92m    Checking[0m nu-ansi-term v0.50.3
[1m[92m    Checking[0m campussphere-infrastructure v0.1.0 (/home/runner/work/Campus/Campus/crates/infrastructure)
[1m[92m    Checking[0m campussphere-security v0.1.0 (/home/runner/work/Campus/Campus/crates/security)
[1m[92m    Checking[0m campussphere-domain v0.1.0 (/home/runner/work/Campus/Campus/crates/domain)
[1m[92m    Checking[0m tracing-subscriber v0.3.23
[1m[92m    Checking[0m actix-http v3.19.0
[1m[92m    Checking[0m campussphere-telemetry v0.1.0 (/home/runner/work/Campus/Campus/crates/telemetry)
[1m[92m    Checking[0m actix-web v4.17.0
[1m[92m    Checking[0m actix-cors v0.7.2
[1m[92m    Checking[0m campussphere-application v0.1.0 (/home/runner/work/Campus/Campus/crates/application)
[1m[91merror[E0433][0m[1m: cannot find module or crate `tracing` in this scope[0m
   [1m[94m--> [0mcrates/application/src/lib.rs:330:9
    [1m[94m|[0m
[1m[94m330[0m [1m[94m|[0m         tracing::error!(error = %error, "database failure");
    [1m[94m|[0m         [1m[91m^^^^^^^[0m [1m[91muse of unresolved module or unlinked crate `tracing`[0m

[1mFor more information about this error, try `rustc --explain E0433`.[0m
[1m[91merror[0m: could not compile `campussphere-application` (lib) due to 1 previous error
[1m[33mwarning[0m: build failed, waiting for other jobs to finish...
[1m[91merror[0m: could not compile `campussphere-application` (lib test) due to 1 previous error
```
## cargo test
`exit=101`
```
[1m[92m   Compiling[0m campussphere-application v0.1.0 (/home/runner/work/Campus/Campus/crates/application)
[1m[92m   Compiling[0m campussphere-telemetry v0.1.0 (/home/runner/work/Campus/Campus/crates/telemetry)
[1m[92m   Compiling[0m campussphere-infrastructure v0.1.0 (/home/runner/work/Campus/Campus/crates/infrastructure)
[1m[91merror[E0433][0m[1m: cannot find module or crate `tracing` in this scope[0m
   [1m[94m--> [0mcrates/application/src/lib.rs:330:9
    [1m[94m|[0m
[1m[94m330[0m [1m[94m|[0m         tracing::error!(error = %error, "database failure");
    [1m[94m|[0m         [1m[91m^^^^^^^[0m [1m[91muse of unresolved module or unlinked crate `tracing`[0m

[1mFor more information about this error, try `rustc --explain E0433`.[0m
[1m[91merror[0m: could not compile `campussphere-application` (lib) due to 1 previous error
[1m[33mwarning[0m: build failed, waiting for other jobs to finish...
[1m[91merror[0m: could not compile `campussphere-application` (lib test) due to 1 previous error
```
