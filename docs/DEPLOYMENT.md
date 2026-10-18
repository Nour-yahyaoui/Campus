# Deployment

> **Quick path:** [`DEPLOY_QUICK.md`](DEPLOY_QUICK.md) — one service, three
> variables, `/api/initialize` builds the schema and the first super-admin.
> This document describes the full multi-service topology.

Target topology: **Neon** (PostgreSQL) + **Render** (Rust API, fallback API,
worker) + **Vercel** (web). Every service is stateless except the database, so
any of them can be replaced without touching the schema.

> No deployment described here has been executed from this workspace. Every
> claim below is a configuration instruction, not evidence of a running
> production system. See the launch checklist.

**Start with [`docs/DEPLOY_STEPS.md`](DEPLOY_STEPS.md)** — the ordered, copy-paste
runbook (database → migrations → super-admin → Google → services → checks).
This file is the reference: topology, every variable, failover and security
notes.

## 1. Database — Neon

1. Create a Neon project and database (PostgreSQL 16+).
2. Copy the pooled connection string. For the web app use the **pooled** host;
   for the migration job use the **direct** host.
3. Run migrations once from a machine allowed to reach the direct host:

   ```bash
   DATABASE_URL="postgresql://…direct…" npm run db:migrate
   DATABASE_URL="postgresql://…direct…" npm run db:status
   DATABASE_URL="postgresql://…direct…" npm run db:verify
   ```

4. Keep `DB_POOL_MAX` small per instance (5 is a sensible default). Neon's
   connection limits are shared across web, fallback, Rust and the worker; budget
   them: `instances × DB_POOL_MAX + worker + migrations < plan limit`.

The schema is Neon-compatible: no superuser-only extensions, `gen_random_uuid()`
is built into PostgreSQL 15+, and no `pgcrypto` requirement is assumed.

**Connection parameters.** The pool sets `application_name` (accepted by
PgBouncer) and a client-side `query_timeout`, and never sends
`options=-c statement_timeout=…`. Neon's pooled endpoint rejects unknown
startup parameters with `unsupported startup parameter in options`, which would
fail *every* connection. Transactions use `SET LOCAL` for statement and lock
timeouts, which survives transaction-mode pooling. For a server-side cap as
well, set it on the role once:

```sql
ALTER ROLE <neon_role> SET statement_timeout = '10s';
```

## 2. Web — Vercel (or Render)

The blueprint deploys the web app on Render too. If you prefer Vercel:

- **Root directory: `apps/web`**, framework preset Next.js, Node.js 22.x.
  *Not* the repository root: with workspaces, Next.js must build inside the app
  directory so `.next` lands where Vercel expects it.
- Project Settings → General → enable **“Include source files outside of the
  Root Directory in the Build Step”**. `apps/web` imports `packages/core` and
  `packages/contracts`, which live outside that root; without the toggle the
  build fails on unresolved workspace imports.
- Install/build commands stay at the defaults — Vercel detects the npm
  workspace and installs from the repository lockfile.
- Environment variables (Production and Preview separately):
  `DATABASE_URL` (pooled), `NEXT_PUBLIC_SITE_URL`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `ALLOW_DEV_SIGN_IN=false`, `EMAIL_TRANSPORT`,
  `EMAIL_FROM`, `SMTP_URL`/`RESEND_API_KEY`, `DB_POOL_MAX`.
  Google credentials are only needed by this service; the fallback API and the
  worker share the same code but never start an OAuth flow.
- Set the canonical domain to the same value as `NEXT_PUBLIC_SITE_URL`. Preview
  deployments must use a **different** Google OAuth client and must not point at
  the production database — this is a hard rule in `docs/SECURITY.md`.
- `next.config.ts` loads a repository `.env` for local builds; on Vercel the
  platform environment wins.
- The web app's readiness probe is `/api/health/ready`. It returns `503` and
  names the missing variable when configuration is wrong, so use it as the
  deployment health check rather than `/`.

On Render the equivalent service is in `deployment/render.yaml` (the one-service quick path) or `deployment/render-full.yaml`: build
`npm ci --include=dev && npm run build --workspace @campussphere/web`, start
`npm run start --workspace @campussphere/web` (it honours `$PORT`), health check
`/api/health/ready`.

**Do not** put `DATABASE_URL` or `GOOGLE_CLIENT_SECRET` in a `NEXT_PUBLIC_*`
variable. They would be shipped to the browser.

## 3. Rust API — Render

`deployment/render-full.yaml` declares the services. Or configure manually:

- Environment: Docker.
- Dockerfile: `apps/rust-api/Dockerfile`, build context: repository root.
- Health check path: `/health/ready`.
- Start command: the image entrypoint (`campussphere-api`), binding `0.0.0.0`
  and `$PORT`.
- Environment: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `RUST_LOG=info`,
  `NODE_ENV=production`.
- Autoscaling: not configured. If enabled, rate limits remain correct because
  counters live in PostgreSQL.
- Migrations: **do not** run them on container start. They run in the deploy
  pipeline before the new revision is promoted.

First build requires network access to crates.io to generate `Cargo.lock`. Commit
that lockfile; then release builds use the pinned dependency graph.

## 4. Fallback API — Render

- Environment: Node 22; root directory: repository root.
- Build: `npm ci --include=dev && npm run build --workspace @campussphere/api`
  (dev dependencies are needed for `next build`; without the flag,
  `NODE_ENV=production` makes `npm ci` skip them).
- Start: `npm run start --workspace @campussphere/api` — the script binds
  `0.0.0.0` and honours Render's `$PORT` (`--port ${PORT:-4000}`).
