# Deploy CampusSphere, step by step (full checklist)

> **Just want it live?** Follow [`DEPLOY_QUICK.md`](DEPLOY_QUICK.md): one Render
> service, three environment variables, and `/api/initialize` creates the
> database schema and your super-admin. This longer runbook is the production
> checklist — worker, fallback API, backups, monitoring, rollback — for the week
> you invite real users.

This is the ordered runbook for putting the build online. It assumes the
repository you are reading, a Neon account, a Render account and a Google Cloud
account. Every command is copy-paste ready; replace the values in `<…>`.

Nothing here has been executed against your accounts. The parts that *were*
verified in this workspace are labelled ✅; the rest is procedure.

**What you are deploying**

| Service | Runtime | Needed? | Why |
| --- | --- | --- | --- |
| `campussphere-web` | Next.js 16 | yes | the product itself |
| PostgreSQL (Neon) | Postgres 16/17 | yes | everything persists here |
| `campussphere-fallback-api` | Next.js route handlers | strongly recommended | read-only JSON API used as a failover and by external readers |
| `campussphere-worker` | Node + `tsx` | for email/reminders/cleanup | durable jobs; the web app only enqueues them |
| `campussphere-rust-api` | Rust + Actix | optional | read-only JSON API (`/api/v1/...`). CI builds, formats, lints and tests it, and builds the image on every push. The Next.js app does not call it; deploy it only if you want the Rust service. |

**Simplest setup:** one Render web service plus Neon — see
[`DEPLOY_QUICK.md`](DEPLOY_QUICK.md). Three environment variables, and
`/api/initialize` creates the schema.
**Cheapest sane setup with jobs:** that service, plus the worker (Render plans
without background workers cannot run it). The fallback API and the Rust API can
wait until you need them.

---

## Step 0 — get the code onto the branch you will deploy

The work is on `arena/d7dcb538-campus`. Deploy from `main` for anything real:

```bash
cd ~/Campus
git push origin arena/d7dcb538-campus        # already done
gh pr create --base main --head arena/d7dcb538-campus \
  --title "CampusSphere platform" --fill
gh pr merge --merge                           # after you have looked at it
git checkout main && git pull
```

Render and Vercel can both deploy a non-default branch, so you may skip the
merge while you are only testing. Do not test with production data.

---

## Step 1 — create the database (Neon)

1. Neon console → **New project**. Postgres 17 is fine; the migrations only use
   core features (`gen_random_uuid`, enums, triggers).
2. Choose the region closest to your users (Frankfurt for Tunisia/Europe).
3. Open **Connect** and copy **two** strings — this distinction matters:
   - **Pooled** (`...-pooler.<region>.aws.neon.tech/...`): runtime `DATABASE_URL`
     for the web app, fallback and worker.
   - **Direct** (same host without `-pooler`): used **only** for migrations and
     `pg_dump`. PgBouncer in transaction mode cannot run DDL reliably.
4. Append `?sslmode=require` if Neon did not already include it.

> `packages/core` no longer sends `statement_timeout`/`lock_timeout` in the
> startup packet. Neon's pooler rejects those with
> `unsupported startup parameter in options`, which would fail every
> connection. Client-side `query_timeout` (10 s) and per-transaction
> `SET LOCAL` are used instead. If you want a server-side cap too, set it on
> the role once, not per connection:
>
> ```sql
> ALTER ROLE <neon_role> SET statement_timeout = '10s';
> ```

**Checkpoint:** `psql "<direct-url>" -c "select current_database(), version();"`
prints one row.

---

## Step 2 — apply migrations from your machine (optional)

> The app can do this itself: opening `/api/initialize` (Step 3) applies every
> migration with the same ledger and checksums as this command. Use the CLI only
> if you prefer to see the output, or need to migrate before the first deploy.


Run these locally against the **direct** URL. The inline variable wins over
`.env`, which is important: your local `.env` points at the local database.

```bash
cd ~/Campus

DATABASE_URL='postgresql://…direct…/neondb?sslmode=require' npm run db:migrate
DATABASE_URL='postgresql://…direct…/neondb?sslmode=require' npm run db:status
DATABASE_URL='postgresql://…direct…/neondb?sslmode=require' npm run db:verify
```

