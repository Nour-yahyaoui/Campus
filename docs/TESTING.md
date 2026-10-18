# Testing and quality gates

## What runs today

| Check | Command | Status in this workspace |
| --- | --- | --- |
| TypeScript typecheck (web, fallback, core, contracts) | `npm run typecheck` | ✅ passes |
| Production builds (web, fallback) | `npm run build` | ✅ passes |
| Integration tests (real PostgreSQL 16) | `npm test` | ✅ 88 tests / 15 files |
| Migration checksums and application | `npm run db:migrate`, `npm run db:status` | ✅ 7/7 |
| Schema invariants | `npm run db:verify` | ✅ passes |
| Rust fmt/clippy/test/build | `cargo …` | ❌ **not run** — no toolchain/crates.io in this sandbox |
| Browser end-to-end | Playwright | ❌ not implemented |
| Load test (k6, target concurrency) | k6 | ❌ not executed; a 20-VU local baseline is in `LOAD_TEST_PLAN.md` |
| Accessibility audit | axe / manual | ⚠️ manual review only |
| Dependency audit | `npm audit --omit=dev` | ✅ 0 known vulnerabilities at install time |

## Integration suite

The suite talks to a **real** PostgreSQL database (`TEST_DATABASE_URL`, name must
end in `_test`) and truncates tables between tests. It refuses to run against a
database whose name does not end in `_test`.

| File | Covers |
| --- | --- |
| `auth.test.ts` | session creation/resolution, revocation, rotation, single-use sign-in tickets, suspended accounts, production guard rails |
| `clubs.test.ts` | request-based membership, officer decisions, cross-club IDOR, duplicate membership, leaderless-club guard, role grants by members |
| `projects.test.ts` | approval before listing, change-request notes, application acceptance limited by slots, unapproved and members-only visibility |
| `events.test.ts` | capacity races (parallel registrations), waitlist promotion, duplicate registration, single-use check-in, organizer-only check-in, pre-approval registration, feedback window |
| `observatory.test.ts` | measured metrics, explicit unavailable list, maintenance state transparency |
| `ratelimit.test.ts` | limit enforcement and `retryAfterSeconds` |
| `admin.test.ts` | super-admin gating, self-role/self-suspend guards, session revocation on admin removal, audit reason capture, maintenance boundary, moderation queue and resolution, append-only audit |
| `initialize.test.ts` (web) | constant-time token comparison, the access matrix (first-run / read-only / denied), HTML escaping of the setup page |
| `users-search.test.ts` | profile validation, export scoping, anonymising deletion, notification read state, public-only search, type scoping, short queries |
| `media.test.ts` | upload authorization per kind, presign shape, magic-byte rejection, attach/supersede/delete, avatars, key-traversal guards, stale-pending cleanup — local driver |
| `media-s3.test.ts` | the production path against a local S3-compatible stub started by the test: path-style presigned PUT, browser upload, `HeadObject`, ranged read for sniffing, presigned GET redirect, public base URL, delete, CORS round-trip |
| `migrations.test.ts` | the schema-application functions `/api/initialize` calls: directory discovery, checksums, idempotent second run, ledger compatibility with the CLI |

Notable assertions:

- A capacity-3 event receiving parallel registrations never confirms more than 3.
- Cancelling a confirmed seat promotes exactly the first waitlisted person.
- A check-in code is consumed once; a second attempt fails.
- A non-organizer cannot check anyone in.
- Unapproved projects and members-only projects never appear in public or search.
- The audit table rejects `UPDATE` and `DELETE` at the database level.
- An image is not attached to a club until its bytes have been verified; a text
  file declared as `image/png` is rejected and the page keeps its old image.
- Replacing an image deletes the previous object, and the old `/media/<id>`
  stops resolving.

**Running one file:** use the workspace script, not `npx vitest` from the
repository root — the per-file form skips `packages/core/vitest.config.ts`, so
the test-database setup never runs. The destructive helper now refuses to
truncate a database whose name does not end in `_test`, but the intended command
is:

```bash
npm test --workspace @campussphere/core                # everything
npm test --workspace @campussphere/core -- media        # one file by name
```

## Manual smoke matrix

Run against a preview before every release:

1. Guest: `/`, `/clubs`, `/clubs/<slug>`, `/events`, `/events/<slug>`,
   `/projects`, `/projects/<slug>`, `/search?q=…`, `/about`, `/observatory`.
2. Auth: `/login` → development form (or Google in staging) → dashboard.
3. Student: join an open club, request a closed one, apply to a project,
   register for an event, cancel and confirm waitlist promotion when applicable.
4. Lead: open the project workspace, accept an application, add a task, post an
   update.
5. Officer: review a membership request, post an announcement, change a role,
   transfer presidency and confirm the previous president became an officer.
6. Super-admin: approve a project and an event, resolve a report, suspend a
   test account, open the Observatory, enable and disable maintenance.
7. Negative: visit `/admin` as a student (redirected), submit a form with an
   empty required field (readable error), open an unapproved project URL (404),
   reuse a check-in code (rejected).
8. Export and delete a throwaway account; confirm sessions are gone.

## Production-mode checks

Run these against `npm run build` + `npm start` before a release. They caught a
container-only bug that the dev server hid (redirects built from `0.0.0.0`).

```bash
npm run build
ALLOW_DEV_SIGN_IN=false GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
  npm start --workspace @campussphere/web
npm start --workspace @campussphere/api          # second terminal, port 4000
npm run smoke                                    # 12 web checks
FALLBACK_URL=http://127.0.0.1:4000 npm run smoke  # + 4 fallback checks
LOAD_CONCURRENCY=20 LOAD_SECONDS=20 node scripts/load.mjs   # exits non-zero on 5xx
```

Then, with a real session cookie:

- `/dashboard` with a revoked cookie → `307`, not `200` with an embedded
  `NEXT_REDIRECT` (a segment `loading.tsx` is the usual cause).
- `/admin` as a student → `307 /dashboard?denied=admin`; as a super-admin →
  `200`.
- `POST /api/auth/logout` → `303` to the canonical origin, `Set-Cookie`
  clearing `cs_session`, and the session row's `revoked_at` set.
- `GET /api/search?q=…` 61 times → `60 × 200`, then `429`; `/api/me/export`
  four times → `3 × 200`, then `429`.
- Response headers include a nonce-based CSP, `X-Frame-Options: DENY`, HSTS and
  `Permissions-Policy`.
- `/dashboard/events/<id>/ticket` renders a QR only after `Check-in` is pressed;
  the code is stored in an `httpOnly` cookie, not in the URL.

## Test-data rules

- Never seed a production database; the seed script refuses.
- Events must be created with future dates (publishing a past event is refused
  by design), then backdated with SQL when a past event is needed.
- Never edit an applied migration; checksums are enforced.
- Tests create unique emails per run; the reset truncates identities.

## Gaps and why they matter

- **No browser automation.** Server actions are exercised at the service layer,
  not through a real browser. A click-path regression is possible; Playwright is
  the first post-launch investment.
- **No Rust execution.** Compilation errors are possible until CI runs. Treat the
  Rust build as unverified.
- **No accessibility tooling.** The layout follows WCAG 2.2 AA practices
  (labelled inputs, focus rings, 44px targets, reduced motion, semantic order),
  but no automated or assistive-technology audit has been recorded.
- **No performance budget in CI.** Bundle size and TTFB are observed manually;
  `npm run load` gives a 20-VU regression signal but not a capacity number.
- **No chaos/failover drill.** Dependency failure behaviour is implemented and
  documented but not exercised under a fault injector.
