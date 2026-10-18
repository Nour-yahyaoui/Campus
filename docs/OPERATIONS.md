# Operations runbook

Everything here is written to be executed by one person who did not build the
system. Where a procedure has not been rehearsed, it says so.

## Service map

| Service | What it is | Health endpoint | Notes |
| --- | --- | --- | --- |
| `apps/web` | Next.js frontend + server actions | `/api/health` (live), `/api/health/ready` (DB) | also `/api/search`, `/api/me/export`, `/api/auth/*` |
| `apps/rust-api` | primary JSON API | `/health/live`, `/health/ready` | read subset only today |
| `apps/next-fallback` | read-only JSON API | `/health/live`, `/health/ready` | refuses writes with 503 |
| `worker` | durable jobs | process liveness only | no HTTP port |
| PostgreSQL (Neon) | system of record | provider status | single writer per migration |

## Deploy order

1. **Migrations** (once, from a trusted runner or CI job):
   `DATABASE_URL=… npm run db:migrate`. Confirm `npm run db:status` is 6/6 (or
   however many exist) with no pending checksum errors.
2. **Worker** (`npm run worker`) — start before traffic so queued reminders and
   emails can drain.
3. **Rust API** — deploy the image; verify `/health/ready` reports the database
   and migration count.
4. **Fallback API** — deploy; verify `/health/ready` and a read route.
5. **Web** — deploy; verify `/`, `/clubs`, `/events`, `/health/ready`, then sign
   in with a real Google account in staging.

Never deploy a new web build against a database where the required migration has
not been applied first.

## Backups

Neon provides point-in-time restore (PITR) on paid plans and daily backups on
free plans. **Do not assume either without checking the project's plan.**

Recommended additional logical backup, run daily by cron or a scheduled job:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
  --file="campussphere-$(date -u +%Y%m%dT%H%MZ).dump"
# store in encrypted object storage; retention 14–30 days
```

Backups contain personal data. Encrypt at rest, restrict access, and delete on
schedule.

**A database dump does not contain uploaded images.** Avatars, club logos and
covers, project covers and event covers live in object storage (the Neon bucket
`campus`) and are referenced from the database by an opaque id (`/media/<id>`),
not stored in it. Consequences:

- Restoring a database into an empty environment leaves every image URL
  resolving to `404` until objects are copied to that environment's bucket.
- Keep the bucket in the same Neon project as the database where possible: Neon
  branches the bucket copy-on-write, so a branch of production has the images
  as of the branch point.
- When copying objects between buckets, keep the key unchanged
  (`<kind>/<scope>/<uuid>.<ext>`); `media_assets.object_key` is what maps a row
  to a file.
- A `404` from `/media/<id>` for a row whose `media_assets.status` is not
  `ready` is expected: the upload was never completed and the cleanup job will
  remove the row.

## Restore (rehearsed procedure — rehearse it in staging before you need it)

```bash
# 1. Create an empty database (never restore over production).
createdb campussphere_restore

# 2. Restore the dump.
pg_restore --no-owner --no-acl --dbname campussphere_restore backup.dump

# 3. Verify the ledger and a few invariants.
DATABASE_URL=postgresql://…/campussphere_restore npm run db:status
DATABASE_URL=postgresql://…/campussphere_restore npm run db:verify

# 4. Spot-check counts and the newest audit event.
psql "$RESTORE_URL" -c "select count(*) from clubs; select max(created_at) from audit_events;"

