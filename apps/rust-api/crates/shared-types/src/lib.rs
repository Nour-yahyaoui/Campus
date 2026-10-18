//! Wire types shared by the Rust API and documented in `openapi/openapi.yaml`.
//!
//! These mirror `packages/contracts` in the TypeScript workspace. The two
//! implementations are intentionally boring: plain serialisable structs with
//! `camelCase` field names so the frontend can switch backends without
//! translation.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const API_VERSION: &str = "v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApiErrorCode {
    InvalidRequest,
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    RateLimited,
    Unavailable,
    InternalError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorBody {
    pub error: ApiErrorDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorDetail {
    pub code: ApiErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Paginated<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClubCategory {
    Academic,
    Arts,
    Career,
    Cultural,
    Environment,
    Media,
    Sports,
    Technology,
    Volunteering,
    Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProjectCategory {
    Software,
    Robotics,
    Research,
    Volunteering,
    Gardening,
    Creative,
    CampusImprovement,
    Entrepreneurship,
    Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventCategory {
    Academic,
    Arts,
    Career,
    Community,
    Competition,
    Cultural,
    Environment,
    Sports,
    Technology,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubRef {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRef {
    pub id: Uuid,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubSummary {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub tagline: Option<String>,
    pub category: ClubCategory,
    pub logo_url: Option<String>,
    pub verified: bool,
    pub membership_policy: String,
    pub member_count: i64,
    pub upcoming_event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSummary {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub category: EventCategory,
    pub status: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub timezone: String,
    pub venue_name: Option<String>,
    pub is_online: bool,
    pub capacity: Option<i32>,
    pub registered_count: i64,
    pub waitlist_count: i64,
    pub cover_url: Option<String>,
    pub club: Option<ClubRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub category: ProjectCategory,
    pub status: String,
    pub cover_url: Option<String>,
    pub open_roles: i64,
    pub member_count: i64,
    pub lead: UserRef,
    pub club: Option<ClubRef>,
    pub created_at: DateTime<Utc>,
    pub approved_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUser {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub roles: Vec<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthBody {
    pub status: String,
    pub service: String,
    pub version: String,
    pub uptime_seconds: u64,
}
