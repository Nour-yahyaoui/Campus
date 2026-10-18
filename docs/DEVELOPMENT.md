# Development

## Requirements

- Node.js 22+ and npm 10+
- PostgreSQL 16 (local, Docker, or Neon)
- Rust 1.82+ **only** if you work on `apps/rust-api`
- Optional: `k6` for the load tests

## Setup

```bash
npm install
cp .env.example .env
./scripts/pg-local.sh start     # if you have no PostgreSQL; binds 127.0.0.1:55432
npm run db:migrate
npm run db:seed
npm run dev                     # http://localhost:3000
```

`scripts/pg-local.sh` uses the Python `pgserver` distribution, starts PostgreSQL
on port **55432** (avoiding a system install) and creates `campussphere` plus
`campussphere_test`. Stop it with `./scripts/pg-local.sh stop`.

### Demo accounts

The seed refuses to run in production and refuses to add content to a database
that already has clubs but no demo marker. After a reset it creates:

| Email | Role |
| --- | --- |
| `admin@campussphere.local` | student + super-admin |
| `officer@campussphere.local` | president of Robotics Society and Eco Collective, officer of Debate Union |
| `lead@campussphere.local` | project lead |
| `student@campussphere.local` | student, member of Eco, applicant elsewhere |

Sign in on `/login` with any of them using the development form (visible only
when `ALLOW_DEV_SIGN_IN=true` and `NODE_ENV !== "production"`).

## Scripts

| Command | Effect |
| --- | --- |
| `npm run dev` | Next.js web app on :3000 |
| `npm run dev:api` | read-only fallback API on :4000 |
| `npm run worker` | durable job worker (email, reminders, cleanup) |
| `npm run build` | production build of core, fallback and web |
| `npm run typecheck` | `tsc --noEmit` in every TypeScript workspace |
| `npm test` | integration tests (real PostgreSQL, destructive) |
| `npm run db:migrate` | apply pending migrations, verify checksums |
| `npm run db:status` | applied/pending migration list |
| `npm run db:verify` | schema invariant checks |
| `npm run db:reset` | drop and recreate the schema (requires `ALLOW_DB_RESET=true`) |
| `npm run db:seed` | development demo content |
| `npm run admin:bootstrap` | grant the first super-admin (requires `CONFIRM_SUPERADMIN`) |

## Conventions

- **Server first.** Pages are async server components. Client components exist
  only for interaction that cannot be done with HTML: the mobile nav, the
  submit-with-pending-state button, the copy/show toggles.
- **Server actions for writes.** No `POST` route handlers for forms. Actions
  validate with a zod schema from `packages/contracts`, call one service
  function, then redirect with `?ok=` or `?error=`. `redirect()` throws: every
  action checks `isRedirect(error)` and re-throws before mapping an error, or
  success messages turn into "Something went wrong".
- **Authorization in the service layer.** Hiding a button is not a control.
  Every mutation re-checks the actor's role and the target's ownership.
- **SQL is parameterised and bounded.** No string interpolation of user input.
  List endpoints cap page size at 48. Status parameters that feed enum columns
  are cast explicitly (`$3::event_status`).
- **Time.** Store UTC (`timestamptz`). Format at the edge with the event's
  timezone. Do not compare dates in JavaScript when SQL can do it.
- **Honest UI.** Empty states say what is missing. Counters come from queries.
  Features that are unavailable say why.

## Adding a migration

1. Create `migrations/000N_name.sql` (next number, snake case).
2. Apply with `npm run db:migrate`; checksums are recorded in
   `schema_migrations`.
3. Never edit an applied migration: the runner refuses a changed checksum.
   Write a new migration instead.
4. Update tests and, if the wire contract changes, `packages/contracts`,
   `openapi/openapi.yaml` and the Rust types.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Invalid server configuration: DATABASE_URL` | no `.env` at the repository root, or started from elsewhere; `packages/core/src/env.ts` walks up from the working directory |
| `relation "…" does not exist` | migrations not applied: `npm run db:migrate` |
| `Refusing to run destructive tests` | `TEST_DATABASE_URL` must end in `_test` |
| Seed refuses with "not an empty database" | `ALLOW_DB_RESET=true npm run db:reset` then seed |
| Google button missing | credentials not configured; use the development form or set both `GOOGLE_CLIENT_*` variables |
| Sessions disappear on restart | not expected: sessions live in PostgreSQL; check `DATABASE_URL` |
| `module not found: @campussphere/core` | run `npm install` at the repository root (workspaces) |

## Rust

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p campussphere-api        # needs DATABASE_URL
```

The Rust crates are independent of npm. `cargo generate-lockfile` must be run
once with network access and the resulting `Cargo.lock` committed for
reproducible release builds (see the launch checklist); it is not present in
this sandbox because crates.io was unreachable.
