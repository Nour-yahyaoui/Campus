# Architecture

## Shape

CampusSphere is a **modular monolith** with a shared domain/service layer and
three deployable surfaces. There is no microservice mesh, no message broker and
no second datastore; the product does not need them yet, and pretending
otherwise would add failure modes without adding capability.

```
                    ┌──────────────────────────────┐
  browser ───────▶  │ apps/web  (Next.js 16)       │
                    │ server components + actions  │
                    └───────────────┬──────────────┘
                                    │ direct calls (no HTTP hop)
                    ┌───────────────▼──────────────┐
                    │ packages/core                │
                    │ auth · clubs · projects ·    │
                    │ events · admin · jobs ·      │
                    │ email · rate limits · metrics│
                    └───────┬──────────────┬───────┘
                            │              │
              ┌─────────────▼────┐  ┌──────▼──────────────┐
              │ PostgreSQL (Neon)│  │ packages/contracts  │
              │ 6 migrations     │  │ zod schemas + DTOs  │
              └─────────────▲────┘  └──────▲──────────────┘
                            │              │
        ┌───────────────────┴───┐   ┌──────┴────────────────────┐
        │ apps/next-fallback    │   │ apps/rust-api             │
        │ read-only JSON API    │   │ Actix Web + sqlx          │
        │ (Next route handlers) │   │ read subset, refuses writes│
        └───────────────────────┘   └───────────────────────────┘
```

### What actually serves the web app

`apps/web` calls `packages/core` **in process** from server components and
server actions. That is a deliberate deviation from the "frontend calls the Rust
API over HTTP" diagram in the original brief, and it is stated here rather than
implied otherwise:

- One transaction boundary and one authorization implementation for every web
  mutation; no partial failure between a web write and an API call.
- No second network hop on the critical path of a page render.
- The Rust API is still built against the same schema and contract, so moving
  data access behind HTTP later is a routing change in `packages/core`, not a
  rewrite of pages.

The Rust API is therefore **not yet the web's data source**. It is a real,
separate executable implementing the documented read subset. Until a release
compiles and contract-tests it in CI, it must be described as unproven (see the
launch checklist).

## Layers

| Layer | Responsibility | Must not |
| --- | --- | --- |
| `apps/web` | rendering, routing, SEO, form handling, session cookie plumbing | contain SQL or authorization rules |
| `packages/core` | use cases, transactions, authorization, rate limits, audits | trust client input or render HTML |
| `packages/contracts` | enums, zod input schemas, wire DTOs | import server-only code |
| `migrations` | schema, constraints, triggers | contain data dependent on a deployment |
| `apps/rust-api/crates/domain` | pure rules: capacity, waitlist, roles, feedback window, slugs | perform I/O |
| `apps/rust-api/crates/infrastructure` | parameterised SQL, pool, rate-limit counters | decide policy |
| `apps/rust-api` | HTTP binding, CORS, errors, metrics | invent business rules |

## Key flows

### Authentication

1. `/api/auth/google/start` creates a state, nonce and PKCE verifier, stores
   their **hashes** with a ten-minute expiry, sets three short-lived HttpOnly
   cookies and redirects to Google.
2. `/api/auth/google/callback` compares state in constant time, exchanges the
   code with the stored verifier, validates the ID token signature, issuer,
   audience, expiry and nonce, and requires `email_verified`.
3. An account is matched by Google subject, then by verified email (linking an
   existing account), otherwise created. Sessions are opaque 32-byte tokens;
   only their SHA-256 digests are stored. The cookie is HttpOnly, SameSite=Lax,
   Secure outside development, and lives 14 days.
4. Sessions are revoked on sign-out, on suspension, and when admin rights are
   removed. Privilege checks are re-read from the database on every request, so
   a stale cookie cannot preserve removed access.

### Registration and capacity

`registerForEvent` opens a transaction, locks the event row (`select … for
update`), counts confirmed seats, and inserts either a confirmed registration or
a waitlisted one with the next queue position. Cancellation locks the event,
cancels the registration, promotes the earliest waitlisted person, renumbers the
queue and enqueues a durable email job. Concurrent registrations cannot
oversubscribe capacity; this is covered by a race test.

