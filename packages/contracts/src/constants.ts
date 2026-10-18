/**
 * Shared constants. These are part of the public contract between the web
 * frontend, the primary Rust API and the Next.js fallback API. Changing a
 * value here is an API change and must be reflected in the OpenAPI document.
 */

export const API_VERSION = "v1" as const;

export const PRODUCT = {
  name: "CampusSphere",
  tagline: "The student-run home for clubs, projects, and campus events.",
  description:
    "CampusSphere is a free, open-source university community platform. Discover clubs, join student projects, and find events — no account required to browse.",
  creator: "Nour Yahyaoui",
  license: "MIT",
  repository: "https://github.com/Nour-yahyaoui/Campus",
} as const;

export const SESSION_COOKIE = "cs_session";
export const OAUTH_STATE_COOKIE = "cs_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "cs_oauth_verifier";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
export const OAUTH_FLOW_TTL_SECONDS = 60 * 10;

export const LIMITS = {
  pageSizeDefault: 12,
  pageSizeMax: 48,
  clubDescription: 8_000,
  projectDescription: 12_000,
  eventDescription: 10_000,
  announcementBody: 6_000,
  applicationMessage: 1_500,
  bio: 600,
  name: 120,
  taskTitle: 200,
  updateBody: 6_000,
  feedbackComment: 1_000,
  reportDetails: 2_000,
  searchQuery: 120,
  requestBodyBytes: 128 * 1024,
  imageBytes: 5 * 1024 * 1024,
} as const;

/**
 * Image upload targets. Bytes live in S3-compatible object storage; the
 * database only records which asset belongs to which page.
 */
export const MEDIA_KINDS = ["avatar", "club_logo", "club_cover", "project_cover", "event_cover"] as const;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export const EVENT_CATEGORIES = [
  "academic",
  "arts",
  "career",
  "community",
  "competition",
  "cultural",
  "environment",
  "sports",
  "technology",
  "other",
] as const;

export const PROJECT_CATEGORIES = [
  "software",
  "robotics",
  "research",
  "volunteering",
  "gardening",
  "creative",
  "campus-improvement",
  "entrepreneurship",
  "other",
] as const;

export const CLUB_CATEGORIES = [
  "academic",
  "arts",
  "career",
  "cultural",
  "environment",
  "media",
  "sports",
  "technology",
  "volunteering",
  "other",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export type ClubCategory = (typeof CLUB_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic",
  arts: "Arts & culture",
  career: "Career",
  community: "Community",
  competition: "Competition",
  cultural: "Cultural",
  environment: "Environment",
  media: "Media",
  sports: "Sports",
  technology: "Technology",
  volunteering: "Volunteering",
  software: "Software",
  robotics: "Robotics",
  research: "Research",
  gardening: "Gardening",
  creative: "Creative",
  "campus-improvement": "Campus improvement",
  entrepreneurship: "Entrepreneurship",
  other: "Other",
};

export const CLUB_MEMBERSHIP_POLICIES = ["open", "request", "invite"] as const;
export type ClubMembershipPolicy = (typeof CLUB_MEMBERSHIP_POLICIES)[number];

export const CLUB_ROLES = ["member", "officer", "president"] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];

export const GLOBAL_ROLES = ["student", "moderator", "super_admin"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const CLUB_MEMBERSHIP_STATUSES = ["pending", "active", "rejected", "left"] as const;
export type ClubMembershipStatus = (typeof CLUB_MEMBERSHIP_STATUSES)[number];

export const PROJECT_STATUSES = [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const EVENT_STATUSES = [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "published",
  "cancelled",
  "completed",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const REGISTRATION_STATUSES = [
  "registered",
  "waitlisted",
  "cancelled",
  "attended",
  "no_show",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const APPLICATION_STATUSES = ["pending", "accepted", "declined", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const REPORT_STATUSES = ["open", "under_review", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_TARGETS = ["club", "project", "event", "user", "announcement"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const NOTIFICATION_KINDS = [
  "club_application_decided",
  "club_application_received",
  "project_application_decided",
  "project_application_received",
  "project_decision",
  "event_decision",
  "event_registration_confirmed",
  "event_waitlisted",
  "event_promoted",
  "event_reminder",
  "event_cancelled",
  "announcement",
  "system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.dev_login",
  "auth.session_revoked",
  "user.profile_updated",
  "user.role_granted",
  "user.role_revoked",
  "user.suspended",
  "user.reactivated",
  "user.deletion_requested",
  "user.data_exported",
  "club.created",
  "club.updated",
  "club.membership_requested",
  "club.membership_approved",
  "club.membership_rejected",
  "club.membership_left",
  "club.member_role_changed",
  "club.announcement_published",
  "project.created",
  "project.updated",
  "project.submitted",
  "project.decision",
  "project.application_submitted",
  "project.application_decided",
  "project.member_removed",
  "project.task_created",
  "project.task_updated",
  "project.milestone_created",
  "project.update_published",
  "event.created",
  "event.updated",
  "event.submitted",
  "event.decision",
  "event.published",
  "event.cancelled",
  "event.registration_created",
  "event.registration_cancelled",
  "event.registration_promoted",
  "event.check_in",
  "event.feedback_submitted",
  "moderation.report_created",
  "moderation.report_resolved",
  "admin.maintenance_changed",
  "admin.bootstrap_superadmin",
  "admin.data_exported",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
