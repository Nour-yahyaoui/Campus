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
MIT. See [LICENSE](LICENSE). CampusSphere is an independent student project; it
is not affiliated with or endorsed by any university.
