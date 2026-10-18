# CampusSphere

A free, open-source university community platform: clubs with real mini-sites,
student projects with a review workflow, events with capacity-safe registration
and check-in, and an operations console that reports what it can actually
measure — including what it cannot.

Built as a modular monolith in TypeScript with a parallel Rust API, on
PostgreSQL. MIT licensed.

> **Pilot status.** This repository contains a complete, working build, and it
> is deliberately explicit about what has been verified. There is no university
> endorsement, no fabricated usage numbers, no seeded testimonials and no claim
> that a load target has been met when it has not been measured. The
> [launch checklist](docs/LAUNCH_CHECKLIST.md) lists every remaining gate.

## What it does

- **Clubs** — public mini-sites, open/request/invite membership, officer review
  queues, single-president handover, announcements, scoped permissions.
- **Projects** — student proposals, super-admin review, role-based recruitment,
  applications, team workspace, tasks, milestones, updates.
- **Events** — proposals, approval, publishing, capacity-safe registration,
  automatic waitlist promotion, cancellations, single-use QR check-in,
  post-event feedback.
- **People and safety** — Google OIDC with PKCE/state/nonce, opaque HttpOnly
  sessions stored hashed, moderation reports, suspension, append-only audit log,
  data export and account anonymisation.
- **Operations** — super-admin console, review queues, maintenance mode,
  System Observatory with measured product/API/database/job metrics and an
  explicit list of unavailable measurements.
- **Accessibility and SEO** — mobile-first layout from 320px, semantic headings,
  visible focus, labelled forms, reduced-motion support, server-rendered public
  pages, canonical URLs, sitemap, robots rules and per-page Open Graph metadata.

## Repository layout

```
apps/web              Next.js 16 App Router frontend (server components, server actions)
apps/next-fallback    Independently deployable, read-only JSON API (Next.js route handlers)
apps/rust-api         Primary JSON API (Rust 1.82, Actix Web 4, sqlx)
crates/               domain | shared-types | security | telemetry | infrastructure | application
packages/contracts    Zod schemas, enums and DTOs shared by every TypeScript surface
packages/core         Service layer: auth, clubs, projects, events, admin, jobs, email, metrics
migrations/           Six checksummed PostgreSQL migrations (Neon compatible)
scripts/              Migration runner, local PostgreSQL, seed, worker, super-admin bootstrap
openapi/              OpenAPI 3.1 contract for the v1 API
load-tests/           k6 scenarios and the load-test plan
deployment/           Render blueprint, Dockerfiles, environment reference
docs/                 Architecture, security, privacy, operations, testing, launch checklist
```

## Quick start (Node 22+, PostgreSQL 16)

```bash
git clone https://github.com/Nour-yahyaoui/Campus.git
cd Campus
npm install
cp .env.example .env            # set DATABASE_URL and NEXT_PUBLIC_SITE_URL

# No PostgreSQL locally? Start a disposable one on port 55432:
./scripts/pg-local.sh start

npm run db:migrate
npm run db:seed                 # development demo content, refused in production
npm run dev                     # http://localhost:3000
```

Optional, in separate terminals:

```bash
npm run dev:api                 # fallback API on http://localhost:4000
npm run worker                  # durable jobs: email, reminders, cleanup
```

Development sign-in is enabled only when `ALLOW_DEV_SIGN_IN=true` **and**
`NODE_ENV !== "production"`. A production deployment that leaves the flag set
answers requests with a configuration error and fails `/api/health/ready`.
Google sign-in appears when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
set; the web app requires both in production and its readiness probe reports
their absence.

### First super-admin

```bash
CONFIRM_SUPERADMIN=you@university.edu npm run admin:bootstrap
```

The script refuses to run without the explicit confirmation variable, creates
the account if needed, grants `super_admin` and writes an audit record.

## Deploying

See [`docs/DEPLOY_STEPS.md`](docs/DEPLOY_STEPS.md). The short version: create a
Neon database, run `npm run db:migrate` against its **direct** URL, bootstrap
the first super-admin, create a Google OAuth client, then apply
`deployment/render.yaml` (web + fallback + worker, Rust optional) or deploy
`apps/web` to Vercel with root directory `apps/web`.

## Checks

```bash
npm run typecheck                      # all TypeScript workspaces
npm test                               # 59 automated tests (43 integration, 8 fallback route, 8 presentation) against real PostgreSQL
npm run build                          # production build of web + fallback
cd apps/rust-api && cargo fmt --check && cargo clippy -- -D warnings && cargo test
npm run db:verify                      # schema invariants
```

The integration suite needs `TEST_DATABASE_URL` (database name must end in
`_test`); it truncates tables between tests. See [docs/TESTING.md](docs/TESTING.md).

## Status of this build

Verified in this workspace:

- `apps/web` and `apps/next-fallback` typecheck and produce production builds.
- 59 automated tests (43 integration, 8 fallback route, 8 presentation) pass against PostgreSQL 16 covering auth/session replay,
  capacity races, waitlist promotion, single-use check-in, role scoping,
  append-only audit, moderation, maintenance mode, search visibility and account
  deletion.
- Six migrations apply cleanly; `db:verify` checks the invariants.
- The production build serves correctly with production env values: 12 web
  smoke checks plus 4 fallback checks pass, role redirects are real `307`s,
  logout revokes the session, rate limits return `429`, and the security
  headers are present.
- A `pg_dump` → `pg_restore` rehearsal produced matching migration checksums,
  invariants and row counts (demo-size database only).
- A single-process local baseline handled 20 concurrent readers with zero
  errors and p95 230 ms; it is a regression signal, not a capacity claim.

Not verified here, and not claimed:

- The Rust API is written but **could not be compiled in this sandbox**
  (no Rust toolchain and no crates.io access). CI runs `cargo fmt`, Clippy,
  tests and a release build; treat it as unproven until that pipeline passes.
- Google OAuth needs real credentials and a registered redirect URI; the local
  environment exercises the development sign-in path instead.
- Email uses the console transport by default: messages are recorded, not
  delivered, unless SMTP or Resend is configured.
- No browser end-to-end suite and no k6 run at the target concurrency; the
  plan and scripts live in `load-tests/`, with the measured local baseline and
  its limits in [docs/LOAD_TEST_PLAN.md](docs/LOAD_TEST_PLAN.md).
- No external security audit.

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | boundaries, data flow, decisions and deviations |
| [Development](docs/DEVELOPMENT.md) | local setup, scripts, conventions |
| [API](docs/API.md) | v1 contract, pagination, errors, fallback behaviour |
| [Security](docs/SECURITY.md) | threat model and implemented controls |
| [Privacy](docs/PRIVACY.md) | data inventory, retention, export and deletion |
| [Operations](docs/OPERATIONS.md) | deploy, backup/restore, incident and rollback runbooks |
| [Deploy steps](docs/DEPLOY_STEPS.md) | ordered runbook: database → migrations → OAuth → services → checks |
| [Deployment](docs/DEPLOYMENT.md) | Render/Vercel/Neon configuration and env vars |
| [Testing](docs/TESTING.md) | what is tested, how, and what is not |
| [Load testing](docs/LOAD_TEST_PLAN.md) | target, method, abort criteria |
| [Launch checklist](docs/LAUNCH_CHECKLIST.md) | gates, owners and honest status |

## License

MIT. See [LICENSE](LICENSE). CampusSphere is an independent student project; it
is not affiliated with or endorsed by any university.
