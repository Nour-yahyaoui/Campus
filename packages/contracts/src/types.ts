import type {
  ApplicationStatus,
  ClubCategory,
  ClubMembershipPolicy,
  ClubMembershipStatus,
  ClubRole,
  EventCategory,
  EventStatus,
  GlobalRole,
  NotificationKind,
  ProjectCategory,
  ProjectStatus,
  RegistrationStatus,
  ReportStatus,
  ReportTarget,
  TaskStatus,
} from "./constants";

export type Uuid = string;
export type IsoDateTime = string;

/* ------------------------------------------------------------------ */
/* Envelopes                                                           */
/* ------------------------------------------------------------------ */

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "internal_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    correlationId?: string;
  };
}

export interface HealthStatus {
  status: "ok" | "degraded" | "unavailable";
  checks?: Record<string, { ok: boolean; latencyMs?: number; detail?: string }>;
  version?: string;
  uptimeSeconds?: number;
}

/* ------------------------------------------------------------------ */
/* Users & sessions                                                    */
/* ------------------------------------------------------------------ */

export interface UserSummary {
  id: Uuid;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
}

export interface Me extends UserSummary {
  email: string;
  emailVerified: boolean;
  roles: GlobalRole[];
  createdAt: IsoDateTime;
  unreadNotifications: number;
}

export interface SessionInfo {
  token: string;
  expiresAt: IsoDateTime;
  user: Me;
}

/* ------------------------------------------------------------------ */
/* Clubs                                                               */
/* ------------------------------------------------------------------ */

export interface ClubSummary {
  id: Uuid;
  slug: string;
  name: string;
  tagline: string | null;
  category: ClubCategory;
  logoUrl: string | null;
  verified: boolean;
  membershipPolicy: ClubMembershipPolicy;
  memberCount: number;
  upcomingEventCount: number;
}

export interface ClubMember {
  userId: Uuid;
  name: string;
  avatarUrl: string | null;
  role: ClubRole;
  joinedAt: IsoDateTime;
}

export interface ClubMembershipView {
  status: ClubMembershipStatus;
  role: ClubRole | null;
}

export interface Announcement {
  id: Uuid;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: IsoDateTime;
  author: UserSummary;
}

export interface ClubDetail extends ClubSummary {
  description: string;
  coverUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  instagramUrl: string | null;
  createdAt: IsoDateTime;
  membership: ClubMembershipView | null;
  officers: ClubMember[];
  announcements: Announcement[];
  upcomingEvents: EventSummary[];
  pastEvents: EventSummary[];
  projects: ProjectSummary[];
}

