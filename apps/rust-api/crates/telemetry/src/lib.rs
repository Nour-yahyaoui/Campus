//! Logging and request metrics.
//!
//! Metrics are written to the same `api_metrics` table the Next.js fallback
//! uses, so the System Observatory can show one honest picture regardless of
//! which backend served a request. Writes are best-effort and never fail a
//! request.

use sqlx::PgPool;
use std::time::Instant;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init(service: &str) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,campussphere=debug,actix_web=info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_current_span(true),
        )
        .init();
    tracing::info!(service, "telemetry initialised");
}

pub struct RequestTimer {
    started: Instant,
    route: &'static str,
    method: &'static str,
}

impl RequestTimer {
    pub fn start(route: &'static str, method: &'static str) -> Self {
        Self {
            started: Instant::now(),
            route,
            method,
        }
    }

    pub fn finish(self, pool: &PgPool, status_code: u16) {
        let duration_ms = self.started.elapsed().as_millis().min(600_000) as i32;
        let pool = pool.clone();
        let route = self.route.to_string();
        let method = self.method.to_string();
        tokio::spawn(async move {
            let result = sqlx::query(
                "insert into api_metrics (route, method, status_code, duration_ms)
                 values ($1, $2, $3, $4)",
            )
            .bind(route)
            .bind(method)
            .bind(status_code as i32)
            .bind(duration_ms)
            .execute(&pool)
            .await;
            if let Err(error) = result {
                tracing::warn!(%error, "failed to record request metric");
            }
        });
    }
}
