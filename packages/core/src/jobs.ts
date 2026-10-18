import { randomUUID } from "node:crypto";
import { getEnv } from "./env";
import { many, one, query } from "./db";
import { sendEmail } from "./email";
import { pruneRateLimits } from "./ratelimit";

/**
 * Durable job queue backed by PostgreSQL. Delivery-critical work (email,
 * reminders, waitlist promotion) is always a row in `jobs`, never an
 * in-process timer. Workers claim jobs with FOR UPDATE SKIP LOCKED so several
 * instances can run concurrently without double processing.
 */

export type JobKind =
  | "email"
  | "event.reminder"
  | "cleanup.maintenance"
  | "maintenance.recurring";

export interface Job {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function enqueue(
  kind: JobKind,
  payload: Record<string, unknown> = {},
  options: { runAt?: Date; maxAttempts?: number } = {},
): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into jobs (kind, payload, run_at, max_attempts)
     values ($1, $2, $3, $4) returning id`,
    [kind, JSON.stringify(payload), options.runAt ?? new Date(), options.maxAttempts ?? 5],
  );
  return row!.id;
}

export async function enqueueEmail(to: string, subject: string, text: string): Promise<string> {
  return enqueue("email", { to, subject, text }, { maxAttempts: 6 });
}

export async function claimNext(workerId: string): Promise<Job | null> {
  const row = await one<{
    id: string;
    kind: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }>(
    `update jobs j
        set status = 'running', locked_by = $1, locked_at = now(), attempts = j.attempts + 1
      where j.id = (
        select id from jobs
         where status = 'queued' and run_at <= now()
         order by run_at asc
         for update skip locked
         limit 1
      )
      returning j.id, j.kind, j.payload, j.attempts, j.max_attempts`,
    [workerId],
  );
  if (!row) return null;
  return { ...row, payload: row.payload ?? {} };
}

export async function completeJob(id: string): Promise<void> {
  await query("update jobs set status = 'done', finished_at = now() where id = $1", [id]);
}

export async function failJob(job: Job, cause: unknown): Promise<void> {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (job.attempts >= job.max_attempts) {
    await query(
      `update jobs set status = 'dead', last_error = $2, finished_at = now() where id = $1`,
      [job.id, message.slice(0, 2000)],
    );
    return;
  }
  const backoffSeconds = Math.min(3600, 2 ** job.attempts) + Math.floor(Math.random() * 5);
  await query(
    `update jobs
        set status = 'queued', last_error = $2, locked_by = null, locked_at = null,
            run_at = now() + ($3 || ' seconds')::interval
      where id = $1`,
    [job.id, message.slice(0, 2000), String(backoffSeconds)],
  );
}

/** Requeue jobs whose worker died mid-flight. */
export async function recoverStaleJobs(): Promise<number> {
  const result = await query(
    `update jobs set status = 'queued', locked_by = null, locked_at = null
      where status = 'running' and locked_at < now() - interval '10 minutes'`,
  );
  return result.rowCount ?? 0;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

async function handleEmail(payload: Record<string, unknown>, jobId: string): Promise<void> {
  const to = typeof payload.to === "string" ? payload.to : null;
  const subject = typeof payload.subject === "string" ? payload.subject : null;
  const text = typeof payload.text === "string" ? payload.text : null;
  if (!to || !subject || !text) throw new Error("email job is missing fields");
  await sendEmail({ to, subject, text }, jobId);
}

/**
 * Finds published events starting in roughly 24 hours and queues one durable
 * email job per attendee. `reminder_sent_at` makes the scan idempotent even if
 * two workers run it concurrently.
 */
async function handleEventReminders(): Promise<void> {
  const events = await many<{
    id: string;
    title: string;
    slug: string;
    starts_at: Date;
    venue_name: string | null;
    timezone: string;
  }>(
    `update events e
        set reminder_sent_at = now()
      where e.status = 'published'
        and e.reminder_sent_at is null
        and e.starts_at between now() + interval '23 hours' and now() + interval '25 hours'
      returning e.id, e.title, e.slug, e.starts_at, e.venue_name, e.timezone`,
  );
  for (const event of events) {
    const attendees = await many<{ email: string; name: string }>(
      `select u.email, u.name
         from event_registrations r join users u on u.id = r.user_id
        where r.event_id = $1 and r.status in ('registered', 'attended')`,
      [event.id],
    );
    for (const attendee of attendees) {
      await enqueueEmail(
        attendee.email,
        `Reminder: ${event.title}`,
        `Hi ${attendee.name},\n\n${event.title} starts ${event.starts_at.toISOString()} (${event.timezone}).\n` +
          `${event.venue_name ? `Venue: ${event.venue_name}\n` : ""}` +
          `Details: /events/${event.slug}\n\nSee you there.`,
      );
    }
  }
}

/**
 * Periodic housekeeping. Each statement is bounded and index-backed. Running
 * this in the durable worker keeps request handlers free of maintenance work.
 */
async function handleCleanup(): Promise<void> {
  const env = getEnv();
  await query("delete from sessions where expires_at < now() - interval '7 days'");
  await query("delete from oauth_states where expires_at < now() - interval '1 day'");
  await query("delete from sign_in_tickets where expires_at < now() - interval '1 day'");
  await query("delete from jobs where status in ('done', 'dead') and finished_at < now() - interval '14 days'");
  await query("delete from outbound_emails where created_at < now() - interval '30 days'");
  await query(`delete from api_metrics where created_at < now() - ($1 || ' days')::interval`, [
    String(env.METRICS_RETENTION_DAYS),
  ]);
  await pruneRateLimits();
  // Nobody still "registered" 24h after an event ended actually attended.
  await query(
    `update event_registrations r
        set status = 'no_show'
       from events e
      where r.event_id = e.id and r.status = 'registered'
        and e.ends_at < now() - interval '24 hours'`,
  );
}

/** Ensures the maintenance job exists exactly once per interval window. */
export async function scheduleMaintenance(): Promise<void> {
  await query(
    `insert into jobs (kind, payload, run_at)
     select 'cleanup.maintenance', '{}'::jsonb, now()
      where not exists (
        select 1 from jobs
         where kind = 'cleanup.maintenance' and status in ('queued', 'running')
      )`,
  );
  await query(
    `insert into jobs (kind, payload, run_at)
     select 'event.reminder', '{}'::jsonb, now()
      where not exists (
        select 1 from jobs where kind = 'event.reminder' and status in ('queued', 'running')
      )`,
  );
}

export async function runJob(job: Job): Promise<void> {
  switch (job.kind) {
    case "email":
      await handleEmail(job.payload, job.id);
      return;
    case "event.reminder":
      await handleEventReminders();
      return;
    case "cleanup.maintenance":
      await handleCleanup();
      return;
    default:
      throw new Error(`Unknown job kind: ${job.kind}`);
  }
}

/**
 * Processes up to `max` jobs. Returns how many were handled so callers can
 * decide to keep draining. Used by the worker loop and by integration tests.
 */
export async function drainJobs(max = 20, workerId = `worker-${randomUUID()}`): Promise<number> {
  let handled = 0;
  for (let index = 0; index < max; index += 1) {
    const job = await claimNext(workerId);
    if (!job) break;
    try {
      await runJob(job);
      await completeJob(job.id);
    } catch (error) {
      await failJob(job, error);
      console.error(`[jobs] ${job.kind} failed (attempt ${job.attempts})`, error instanceof Error ? error.message : error);
    }
    handled += 1;
  }
  return handled;
}

export async function jobStats(): Promise<{
  queued: number;
  running: number;
  failed: number;
  dead: number;
  oldestQueuedAt: Date | null;
}> {
  const row = await one<{
    queued: number;
    running: number;
    failed: number;
    dead: number;
    oldest_queued_at: Date | null;
  }>(
    `select
       count(*) filter (where status = 'queued')::int as queued,
       count(*) filter (where status = 'running')::int as running,
       count(*) filter (where status = 'failed')::int as failed,
       count(*) filter (where status = 'dead')::int as dead,
       min(created_at) filter (where status = 'queued') as oldest_queued_at
     from jobs`,
  );
  return {
    queued: row?.queued ?? 0,
    running: row?.running ?? 0,
    failed: row?.failed ?? 0,
    dead: row?.dead ?? 0,
    oldestQueuedAt: row?.oldest_queued_at ?? null,
  };
}

/**
 * Standalone worker loop (used by scripts/worker.mjs for the pilot and by
 * Render's worker service description).
 */
export function startWorkerLoop(options: { intervalMs?: number; onError?: (error: unknown) => void } = {}) {
  const env = getEnv();
  const interval = options.intervalMs ?? env.JOBS_POLL_INTERVAL_MS;
  const workerId = `worker-${randomUUID().slice(0, 8)}`;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await recoverStaleJobs();
      await scheduleMaintenance();
      await drainJobs(30, workerId);
    } catch (error) {
      options.onError?.(error);
      console.error("[jobs] worker tick failed", error instanceof Error ? error.message : error);
    }
    if (!stopped) timer = setTimeout(tick, interval);
  };

  timer = setTimeout(tick, 0);

  return {
    workerId,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