export interface ClubApplication {
  id: Uuid;
  user: UserSummary;
  status: ClubMembershipStatus;
  message: string | null;
  createdAt: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export interface ProjectRole {
  id: Uuid;
  title: string;
  description: string | null;
  slots: number;
  filled: number;
}

export interface ProjectSummary {
  id: Uuid;
  slug: string;
  title: string;
  summary: string;
  category: ProjectCategory;
  status: ProjectStatus;
  coverUrl: string | null;
  club: { id: Uuid; slug: string; name: string } | null;
  lead: UserSummary;
  memberCount: number;
  openRoles: number;
  createdAt: IsoDateTime;
  approvedAt: IsoDateTime | null;
}

export interface ProjectMember {
  userId: Uuid;
  name: string;
  avatarUrl: string | null;
  role: "lead" | "member";
  joinedAt: IsoDateTime;
}

export interface ProjectApplication {
  id: Uuid;
  projectId: Uuid;
  roleId: Uuid | null;
  roleTitle: string | null;
  user: UserSummary;
  message: string;
  status: ApplicationStatus;
  createdAt: IsoDateTime;
  decidedAt: IsoDateTime | null;
}

export interface ProjectTask {
  id: Uuid;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: UserSummary | null;
  dueDate: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface ProjectMilestone {
  id: Uuid;
  title: string;
  description: string | null;
  dueDate: IsoDateTime | null;
  completedAt: IsoDateTime | null;
}

export interface ProjectUpdate {
  id: Uuid;
  title: string;
  body: string;
  author: UserSummary;
  createdAt: IsoDateTime;
}

export interface ProjectWorkspace {
  tasks: ProjectTask[];
  milestones: ProjectMilestone[];
  applications: ProjectApplication[];
  members: ProjectMember[];
  viewerRole: "lead" | "member";
}

export interface ProjectDetail extends ProjectSummary {
  description: string;
  goals: string | null;
  expectedImpact: string | null;
  timeline: string | null;
  resources: string | null;
  visibility: "public" | "members";
  roles: ProjectRole[];
  members: ProjectMember[];
  updates: ProjectUpdate[];
  myApplication: { id: Uuid; status: ApplicationStatus } | null;
  canReviewApplications: boolean;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export interface EventSummary {
  id: Uuid;
  slug: string;
  title: string;
  summary: string;
  category: EventCategory;
  status: EventStatus;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  timezone: string;
  venueName: string | null;
  isOnline: boolean;
  capacity: number | null;
  registeredCount: number;
  waitlistCount: number;
  coverUrl: string | null;
  club: { id: Uuid; slug: string; name: string } | null;
}

export interface EventRegistrationView {
  id: Uuid;
  status: RegistrationStatus;
  createdAt: IsoDateTime;
  position: number | null;
}

export interface EventDetail extends EventSummary {
  description: string;
  venueAddress: string | null;
  onlineUrl: string | null;
  accessibilityNotes: string | null;
  contactEmail: string | null;
  organizers: UserSummary[];
  registration: EventRegistrationView | null;
  feedback: { rating: number; comment: string | null } | null;
}

export interface EventAttendee {
  registrationId: Uuid;
  user: UserSummary;
  status: RegistrationStatus;
  createdAt: IsoDateTime;
  checkInCode: string | null;
  checkedInAt: IsoDateTime | null;
}

export interface EventFeedback {
  id: Uuid;
  rating: number;
  comment: string | null;
  user: UserSummary;
  createdAt: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* Notifications, moderation, audit                                    */
/* ------------------------------------------------------------------ */

export interface Notification {
  id: Uuid;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface ModerationReport {
  id: Uuid;
  targetType: ReportTarget;
  targetId: Uuid;
  targetLabel: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  reporter: UserSummary;
  createdAt: IsoDateTime;
  resolvedAt: IsoDateTime | null;
  resolutionNotes: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor: UserSummary | null;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: IsoDateTime;
}

export interface AdminUser {
  id: Uuid;
  name: string;
  email: string;
  avatarUrl: string | null;
  roles: GlobalRole[];
  status: "active" | "suspended" | "deletion_requested";
  createdAt: IsoDateTime;
  lastSeenAt: IsoDateTime | null;
}

/* ------------------------------------------------------------------ */
/* Admin overview & observatory                                        */
/* ------------------------------------------------------------------ */

export interface AdminOverview {
  pendingProjects: number;
  pendingEvents: number;
  pendingClubApplications: number;
  openReports: number;
  users: number;
  clubs: number;
  projects: number;
  events: number;
  registrations: number;
  recentAudit: AuditEvent[];
}

export interface MetricDefinition {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  definition: string;
  unavailableReason?: string;
}

export interface ObservatorySnapshot {
  generatedAt: IsoDateTime;
  environment: string;
  product: MetricDefinition[];
  api: {
    windowMinutes: number;
    requests: number;
    errors: number;
    errorRate: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    authFailures: number;
    rateLimited: number;
    byRoute: Array<{
      route: string;
      requests: number;
      errors: number;
      p95Ms: number | null;
    }>;
  };
  runtime: {
    uptimeSeconds: number;
    nodeVersion: string;
    pid: number;
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    cpuUserMicros: number;
    cpuSystemMicros: number;
  };
  database: {
    poolTotal: number;
    poolIdle: number;
    poolWaiting: number;
    activeConnections: number | null;
    maxConnections: number | null;
    databaseSizeBytes: number | null;
    migrationsApplied: number;
    lastMigrationAt: IsoDateTime | null;
  };
  jobs: {
    queued: number;
    running: number;
    failed: number;
    dead: number;
    oldestQueuedAt: IsoDateTime | null;
  };
  email: {
    configured: boolean;
    sentLast24h: number | null;
    failedLast24h: number | null;
    note: string;
  };
  unavailable: Array<{ key: string; reason: string }>;
}

export interface MaintenanceState {
  enabled: boolean;
  message: string | null;
  updatedAt: IsoDateTime | null;
  updatedBy: UserSummary | null;
}

export interface SearchResults {
  query: string;
  clubs: ClubSummary[];
  projects: ProjectSummary[];
  events: EventSummary[];
  total: number;
}

export interface SiteStats {
  clubs: number;
  projects: number;
  events: number;
  members: number;
  confirmedAttendance: number;
  asOf: IsoDateTime;
}

export type MediaKind = (typeof import("./constants").MEDIA_KINDS)[number];

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  url: string;
  contentType: string;
  byteSize: number;
  createdAt: IsoDateTime;
}
