# Launch checklist

Statuses are evidence-based. "Verified" (✅) means a command in this repository
was run in this workspace and passed. "Partial" (🟡) means part of the claim was
exercised under limited conditions, with the limit named in the row. "Open"
(⛔) means nothing was proven — including items that are implemented but
unproven.

## Build and quality gates

| # | Gate | Status | Evidence / next action |
| --- | --- | --- | --- |
| 1 | Web and fallback production builds | ✅ verified | `npm run build` in `apps/web`, `apps/next-fallback`; `next start` smoke (12 web checks) and `npm run smoke` with the fallback (16 checks) green on 2026-10-18 |
| 2 | TypeScript strict typecheck (4 workspaces) | ✅ verified | `npm run typecheck` |
| 3 | Integration tests on real PostgreSQL | ✅ 88/88 | `npm test` (15 files) |
| 4 | Migrations apply with checksum verification | ✅ 7/7 | `npm run db:migrate`, `db:status` |
| 5 | Schema invariants | ✅ | `npm run db:verify` |
| 6 | Rust fmt + Clippy + tests + release build | ⛔ **open** | no toolchain/crates.io here; CI job is defined but has never run |
| 7 | `Cargo.lock` committed | ⛔ **open** | must run `cargo generate-lockfile` with network access |
| 8 | Lint (ESLint) | ⛔ **open** | no ESLint config ships; add `eslint-config-next` and a `lint` script |
| 9 | Browser end-to-end (Playwright) | ⛔ **open** | smoke matrix is manual (`docs/TESTING.md`) |
| 10 | Accessibility audit (automated + AT) | ⛔ **open** | manual review only; run axe and one screen reader pass |
| 11 | Dependency audit | ✅ at install time | `npm audit --omit=dev` → 0 vulnerabilities; keep in CI |

## Functional gates

| # | Gate | Status | Notes |
| --- | --- | --- | --- |
| 12 | Guest browsing of clubs/projects/events/search | ✅ verified | HTTP 200 on seeded data |
| 13 | Google sign-in end-to-end | ⛔ **open** | needs real OAuth client + registered redirect URI; code path not exercised here |
| 14 | Development sign-in refused in production | ✅ unit-tested | env guard + route guard |
| 15 | Membership request → officer decision | ✅ integration test | plus service-level IDOR tests |
| 16 | Presidency handover keeps exactly one president | ✅ integration test | |
| 17 | Project proposal → admin review → public listing | ✅ integration test | |
| 18 | Project application → acceptance limited by slots | ✅ integration test | |
| 19 | Event approval → publish → registration | ✅ integration test | |
| 20 | Capacity races never oversubscribe | ✅ integration test | parallel registrations |
| 21 | Waitlist promotion on cancellation | ✅ integration test | |
| 22 | QR check-in single use, organizer only | ✅ integration test | UI renders QR server-side |
| 23 | Feedback only after the event | ✅ integration test | |
| 24 | Moderation report → resolution | ✅ integration test | |
| 25 | Audit log append-only | ✅ integration test + DB trigger | |
| 26 | Data export and account deletion | ✅ integration test | export route rate-limited |
| 27 | Maintenance mode blocks writes | ✅ integration test (boundary) | reads stay available |
| 28 | Email delivery | ⛔ **open** | console transport only; configure SMTP/Resend and send a real message |
| 28a | Image uploads (avatar, club logo/cover, project/event cover) | ✅ local driver, 🟡 S3 | presign → PUT → verify → attach → serve → supersede → delete exercised over HTTP against the dev server (10 tests) and against an S3-compatible stub covering path-style presigned PUT/GET, `HeadObject`, ranged reads, delete and CORS (7 tests). **Signature acceptance by Neon's real endpoint is unverified.** |
| 28b | `/media/<id>` redirect to object storage | 🟡 stub only | public-URL and presigned-GET branches covered against the stub; no real bucket has been configured from here |
| 28c | Bucket CORS applied from the app | 🟡 stub only | `npm run storage:cors` sends and reads back the rule; real Neon credentials not available here |
| 27a | One-URL first-run setup (`/api/initialize`) | ✅ verified | on a brand-new empty database, both the dev server and the **production build** applied all 7 migrations and created a super-admin; a second visit returned `read-only` without writing; `SETUP_TOKEN` mode returned `401` without/with a wrong token and `200` with the right one; the HTML page escaped its inputs |
| 27b | First-run window is closed once an admin exists | ✅ unit-tested | `decideAccess` refuses writes without a token after any super-admin exists; documented as a claim window in `docs/DEPLOY_QUICK.md` |