- Health check path: `/health/ready`.
- Its own `DATABASE_URL` (pooled) and `DB_POOL_MAX`; no Google credentials are
  needed.

## 5. Worker — Render background worker

- Build: `npm ci --include=dev` (the worker runs through `tsx`).
- Start: `npm run worker` (`tsx --env-file-if-exists=.env scripts/worker.ts`).
  The `.env` file is optional: hosted environments supply real variables, and
  the script no longer fails when the file is absent.
- No port, no health check; Render restarts it if it exits.
- Give it a small pool (`DB_POOL_MAX=2`) and run exactly one replica unless you
  verify that `for update skip locked` keeps throughput healthy with more.

## Failover — what is and is not configured

The fallback is **not** wired into a traffic switch. There is no gateway, DNS
weighting, or automatic probe in this repository. Options, in order of
preference:

1. **Server-side API client policy** (recommended for the first iteration): the
   web app's `packages/core` would call an internal API base URL with a timeout
   and a documented retry only for idempotent reads. Not implemented: the web
   currently calls services in-process.
2. **Gateway / load balancer** with two origins and an active health check.
3. **Manual DNS/edge switch**, tested in staging with a recorded runbook.

Whichever is chosen must be tested end-to-end, including failback, before any
claim of resilience is made. Reads only: the fallback refuses writes, so a
failover degrades to "browse works, changes pause" — which is the honest
behaviour for an API whose write path depends on the primary.

## Where the migrations live at runtime

`/api/initialize` applies the same seven migrations as `npm run db:migrate`, from
the same ledger and with the same checksums. It reads `migrations/*.sql` when the
repository is on disk (Render, Docker, local) and falls back to a copy compiled
into the app (`packages/core/src/migrations.generated.ts`) when it is not — a
Vercel build, for example, ships only the output of `next build`.

If you add or edit a migration, regenerate that copy and commit it:

```bash
npm run db:embed-migrations
```

`npm test` fails if the two copies disagree.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled string (direct for migrations) |
| `NEXT_PUBLIC_SITE_URL` | yes | canonical HTTPS origin, no trailing slash |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | web, production | OIDC web client; redirect URI `${SITE_URL}/api/auth/google/callback`. The web app refuses to start without them in production |
| `ALLOW_DEV_SIGN_IN` | yes | must be `false` in production |
| `EMAIL_TRANSPORT` | no | `console` (default), `smtp`, `resend` |
| `EMAIL_FROM` | no | sender address |
| `SMTP_URL` / `RESEND_API_KEY` | if used | credentials for the selected transport |
| `DB_POOL_MAX` | no | default 5 per instance |
| `METRICS_RETENTION_DAYS` | no | default 30 |
| `JOBS_POLL_INTERVAL_MS` | no | default 2000 |
| `RATE_LIMIT_DISABLED` | no | must be `false` in production |
| `STORAGE_BUCKET` | images | `campus` — the Neon Object Storage bucket |
| `AWS_ENDPOINT_URL_S3` / `AWS_REGION` | images | from the Neon storage API for your branch |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | images | Neon storage credentials (`token_id` / `s3_secret_access_key`), scopes `storage:read` + `storage:write`; required on the web service **and** the worker |
| `S3_FORCE_PATH_STYLE` | no | defaults to `true`, which Neon requires |
| `STORAGE_PUBLIC_BASE_URL` | no | only for a `public_read` bucket; omit for private (presigned redirects) |
| `STORAGE_DRIVER` | no | `auto` (default), `s3` or `local`; `local` is refused in production |
| `NODE_ENV` | yes | `production` on all deployed Node services |

Secrets belong in the hosting provider's secret store. `.env` files are for
local development only and are git-ignored.

**Configuration is validated at startup.** `apps/web/instrumentation.ts` calls
the same `getEnv()` used by the app, so a bad deployment logs one explicit
error (for example `ALLOW_DEV_SIGN_IN must be false in production`) instead of
failing mysteriously per request. Next.js still starts in a degraded state
after that error, so the deploy health check must be `/api/health/ready`:
it returns `503` until the configuration and database are usable, and it names
the failing dependency (for example missing Google credentials in production).

With no storage variables set, the app uses a local filesystem driver
(`.data/uploads`); that path exists for development and for the single-machine
demo, and is deliberately disabled in production. The upload flow is described
in `docs/DEPLOY_STEPS.md` § Step 4b.

To reproduce production behaviour locally, override the development `.env`
values on the command line (they win over the file):

```bash
npm run build
ALLOW_DEV_SIGN_IN=false \
GOOGLE_CLIENT_ID=local-verification.apps.googleusercontent.com \
GOOGLE_CLIENT_SECRET=local-verification-secret \
npm start --workspace @campussphere/web
```

This was executed on 2026-10-18: smoke passed and the load baseline completed
with zero non-200 responses (see `docs/LOAD_TEST_PLAN.md`).

## Verification after deploy

```bash
curl -fsS https://<web>/api/health/ready   # includes storage.driver / bucket / configured
curl -fsS https://<rust>/health/ready
curl -fsS https://<fallback>/health/ready
curl -fsS "https://<rust>/api/v1/clubs?limit=1"
curl -fsS -o /dev/null -w "%{http_code}\n" -X POST https://<fallback>/api/v1/clubs   # expect 503
```

Then follow the smoke matrix in `docs/TESTING.md`.

## Cost expectations (free tiers)

Free tiers impose cold starts, connection ceilings and egress limits. A realistic
pilot needs Neon's paid compute for predictable latency, and Render's paid plan to
avoid sleeping services. This repository will not claim "free forever at scale";
budget for the database first.