# 5. Point staging at the restore, run the smoke checks in docs/TESTING.md,
#    then switch production only with an explicit decision and a written record.
```

**Status: rehearsed in this workspace on 2026-10-18** against the seeded demo
database (a 107 KB custom-format dump): `pg_restore` completed, `db:status`
reported 6/6 migrations with matching checksums, `db:verify` reported every
invariant, and row counts for users, clubs, projects, events, registrations,
audit events and the migration ledger matched the source exactly. The restore
database was then dropped.

That proves the procedure and the dump format. It does **not** prove a
production-sized restore, a Neon PITR restore, or a restore while the app is
serving traffic — those remain launch gates and need a staging rehearsal.

## Rollback

- **Web/Vercel:** promote the previous deployment. Server actions and schema
  must remain compatible; deploy backwards-compatible migrations first.
- **Rust/fallback on Render:** redeploy the previous image tag. The image tag
  must be recorded in the release notes.
- **Database:** application rollback does not roll back schema. Additive
  migrations are safe to leave; destructive ones require a forward fix or a
  restore. Never edit an applied migration to "undo" it.

## Maintenance mode

1. Admin console → Settings → enable maintenance with a message.
2. Writes now fail with a clear 503-style error at the request boundary; reads
   and admin tools continue to work.
3. Perform the change (migration, index rebuild, data repair).
4. Disable maintenance, verify a write path (e.g. submit a test report), then
   delete the test record via moderation tooling.

## Incident response

| Severity | Example | First 15 minutes |
| --- | --- | --- |
| SEV1 | data exposure, auth bypass, database down | enable maintenance, rotate secrets, preserve logs, notify the maintainer/operator; do not delete evidence |
| SEV2 | job backlog, email failures, one API down | drain worker, check provider status, fail over reads manually if safe |
| SEV3 | slow page, cosmetic breakage | investigate without disabling writes |

Triage order: check `/health/ready` on all three services → Observatory error
rate and p95 → worker dead letters → recent deploys → database connections.

**Correlation ids**: every API error response includes one; search logs for it.
Next.js server errors log a digest, which appears in the error boundary UI.

## Signals to watch

| Signal | Warning | Page |
| --- | --- | --- |
| API error rate (5 min) | > 2% | > 5% |
| API p95 latency | > 400 ms | > 1 s |
| Readiness failures | 1 probe | 3 consecutive |
| Job queue age | > 10 min | > 30 min |
| Dead-letter jobs | > 0 | > 10 |
| Database connections | > 70% of max | > 90% |
| Disk/database size | > 70% quota | > 85% |
| Auth failures spike | 3× baseline | 10× baseline |

The System Observatory shows these live but does not page anyone. Alerts belong
to the hosting provider's monitoring; this repository does not pretend to ship a
paging system.

## Server health panel

**Admin → Overview** shows two live nodes side by side: the Next.js deployment
answering the request, and the optional Actix primary API. It refreshes every
ten seconds while the tab is visible, pauses when it is hidden, and keeps the
last good reading on screen (clearly labelled as stale) if a check fails.

| Node | How it is measured |
| --- | --- |
| **Next.js (fallback)** | In-process: `process.memoryUsage()`, CPU time delta, event-loop delay (`perf_hooks`), pg pool state, `os.loadavg()` |
| **Actix (primary)** | `GET $API_BASE_URL/health/metrics`, which reads `/proc/self/status`, `/proc/self/stat`, `/proc/loadavg` and the cgroup memory limit |

The verdict (*idle / light / busy / under load*) is computed from CPU, event-loop
delay, pool waiters and the API's p95 latency over the last five minutes. Every
verdict names the signal that produced it.

Truthfulness rules the panel follows:

- A missing measurement is `null` and renders as `—`. It is never shown as zero.
- **Cold starts are not load.** The event-loop figure is a rolling window reset
  on every read (a cumulative histogram turns one startup stall into a
  permanent "p99 = 9 s"), it needs at least 150 samples before it counts, and
  no verdict is issued for the first 30 seconds of a process. Latency only
  influences the verdict once 20 requests exist.
- Memory percentages use the platform's own limit (`process.constrainedMemory()`
  on Vercel, the cgroup limit on Docker). Without a limit, only the absolute
  figure is shown.
- `os.loadavg()` and `/proc/loadavg` describe the **host**, not the container,
  on shared platforms. CPU and RSS are the process's own.
- On Vercel each function instance reports its own memory. The figure is the
  instance that answered the request, not a fleet total.

The primary is only probed when `API_BASE_URL` is set. If it is, set the same
`METRICS_TOKEN` on both services so the detailed endpoint is not publicly
readable; the probe sends `Authorization: Bearer …`. The endpoint returns `401`
otherwise, which the panel reports verbatim instead of pretending the service is
down.

Nothing here stores history. The sparkline is the browser's own last 24 samples;
the package's durable history remains the `api_metrics` table and the provider's
dashboards.

## Credential rotation

| Secret | Procedure |
| --- | --- |
| `GOOGLE_CLIENT_SECRET` | create a new secret in Google Cloud, deploy both services with it, then delete the old one |
| `DATABASE_URL` | create a new role/password in Neon, update environment for **every** service (web, fallback, worker, Rust), redeploy, remove the old role |
| `RESEND_API_KEY` / SMTP | rotate at provider, update env, redeploy, confirm a test job |

Never commit any of these. `.env` and `.env.*.local` are git-ignored.

## Common failures

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| 503 from `/api/health/ready` | DB unreachable, wrong `DATABASE_URL`, Neon suspended | check connection string, Neon status, pool limits |
| All pages dynamic but slow | database cold start (Neon free tier) | warm with a health check; consider a paid plan; document the latency |
| Emails "sent" but not received | `EMAIL_TRANSPORT=console` | configure SMTP/Resend; console transport is not delivery |
| Queue growing | worker not running / crashed | restart worker; inspect `jobs` for dead letters |
| Google sign-in redirects with an error | redirect URI mismatch, clock skew, expired state | re-check Google console, server time |
| 429 for legitimate users | shared NAT hit a limit | raise the limit consciously or key on account id |
| "relation does not exist" after deploy | migration not applied | run `npm run db:migrate` before the new build |
| `unsupported startup parameter in options` | a client sent `statement_timeout`/`options` in the startup packet to Neon's pooled endpoint | remove the startup option; use client-side `query_timeout` (default here) or `ALTER ROLE … SET statement_timeout` |
| `node: .env: not found` | a script uses `--env-file=.env` in a host with no `.env` | scripts use `--env-file-if-exists`; pass variables through the platform |
| Worker exits immediately | `tsx` or dev dependencies not installed at build | build with `npm ci --include=dev`; `tsx` is a runtime dependency |