### Review and moderation

Projects and events start as `submitted`. Only `super_admin` can approve, reject
or request changes, with a mandatory reason where the UI requires it. Every
decision writes to `audit_events` and notifies the author. The audit table is
append-only: a database trigger rejects `UPDATE` and `DELETE`, so "we log
everything" is an enforced property, not a convention.

### Durable work

`jobs` is a PostgreSQL-backed queue with attempts, backoff, `run_at`, locking
(`for update skip locked`) and a dead-letter status. Email, event reminders and
retention cleanup are handlers. The web process never runs the worker; it is a
separate process (`npm run worker`), which keeps page latency independent of job
volume. If the worker is down, jobs wait — nothing is lost and nothing is
faked.

### Maintenance mode

A setting row gates write server actions through `requireWritesEnabled()`, which
returns a 503-style error with a clear message. Reads and admin operations stay
available. The check lives at the request boundary (server actions) rather than
inside every SQL function; the API surfaces apply the same rule when they gain
writes. This is documented because "the database refuses writes" would be a
stronger claim than what is implemented.

## Rendering and caching

Public pages are server-rendered. Because the site header depends on the session
cookie, every route currently renders dynamically; `revalidate` exports were
removed rather than left in place to look effective. Caching happens where it is
safe and measurable:

- immutable static assets under `/_next/static` are content-hashed;
- the fallback and Rust APIs send short `max-age` windows on public lists;
- the sitemap is regenerated hourly;
- `no-store` on every authenticated or admin response.

Root and `/dashboard` `loading.tsx` files were deliberately removed: a segment
loading boundary lets the shell flush before the page renders, so an
authorization `redirect()` turns into a `200` with a client-side redirect. That
is a worse security signal than a small wait. After removal, a revoked or
unknown session gets a real `307` on `/dashboard`, nested dashboard routes,
`/admin` and `/observatory` — verified against the production build.

Skeletons now live *inside* pages, after the session check, where a Suspense
boundary cannot swallow a redirect. The proxy still returns a `307` for
signed-out visitors before any page code runs.

If public-page caching becomes a requirement, the header must move to a client
component reading a lightweight `/api/me` endpoint. That trade-off is recorded
here instead of being hidden behind an inert `revalidate` constant.

## Schema highlights

- `users.roles` is a `global_role[]` (`student`, `moderator`, `super_admin`).
- One active or pending membership per person per club, enforced by a partial
  unique index.
- One active registration per person per event, plus a queue position that is
  unique within the waitlist.
- `events.status` and `projects.status` are PostgreSQL enums; transitions are
  checked in the service layer and re-checked by constraints where practical.
- `attendance_tokens` stores only hashes, is single-use (`used_at`) and expires.
- `api_metrics` is written by web API routes, the fallback and the Rust API, so
  the Observatory shows one merged picture.
- `settings` holds maintenance state, the demo marker and operational toggles as
  JSONB with an audit trail on changes.

## Failure behaviour

| Failure | Behaviour |
| --- | --- |
| Database unreachable | readiness returns 503; pages render an error boundary; no fake data |
| Google unavailable | sign-in fails with a readable message; browsing continues |
| Email provider down | job retries with backoff, then dead-letters; nothing is reported as delivered |
| Worker stopped | jobs accumulate; Observatory shows queue age and dead letters |
| Rate-limit store unavailable | requests fail closed with 503 on protected actions |
| Rust API missing a route | JSON 503 stating the operation was not performed |

## Deliberate non-goals for this phase

- No Redis: PostgreSQL fixed-window counters are sufficient at pilot scale and
  remove a dependency. If throughput makes the counter a hotspot, add Redis
  behind the same `consumeRateLimit` interface.
- No full-text search engine: bounded `ILIKE` over indexed titles is honest at
  this corpus size and never returns private content.
- No microservices, no event sourcing, no CQRS.