## Operations gates

| # | Gate | Status | Notes |
| --- | --- | --- | --- |
| 29 | Staging deployment of all services | ⛔ **open** | instructions written, never executed from here |
| 30 | Backup taken and **restore rehearsed** | 🟡 demo size only | `pg_dump` + `pg_restore` + `db:status` + `db:verify` rehearsed on 2026-10-18 (counts matched); production-size and Neon PITR restores still open — see `docs/OPERATIONS.md` |
| 31 | Alerts configured at the host | ⛔ **open** | thresholds documented, no paging system shipped |
| 32 | Failover/failback drilled | ⛔ **open** | fallback is read-only; no automatic switch claimed |
| 33 | Load test at target concurrency | 🟡 local baseline only | k6 plan unrun; a 20-VU single-process baseline (0 errors, p95 230 ms) is recorded in `docs/LOAD_TEST_PLAN.md`; the 3,000-user target is not validated |
| 34 | Security review / pen test | ⛔ **open** | no third-party audit |
| 35 | Secret rotation rehearsed | ⛔ **open** | procedure documented |
| 36 | Legal/privacy notice for the operator | ⛔ **open** | this repo provides a data inventory, not legal advice |
| 37 | University endorsement / affiliation | 🚫 **none claimed** | the product says it is independent |

## Session, authorization and transport (checked on the production build)

| # | Gate | Status | Evidence |
| --- | --- | --- | --- |
| 43 | Logout revokes the session server-side | ✅ verified | `revoked_at` set in PostgreSQL; the old cookie then gets `307 /login` on `/dashboard` and nested routes |
| 44 | Role checks return real redirects, not streamed 200s | ✅ verified | student → `/admin` and `/observatory` `307 /dashboard?denied=admin`; super-admin `200`; officer manage page `200` |
| 45 | Security headers and CSP | ✅ verified | nonce-based `script-src` with `strict-dynamic`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, `Permissions-Policy` |
| 46 | Rate limits enforced in production mode | ✅ verified | search `60 × 200` then `429`; export `3 × 200` then `429` |
| 47 | Super-admin bootstrap | ✅ verified | `bootstrapSuperAdmin()` creates or upgrades exactly one account, de-duplicates the role, writes an audit row; without `CONFIRM_SUPERADMIN` the CLI exits `2` |

## Content and product honesty

| # | Gate | Status |
| --- | --- | --- |
| 48 | No fabricated users, testimonials, partners or usage numbers | ✅ |
| 49 | Metrics read from the live database, unavailable ones labelled | ✅ |
| 50 | Accessibility statement describes real behaviour | ✅ (`/about`) |
| 51 | Demo content flagged and never seeded in production | ✅ seed guard + demo setting |
| 52 | Public pages disclose pilot status | ✅ footer and `/about#status` |

## Minimum bar to call this "launched"

1. Items 6, 7, 9, 10, 13, 28, 29, 30, 33 and 34 closed with recorded evidence.
2. A named operator owns the deployment, the database and the inbox.
3. A rollback and restore have been performed once, by that operator, in
   staging.
4. The privacy notice and acceptable-use text reflect the operator's actual
   hosting and retention choices.

Until then this is a **pilot build**, which is what the interface says.