Expected output:

- `applied 0001_…` through `0006_…`
- `6/6 applied, 0 pending`
- `all database invariants hold`

✅ This exact sequence (six checksummed migrations + every invariant) passes in
this workspace against PostgreSQL 16. Neon runs 16/17, which is compatible.

**Do not** run `npm run db:seed` against this database. It refuses when
`NODE_ENV=production`, and demo content does not belong in a real deployment.

---

## Step 3 — create the first super-admin

> Also optional: `/api/initialize?email=you@university.edu` creates the account
> with the same function this script calls. The CLI remains useful for automation.


Do this before anyone signs in, so the first account is the owner, not a
random early visitor. Same direct URL:

```bash
cd ~/Campus
CONFIRM_SUPERADMIN=you@university.edu \
DATABASE_URL='postgresql://…direct…/neondb?sslmode=require' \
npm run admin:bootstrap
```

Expected: `Created … as super_admin` and `Audit record written`.
The script exits `2` without `CONFIRM_SUPERADMIN`, and is safe to re-run.
The account links to Google the first time that email signs in.

✅ Verified in this workspace (create, re-run, role de-duplication, audit row).

---

## Step 4 — Google OAuth client

1. <https://console.cloud.google.com> → project → **APIs & Services** →
   **OAuth consent screen**: External; add your email as a test user while the
   app is in testing; scopes `openid`, `email`, `profile`.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorized JavaScript origins: `https://<your-web-domain>`
4. Authorized redirect URI — exact, no trailing slash:
   `https://<your-web-domain>/api/auth/google/callback`
5. Copy the client ID and client secret.

If you do not know the domain yet, deploy first (Step 5) with a placeholder,
then come back and add the assigned `https://campussphere-web.onrender.com`
(or Vercel) URL, plus your custom domain later. You can register more than one
redirect URI, which is the easiest way to move from a platform domain to a real
one.

The redirect URI is built from `NEXT_PUBLIC_SITE_URL`:

```ts
`${NEXT_PUBLIC_SITE_URL}/api/auth/google/callback`
```

so the variable and the Google console must match exactly, including `https`.

---

## Step 4b — image storage (your Neon bucket `campus`)

Avatars, club logos/covers and project/event covers are uploaded straight from
the browser to object storage. This project uses your existing **Neon Object
Storage bucket `campus`**, which is S3-compatible. Database rows keep a stable
`/media/<id>` URL, so the bucket host can change later without a data migration.

You need four values and one decision.

1. **Get the S3 endpoint for the branch you deploy against.**

   ```bash
   neon projects list                                   # find the project id
   neon branches list --project-id <project-id>         # find the branch id
   curl -s -H "Authorization: Bearer $NEON_API_KEY" \
     "https://console.neon.tech/api/v2/projects/<project-id>/branches/<branch-id>/storage"
   ```

   The response contains `s3_endpoint`, `region` and `force_path_style`. Use the
   **same branch** as your production database — storage credentials are
   branch-bound, and objects created on one branch are copy-on-write against its
   parent, not shared with it.

2. **Create a storage credential pair.**

   ```bash
   neon credentials create --scope storage:read --scope storage:write
   ```

   It prints the access key id (shown as `token_id`) and a secret key **once**.
   Map them to:

   | Credential field | Environment variable |
   | --- | --- |
   | `token_id` | `AWS_ACCESS_KEY_ID` |
   | `s3_secret_access_key` | `AWS_SECRET_ACCESS_KEY` |
   | `s3_endpoint` | `AWS_ENDPOINT_URL_S3` |
   | `region` | `AWS_REGION` |

   If you use the Neon CLI you can also run `neon env pull`, which writes the
   same `AWS_*` names into `.env`.

