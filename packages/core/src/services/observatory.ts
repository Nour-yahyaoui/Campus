import type { MetricDefinition, ObservatorySnapshot } from "@campussphere/contracts";
import { getEnv } from "../env";
import { getPool, many, one, iso } from "../db";
import { jobStats } from "../jobs";
import { emailConfigured } from "../email";

/**
 * The System Observatory displays only values it can measure. Anything the
 * provider does not expose (for example Render instance CPU or Neon plan
 * metrics) is reported in `unavailable` with the reason instead of being
 * invented.
 */

async function productMetrics(): Promise<MetricDefinition[]> {
  const row = await one<Record<string, number>>(
    `select
      (select count(*)::int from users where status <> 'deletion_requested') as users,
      (select count(*)::int from users where status = 'active' and last_seen_at > now() - interval '24 hours') as active_24h,
      (select count(*)::int from users where status = 'active' and last_seen_at > now() - interval '7 days') as active_7d,
      (select count(*)::int from users where status = 'active' and last_seen_at > now() - interval '30 days') as active_30d,
      (select count(*)::int from clubs where status = 'active') as clubs,
      (select count(*)::int from club_memberships where status = 'active') as memberships,
      (select count(*)::int from club_memberships where status = 'pending') as pending_memberships,
      (select count(*)::int from projects where status = 'approved') as projects,
      (select count(*)::int from projects where status = 'submitted') as pending_projects,
      (select count(*)::int from events where status in ('published','completed')) as events,
      (select count(*)::int from event_registrations where status in ('registered','attended')) as registrations,
      (select count(*)::int from event_registrations where status = 'attended') as attendance,
      (select count(*)::int from moderation_reports where status in ('open','under_review')) as open_reports`,
  );
  const value = (key: string) => Number(row?.[key] ?? 0);
  return [
    {
      key: "users.total",
      label: "Accounts",
      value: value("users"),
      definition: "Accounts that are active or suspended; accounts pending deletion are excluded.",
    },
    {
      key: "users.active_24h",
      label: "Active accounts (24h)",
      value: value("active_24h"),
      definition: "Accounts with recorded activity in the last 24 hours (last_seen_at).",
    },
    {
      key: "users.active_7d",
      label: "Active accounts (7d)",
      value: value("active_7d"),
      definition: "Accounts with recorded activity in the last 7 days.",
    },
    {
      key: "users.active_30d",
      label: "Active accounts (30d)",
      value: value("active_30d"),
      definition: "Accounts with recorded activity in the last 30 days.",
    },
    {
      key: "clubs.total",
      label: "Clubs",
      value: value("clubs"),
      definition: "Clubs with status active.",
    },
    {
      key: "clubs.memberships",
      label: "Active memberships",
      value: value("memberships"),
      definition: "Club memberships with status active (one per person per club).",
    },
    {
      key: "clubs.pending",
      label: "Pending membership requests",
      value: value("pending_memberships"),
      definition: "Club membership applications waiting for an officer decision.",
    },
    {
      key: "projects.approved",
      label: "Approved projects",
      value: value("projects"),
      definition: "Projects whose proposal was approved by a super-admin.",
    },
    {
      key: "projects.pending",
      label: "Projects awaiting review",
      value: value("pending_projects"),
      definition: "Projects with status submitted.",
    },
    {
      key: "events.total",
      label: "Events",
      value: value("events"),
      definition: "Events that were published (including completed ones).",
    },
    {
      key: "events.registrations",
      label: "Event registrations",
      value: value("registrations"),
      definition: "Registration rows currently confirmed or attended.",
    },
    {
      key: "events.attendance",
      label: "Confirmed attendance",
      value: value("attendance"),
      definition: "Attendees checked in with a single-use code.",
    },
    {
      key: "moderation.open",
      label: "Moderation backlog",
      value: value("open_reports"),
      definition: "Reports with status open or under_review.",
    },
  ];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

export async function observatorySnapshot(): Promise<ObservatorySnapshot> {
  const env = getEnv();
  const windowMinutes = 60;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const apiRow = await one<{
    requests: number;
    errors: number;
    auth_failures: number;
    rate_limited: number;
  }>(
    `select count(*)::int as requests,
            count(*) filter (where status_code >= 400)::int as errors,
            count(*) filter (where status_code = 401 or status_code = 403)::int as auth_failures,
            count(*) filter (where status_code = 429)::int as rate_limited
       from api_metrics where created_at >= $1`,
    [since],
  );
  const routeRows = await many<{
    route: string;
    requests: number;
    errors: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  }>(
    `select route, count(*)::int as requests,
            count(*) filter (where status_code >= 400)::int as errors,
            percentile_cont(0.5) within group (order by duration_ms) as p50,
            percentile_cont(0.95) within group (order by duration_ms) as p95,
            percentile_cont(0.99) within group (order by duration_ms) as p99
       from api_metrics where created_at >= $1
      group by route order by requests desc limit 12`,
    [since],
  );
  const allDurations = await many<{ duration_ms: number }>(
    "select duration_ms from api_metrics where created_at >= $1",
    [since],
  );
  const durations = allDurations.map((row) => row.duration_ms);

  const pool = getPool();
  const pg = await one<{
    active: number | null;
    max_connections: number | null;
    size_bytes: number | null;
  }>(
    `select
       (select count(*)::int from pg_stat_activity where datname = current_database() and state = 'active') as active,
       (select setting::int from pg_settings where name = 'max_connections') as max_connections,
       pg_database_size(current_database())::bigint as size_bytes`,
  ).catch(() => null);
  const migration = await one<{ applied: number; last_applied: Date | null }>(
    "select count(*)::int as applied, max(applied_at) as last_applied from schema_migrations",
  ).catch(() => null);
  const jobs = await jobStats();
  const emailReady = await emailConfigured();
  const emailStats = await one<{ sent: number; failed: number }>(
    `select count(*) filter (where status = 'sent')::int as sent,
            count(*) filter (where status = 'failed')::int as failed
       from outbound_emails where created_at > now() - interval '24 hours'`,
  );

  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const unavailable: Array<{ key: string; reason: string }> = [
    {
      key: "fallback.status",
      reason:
        "The standalone fallback API is not deployed in this environment. Failover is exercised by tests, not by live routing.",
    },
    {
      key: "runtime.host_cpu",
      reason: "The hosting provider's instance CPU/memory are not exposed to the application; use provider metrics.",
    },
    {
      key: "redis",
      reason: "No Redis is configured; rate limiting and the job queue use PostgreSQL.",
    },
  ];
  if (!emailReady) {
    unavailable.push({
      key: "email.delivery",
      reason: `EMAIL_TRANSPORT=${env.EMAIL_TRANSPORT} logs messages instead of delivering them. Configure SMTP or Resend for real delivery.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    environment: env.APP_ENV,
    product: await productMetrics(),
    api: {
      windowMinutes,
      requests: apiRow?.requests ?? 0,
      errors: apiRow?.errors ?? 0,
      errorRate: apiRow && apiRow.requests > 0 ? Number((apiRow.errors / apiRow.requests).toFixed(4)) : 0,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      p99Ms: percentile(durations, 99),
      authFailures: apiRow?.auth_failures ?? 0,
      rateLimited: apiRow?.rate_limited ?? 0,
      byRoute: routeRows.map((row) => ({
        route: row.route,
        requests: row.requests,
        errors: row.errors,
        p95Ms: row.p95 === null ? null : Math.round(Number(row.p95)),
      })),
    },
    runtime: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      pid: process.pid,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      cpuUserMicros: cpu.user,
      cpuSystemMicros: cpu.system,
    },
    database: {
      poolTotal: pool.totalCount,
      poolIdle: pool.idleCount,
      poolWaiting: pool.waitingCount,
      activeConnections: pg?.active ?? null,
      maxConnections: pg?.max_connections ?? null,
      databaseSizeBytes: pg?.size_bytes ?? null,
      migrationsApplied: migration?.applied ?? 0,
      lastMigrationAt: iso(migration?.last_applied ?? null),
    },
    jobs: {
      queued: jobs.queued,
      running: jobs.running,
      failed: jobs.failed,
      dead: jobs.dead,
      oldestQueuedAt: iso(jobs.oldestQueuedAt),
    },
    email: {
      configured: emailReady,
      sentLast24h: emailReady ? (emailStats?.sent ?? 0) : null,
      failedLast24h: emailReady ? (emailStats?.failed ?? 0) : null,
      note: emailReady
        ? "Counts reflect rows recorded by the configured transport."
        : "Messages are logged to the server console in this environment.",
    },
    unavailable,
  };
}

export async function recordRequestMetric(input: {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
}): Promise<void> {
  // Metrics are best-effort and must never break a request.
  await one(
    `insert into api_metrics (route, method, status_code, duration_ms)
     values ($1, $2, $3, $4)`,
    [input.route, input.method, input.statusCode, Math.min(Math.round(input.durationMs), 600_000)],
  ).catch(() => null);
}

/** Public, honest counters shown on the landing page. */
export async function siteStats(): Promise<{
  clubs: number;
  projects: number;
  events: number;
  members: number;
  confirmedAttendance: number;
  asOf: string;
}> {
  const row = await one<Record<string, number>>(
    `select
      (select count(*)::int from clubs where status = 'active') as clubs,
      (select count(*)::int from projects where status = 'approved' and visibility = 'public') as projects,
      (select count(*)::int from events where status in ('published','completed')) as events,
      (select count(*)::int from users where status = 'active') as members,
      (select count(*)::int from event_registrations where status = 'attended') as attendance`,
  );
  return {
    clubs: Number(row?.clubs ?? 0),
    projects: Number(row?.projects ?? 0),
    events: Number(row?.events ?? 0),
    members: Number(row?.members ?? 0),
    confirmedAttendance: Number(row?.attendance ?? 0),
    asOf: new Date().toISOString(),
  };
}
