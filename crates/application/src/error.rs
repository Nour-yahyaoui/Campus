use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use campussphere_shared_types::{ApiErrorBody, ApiErrorCode, ApiErrorDetail};
use std::fmt;

/// Errors are safe to serialise: they never include SQL, connection strings or
/// stack traces. The correlation id ties the response to the server log line.
#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: ApiErrorCode,
    pub message: String,
    pub correlation_id: Option<String>,
}

impl ApiError {
    fn new(status: StatusCode, code: ApiErrorCode, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            correlation_id: None,
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, ApiErrorCode::InvalidRequest, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, ApiErrorCode::Unauthorized, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, ApiErrorCode::NotFound, message)
    }

    pub fn rate_limited(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, ApiErrorCode::RateLimited, message)
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(
            StatusCode::SERVICE_UNAVAILABLE,
            ApiErrorCode::Unavailable,
            message,
        )
    }

    pub fn with_correlation(mut self, correlation_id: impl Into<String>) -> Self {
        self.correlation_id = Some(correlation_id.into());
        self
    }
}

impl std::error::Error for ApiError {}

impl fmt::Display for ApiError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.status, self.message)
    }
}

impl ResponseError for ApiError {
    fn status_code(&self) -> StatusCode {
        self.status
    }

    fn error_response(&self) -> HttpResponse {
        let body = ApiErrorBody {
            error: ApiErrorDetail {
                code: self.code.clone(),
                message: self.message.clone(),
                details: None,
                correlation_id: self.correlation_id.clone(),
            },
        };
        HttpResponse::build(self.status)
            .insert_header(("content-type", "application/json; charset=utf-8"))
            .insert_header(("cache-control", "no-store"))
            .json(body)
    }
}