3. **Allow the browser to upload to the bucket (CORS).** Uploads go straight
   from the browser to the storage host, which is a different origin. Without a
   CORS rule the browser blocks the PUT before it is sent, and the only symptom
   is “the image did not reach storage” in the UI — nothing appears in the
   server logs. Apply the rule with:

   ```bash
   # AWS_* exported or in .env, NEXT_PUBLIC_SITE_URL set to the deployed origin
   NEXT_PUBLIC_SITE_URL=https://<your-web-domain> npm run storage:cors
   ```

   Expected output: `applied  GET,PUT,HEAD from https://<your-web-domain>`. Add
   extra origins (a second domain, a staging site) with
   `EXTRA_ORIGINS="https://a,https://b"`. Neon supports `PutBucketCors` and
   handles the preflight automatically; S3 ACL/policy writes are not supported,
   so bucket access level is set in the console, not here.

4. **Decide how images are served.** Both settings work; pick one:

   - **Private bucket (default).** Leave `STORAGE_PUBLIC_BASE_URL` unset.
     `/media/<id>` answers `302` to a presigned URL valid for a few minutes, so
     links cannot be shared forever and deleted images stop resolving.
   - **`public_read` bucket.** Set
     `STORAGE_PUBLIC_BASE_URL=https://<branch-id>.storage.c-<N>.<region>.aws.neon.tech/campus`
     (the pattern Neon documents; confirm it by opening any uploaded object).
     `/media/<id>` then redirects to that URL with a one-hour cache.

   Changing the access level later is a bucket setting, not a code change.
   Neon does not accept S3 ACL or bucket-policy calls (they return `501`), so set
   the access level in the console/API.

5. **Set these variables on every service that touches images** — the web
   service **and** the worker (the worker deletes files for abandoned uploads):

   ```
   STORAGE_BUCKET=campus
   AWS_ENDPOINT_URL_S3=<s3_endpoint>
   AWS_REGION=<region>
   AWS_ACCESS_KEY_ID=<token_id>
   AWS_SECRET_ACCESS_KEY=<s3_secret_access_key>
   S3_FORCE_PATH_STYLE=true
   STORAGE_PUBLIC_BASE_URL=        # only for a public_read bucket
   ```

   In `render-full.yaml` these are already declared; `AWS_*` and
   `STORAGE_PUBLIC_BASE_URL` are `sync: false`, so paste the values in the
   Render dashboard. On Vercel, add them to the web project.

6. **Verify after the deploy** — this is the part that proves storage works:

   ```bash
   # as a club president: Club → Manage → Images → Choose image
   curl -sI https://<web>/media/<id-from-the-page-source> | head -5
   # private bucket:  302 → https://<branch>.storage…/campus/…?X-Amz-Signature=…
   # public_read:     302 → https://<branch>.storage…/campus/…
   ```

   Then replace the image once and confirm the old `/media/<id>` returns `404`
   (the superseded object is deleted). In the browser, an upload shows
   “Uploading…” then “Image saved.”; a CORS problem shows
   “The image did not reach storage. Try again.”

**Limits enforced by the app:** JPEG, PNG, WebP or AVIF; 5 MB per image; the
bytes are checked against the file's magic number before anything is attached;
30 upload requests/hour per user.

**Local development:** leave all of it blank. The app falls back to a
filesystem driver (`.data/uploads`), which the code refuses to use in
production.

**What is verified here and what is not.** The whole flow — presign → browser
PUT → size/type/magic-byte verification → attach → `/media/<id>` redirect →
replace → delete — runs in this repository two ways: against the local driver
over HTTP, and against a local S3-compatible stub that the tests start
themselves (`packages/core/test/s3-stub.ts`), which proves path-style URLs,
presigned PUT/GET shape, `HeadObject`, ranged reads, deletes and the CORS
round-trip. What has **not** been executed is Neon's real endpoint with real
credentials: signature acceptance, bucket permissions and the exact public URL
pattern are the parts only your deployment can confirm. If an upload fails,
the troubleshooting table at the end of this document is ordered by likelihood.

---

## Step 5 — deploy on Render

**Quick path:** [`deployment/render.yaml`](../deployment/render.yaml) creates a
single web service — that is all the product needs. The four-service topology
described in this step lives in
[`deployment/render-full.yaml`](../deployment/render-full.yaml); to use it,
either copy it over `render.yaml` or point the Render Blueprint at that path.

