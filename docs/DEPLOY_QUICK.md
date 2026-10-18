# Deploy CampusSphere — the short version

**One service, one database, three variables, one URL to open.** No migration
commands, no seed step, no worker to start.

Everything below assumes you are deploying from this repository and that you
already have a Neon database (you do — the bucket `campus` lives in the same
project).

> There is no separate "frontend URL" to configure. The web app renders the
> pages *and* serves the API on the same origin, so the browser only ever talks
> to one host. That is why the configuration is smaller than a split
> front-end/back-end setup: there is only one thing to deploy.

---

## 1. Copy the database connection string (1 minute)

1. <https://console.neon.tech> → your project → **Connect**.
2. Select the branch you deploy against (usually `main`).
3. Copy the **pooled** connection string — the host contains `-pooler`.
4. Make sure it ends with `?sslmode=require`.

```
postgresql://neondb_owner:…@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

That is the only database thing you need. **Do not run any SQL.**

## 2. Create the Google sign-in client (3 minutes)

1. <https://console.cloud.google.com> → **APIs & Services** → **OAuth consent
   screen** → External → add your own email as a test user.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorized redirect URIs — exactly this shape, no trailing slash. Google
   matches the string verbatim and the flow starts on whatever host the browser
   is on, so register **every host you will use** — the Render/Vercel URL *and*
   your own domain:

   ```
   https://<your-app-url>/api/auth/google/callback
   https://<your-domain>/api/auth/google/callback
   ```

   A missing entry is the `Error 400: redirect_uri_mismatch` screen. The app
   follows the host you browse (Vercel aliases automatically; other hosts via
   `AUTH_ALLOWED_ORIGINS`), so the fix is on Google's side, not in the code.

   If you do not know the URL yet, come back to this field after step 3; Render
   gives you the URL. You can add several redirect URIs, so adding one later is
   normal.
4. Copy the **client ID** and **client secret**.

## 3. Deploy on Render (3 minutes)

1. Render → **New → Blueprint** → connect `Nour-yahyaoui/Campus` → pick your
   branch → **Apply**.
   It reads [`deployment/render.yaml`](../deployment/render.yaml) and creates one
   web service named `campussphere`.
2. Open the new service → **Environment** → fill the three secrets:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the pooled Neon string from step 1 |
   | `GOOGLE_CLIENT_ID` | from step 2 |
   | `GOOGLE_CLIENT_SECRET` | from step 2 |

   That is the entire required configuration. `NEXT_PUBLIC_SITE_URL` is not
   needed: Render exposes the service URL to the app automatically.
3. **Manual Deploy → Deploy latest commit** (or let it build on push).
4. Wait for the build. `https://<your-app-url>/api/health/ready` should answer
   `{"status":"ok", …}` even though the database is still empty — that is
   expected and intentional.

## 4. Create the database and your account (10 seconds)

Open this URL in a browser, with your own email:

```
https://<your-app-url>/api/initialize?email=you@university.edu
```

You will see **Setup complete**:

- every migration applied (the same ledger the CLI uses, so nothing can drift),
- your email created as the first super-admin.

Then go to `/login`, choose **Continue with Google**, and sign in with that same
email. The account is already linked, so you land in `/dashboard` as a
super-admin. Create your first club or approve the first project from `/admin`.

Visiting the URL again is safe: it reports status and changes nothing.

### Optional: fill it with a demo campus first

An empty product is hard to judge. Add `&demo=light` and the same URL also
inserts a small, realistic catalogue — 12 clubs, 12 projects, 40 events (some
awaiting review), 68 people and their memberships and registrations:

```
https://<your-app-url>/api/initialize?demo=light
```

It runs in about a second, in one transaction, and only on a database whose
catalogue is still empty; a second call reports that it is already there. It can
never create a super-admin, so `&email=` still works afterwards — do the demo
first, then your account, or combine both in one URL. Remove the demo with
`node scripts/db.mjs reset`, or leave it: demo people are on
`@students.example.edu`, which cannot sign in.

### Optional: lock the setup URL

The first visit is open only while **no super-admin exists**, then the route goes
read-only — but you can require a secret from the start. Add one variable in
Render:

```
SETUP_TOKEN=<any long random string>
```

and open `…/api/initialize?token=<that string>&email=you@university.edu`.
Without the token the route answers `401`. Use a password manager to generate
it; `openssl rand -hex 24` works too.

---

## Optional extras (do these later)

### Your own domain

1. Render → your service → **Settings → Custom Domains** → add the domain.
2. Add `NEXT_PUBLIC_SITE_URL=https://your.domain` to the service's environment
   (no trailing slash) and redeploy.
3. In Google Cloud, add `https://your.domain/api/auth/google/callback` as a
   second redirect URI.

Without that variable the app keeps using the Render URL, which still works.

### Images (avatars and covers)

Uploads are off until you point the app at the `campus` bucket; the rest of the
site works normally and the uploader shows a clear message.

1. Get the endpoint and a credential pair for the production branch — details in
   [`DEPLOY_STEPS.md`](DEPLOY_STEPS.md) § Step 4b.
2. Add `STORAGE_BUCKET=campus`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`,
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (`S3_FORCE_PATH_STYLE=true`) to
   the service.
3. Run the CORS step once from your machine, with the same values in `.env`:

   ```bash
   NEXT_PUBLIC_SITE_URL=https://<your-app-url> npm run storage:cors
   ```

4. Upload a logo from a club's **Manage → Images** page.

### Background email, reminders and cleanup

A worker is optional: without it, emails stay queued in `outbound_emails`
(visible in `/observatory`) and nothing is sent. To enable them, add the worker
service from [`DEPLOY_STEPS.md`](DEPLOY_STEPS.md) § Step 5 and configure
`RESEND_API_KEY` or `SMTP_URL` on it and on the web service.

### Separate fallback API and Rust API

Neither is needed for the site to work. [`deployment/render-full.yaml`](../deployment/render-full.yaml)
contains the four-service topology for when you want them.

---

## If something goes wrong

| Symptom | Fix |
| --- | --- |
| Blueprint build fails with `next: not found` | the build command must be `npm ci --include=dev && …` (already in the file) |
| `/api/initialize` says the database could not be prepared | `DATABASE_URL` must be the **pooled** Neon string including `?sslmode=require`, and the branch must be awake |
| `redirect_uri_mismatch` | the callback URL in Google must match the deployed origin exactly (scheme, host, no trailing slash) |
| Sign-in bounces back to `/login` | you are on an `http://` URL or a different host than the one the cookie was set for; use the canonical `https://` URL |
| Upload says “did not reach storage” | image storage is not configured yet, or the CORS rule is missing (see *Images*) |
| `/api/initialize` answers `403` | a super-admin already exists; append `?token=…` after setting `SETUP_TOKEN` if you really need to re-run it |

The long-form production checklist — backups, worker, monitoring, rollback,
security review — is [`DEPLOY_STEPS.md`](DEPLOY_STEPS.md). Keep it for the week
you invite real users.