The full blueprint is [`deployment/render-full.yaml`](../deployment/render-full.yaml).

1. Edit the placeholders **before** syncing. Replace every
   `https://campussphere.example.edu` with the URL the web service will have.
   If you use the default Render domain, put
   `https://campussphere-web.onrender.com` (the service name is in the file).
2. Commit and push the edit.
3. Render dashboard → **New → Blueprint** → connect
   `Nour-yahyaoui/Campus` → pick the branch → **Apply**. Render creates the
   services in the file.
4. Fill the `sync: false` secrets per service:

| Service | Variables |
| --- | --- |
| `campussphere-web` | `DATABASE_URL` (pooled), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AWS_*` + `STORAGE_PUBLIC_BASE_URL` if used (Step 4b) |
| `campussphere-fallback-api` | `DATABASE_URL` (pooled) |
| `campussphere-worker` | `DATABASE_URL` (pooled), `AWS_*` (Step 4b) |
| `campussphere-rust-api` | `DATABASE_URL` (pooled) — only if you deploy it |

5. If you are **not** deploying the Rust API yet, delete its block from
   `render-full.yaml` before applying (or suspend the service afterwards). It is
   unproven; the fallback already serves reads.
6. If you are on a plan without background workers, delete the worker block.
   Emails, reminders and cleanup will not run — `outbound_emails` rows will
   accumulate as failed jobs, which is visible rather than silent.

What the blueprint already handles, and why:

- `npm ci --include=dev` at build time. `next build` and the worker's `tsx`
  runner need dev dependencies; setting `NODE_ENV=production` without this flag
  makes `npm ci` skip them and the build/runtime breaks.
- `next start --port ${PORT:-3000}`. Render routes traffic to the
  port it puts in `$PORT`; a hardcoded port can leave the service unreachable.
- Health checks on `/api/health/ready` (web) and `/health/ready` (fallback).
  The web check returns `503` and names the missing variable when the
  configuration is wrong, so a bad deploy fails instead of serving 500s.

**Checkpoint after the first build:**

```bash
curl -fsS https://<web>/api/health/ready          # {"status":"ok", …,"storage":{"driver":"s3",…}}
curl -fsS https://<fallback>/health/ready         # {"status":"ok", …}
curl -fsS "https://<fallback>/api/v1/clubs" | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<fallback>/api/v1/clubs \
  -H 'content-type: application/json' -d '{}'      # expect 503, nothing written
```

✅ These endpoints and the read-only refusal were verified locally against the
production build. The hosted run is yours to confirm.

---

## Step 5b — alternative: web on Vercel instead of Render

Only if you are **not** using the Render web service. The fallback and worker
still belong on Render.

1. Vercel → **Add New → Project** → import the repository.
2. **Root Directory: `apps/web`** — not the repository root. Framework preset:
   **Next.js**. Node.js version: **22.x**.
3. Project Settings → General → enable
   **“Include source files outside of the Root Directory in the Build Step.”**
   This is required: `apps/web` imports `packages/core` and
   `packages/contracts`, which sit outside its root.
4. Environment variables (Production **and** Preview, separately):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon **pooled** URL |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-web-domain>` |
   | `GOOGLE_CLIENT_ID` | from Step 4 |
   | `GOOGLE_CLIENT_SECRET` | from Step 4 |
   | `ALLOW_DEV_SIGN_IN` | `false` |
   | `DB_POOL_MAX` | `5` |
   | `EMAIL_TRANSPORT` | `console` until Step 8, then `resend` or `smtp` |
   | `STORAGE_BUCKET` | `campus` |
   | `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | from Step 4b |
   | `S3_FORCE_PATH_STYLE` | `true` |
   | `STORAGE_PUBLIC_BASE_URL` | only for a `public_read` bucket |

5. Leave **Build & Development Settings** at their defaults. `apps/web` has a
   `postinstall` that installs the repository root when `packages/core`'s
   dependencies are missing, so the default install inside `apps/web` still
   produces a complete build. (Without it, the build fails with *Module not
   found* for `pg`, `jose` and the AWS SDK.)
6. Deploy, then check `https://<web>/api/health/ready`.

Preview deployments must not point at the production database, and should use a
separate Google client (a separate redirect URI is enough). This is a hard rule
in `docs/SECURITY.md`, not a suggestion.

---

## Step 6 — run the smoke checks against the deployed URLs

```bash
cd ~/Campus
BASE_URL=https://<web> FALLBACK_URL=https://<fallback> npm run smoke
```

Expected: 12 web checks + 4 fallback checks, all `PASS`, including the
anonymous `/dashboard → 307 /login` redirect.

Then in a browser:

- [ ] `/` , `/clubs`, `/events`, `/projects`, `/search` render seeded readers
      correctly (there is no demo content in production — empty states should
      look deliberate, not broken).
- [ ] **Continue with Google** completes and lands on `/dashboard`.
- [ ] A normal account visiting `/admin` is redirected to
      `/dashboard?denied=admin`; the super-admin from Step 3 gets a real `200`.
- [ ] `/observatory` loads for the super-admin only.
- [ ] Upload a club logo and a profile photo; both render, and replacing one
      leaves the previous `/media/<id>` at `404` (Step 4b, point 5).
- [ ] Create a club, submit a project proposal, approve it in `/admin`.
      Approving writes an audit row and enqueues an email job.
- [ ] Headers: `curl -sI https://<web>/ | grep -iE "content-security|x-frame|strict-transport"`.

✅ The role redirects, logout revocation, CSP/HSTS headers, rate limits and the
upload flow (local storage driver) were verified against the production build
and a running dev server. The OAuth handshake with real
Google credentials is the one thing that can only be verified on your
deployment.

---

## Step 7 — custom domain (do this before inviting people)

1. Render: service → **Settings → Custom Domain**, add `campus.example.edu`,
   create the shown CNAME. Vercel: **Settings → Domains**.
2. Wait for the certificate, then change `NEXT_PUBLIC_SITE_URL` to the new
   origin on **every** service and redeploy.
3. Add `https://<domain>/api/auth/google/callback` to the Google client and
   keep the old one until you have confirmed sign-in works on the new domain.
4. Confirm `Set-Cookie` is `Secure` and that an `http://` request redirects to
   `https://`.

Session cookies are `Secure` whenever `NODE_ENV=production`, so a plain-HTTP
origin will silently fail to sign in.

---

## Step 8 — email (required before real use)

The default transport is `console`, and it **throws in production** rather than
pretending to deliver. That is deliberate: failed jobs land in
`outbound_emails` with `status = 'failed'`.

Resend (simplest):

1. Create a Resend account, verify your sending domain, create an API key.
2. Set on web **and** worker: `EMAIL_TRANSPORT=resend`,
   `RESEND_API_KEY=<key>`, `EMAIL_FROM=CampusSphere <no-reply@your-domain>`.
3. Redeploy both. The worker must be running — the web app only enqueues jobs.
4. Trigger something (approve a project) and check the worker log, then:

   ```sql
   select provider, status, recipient, subject, created_at
     from outbound_emails order by created_at desc limit 5;
   ```

SMTP instead: `EMAIL_TRANSPORT=smtp` and `SMTP_URL=smtps://user:pass@host:465`.

---

## Step 9 — backups and monitoring

1. **Neon:** check the plan's PITR/backup window. Do not assume it exists.
2. **Logical backup** on a schedule (cron, GitHub Action or your laptop):

   ```bash
   pg_dump "<direct-url>" --format=custom --no-owner --no-acl \
     --file="campussphere-$(date -u +%Y%m%dT%H%MZ).dump"
   ```

   Store encrypted, 14–30 day retention. ✅ The dump → restore → `db:status` →
   `db:verify` path was rehearsed in this workspace at demo size; see
   `docs/OPERATIONS.md`.
3. **Uptime monitor** (Render, BetterStack, UptimeRobot — anything):
   `https://<web>/api/health/ready` and `https://<fallback>/health/ready`.
   Alert to an inbox someone reads.
4. **App-level health**: `/observatory` shows measured API, database and job
   metrics. It is not a replacement for external monitoring; it cannot tell you
   the process is dead.
5. Set `METRICS_RETENTION_DAYS` deliberately (default 30).

---

## Step 10 — rollback plan (write it down before you need it)

- **Code:** Render → Deploys → select the previous successful deploy →
  **Rollback** (or redeploy the older commit). Vercel → Deployments →
  **Instant Rollback**.
- **Migrations are forward-only.** Never edit an applied file: the runner
  verifies checksums and will refuse. If a migration is wrong, write a new one.
- **Data:** restore from a dump into a *new* database, verify, then repoint
  `DATABASE_URL` — never restore over the live one.
- **Configuration:** keep the previous env values in a password manager; the
  health check will tell you what is missing after a rollback.

---

## Troubleshooting the first deploy

| Symptom | Cause | Fix |
| --- | --- | --- |
| `node: .env: not found` in worker logs | old script used `--env-file=.env` | pull this commit: scripts now use `--env-file-if-exists` |
| Every page 500s with `ALLOW_DEV_SIGN_IN must be false in production` | `.env`-style config leaked into production | set `ALLOW_DEV_SIGN_IN=false` |
| `/api/health/ready` is `503`, `config` check fails | Google credentials missing on web | set `GOOGLE_CLIENT_ID`/`SECRET` (web only) |
| `unsupported startup parameter in options` from Neon | startup `options` sent to the pooler | pull this commit (pool now uses client-side timeout); never pass `options=-c …` to a Neon *pooled* URL |
| `password authentication failed` | wrong URL, or direct/pooled mixed up | runtime = pooled, migrations = direct |
| `too many connections` | pool size × instances exceeds Neon's limit | lower `DB_POOL_MAX`, use the pooled URL |
| Build fails: `next: not found`, `tsc: not found` | `npm ci` skipped dev dependencies | `npm ci --include=dev` (already in `render.yaml`) |
| Port scan fails / service never healthy | hardcoded port | `next start --port ${PORT:-3000}` (already fixed) |
| `redirect_uri_mismatch` on Google | URI differs by scheme, host or trailing slash | match `NEXT_PUBLIC_SITE_URL` exactly; register both domains |
| Sign-in loops back to `/login` | cookie rejected: HTTP origin, or `NEXT_PUBLIC_SITE_URL` on a different host | use HTTPS, one canonical host |
| Migrations hang or fail on Neon | ran against the pooled URL | use the direct URL for `db:*` |
| Health check times out on a free Neon plan | compute suspended, cold start | retry, raise the health-check timeout, or use a paid plan |
| Uploads fail with "did not reach storage" | `AWS_*` missing, or the bucket/region/endpoint is wrong | check `curl -s https://<web>/api/health/ready` → `storage.driver` must be `s3`; recheck Step 4b |
| Uploads fail with `403` from storage | credentials lack `storage:write`, or belong to another branch | recreate the credential pair with both scopes on the production branch |
| Upload shows “did not reach storage”, no server log line | browser blocked the cross-origin PUT — no CORS rule, or the origin is not listed | run `NEXT_PUBLIC_SITE_URL=https://<web> npm run storage:cors`, then retry |
| `npm run storage:cors` says storage is not configured | `AWS_*` missing in the shell or `.env` | export the four values (Step 4b, point 2) before running it |
| An uploaded image 404s on other devices | the `complete` step never ran, so the object stayed `pending` | check `media_assets.status`; the hourly cleanup job removes abandoned rows |
| Bucket is private but images do not load | `STORAGE_PUBLIC_BASE_URL` points at a non-public bucket | unset it and let `/media/<id>` issue presigned redirects |
| Emails never arrive | worker not running, or console transport | deploy the worker; set Resend/SMTP (Step 8) |

---

## What "deployed" still does not mean

A green deploy closes gates 29 (staging deployment) and most of 13 (Google
sign-in) in [`docs/LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md). It does **not**
close: Rust compilation, the k6 run at target concurrency, browser E2E,
accessibility audit, a third-party security review, a production-size restore,
or the legal/privacy review. Keep the launch checklist next to the deployment.
