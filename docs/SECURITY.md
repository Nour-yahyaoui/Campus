# Security

## Reporting

Please use a **private GitHub security advisory** on the repository
(`Security → Advisories → Report a vulnerability`). Do not open a public issue
for an unfixed vulnerability. Include reproduction steps, affected URL/version,
and impact. There is no bug bounty; this is a student-run project and that is
stated plainly rather than implied with a fake programme.

## Threat model

| Asset | Threat | Control |
| --- | --- | --- |
| Sessions | theft via XSS or logs | HttpOnly + SameSite=Lax cookie, Secure in production, opaque token stored only as SHA-256, revoked on sign-out/suspension/role loss |
| Accounts | takeover via OAuth confusion | PKCE, state and nonce compared in constant time, ID token signature/issuer/audience/expiry checked, `email_verified` required, no implicit flow |
| Admin actions | privilege escalation | roles re-read per request, `super_admin` required in the service layer, self-demotion/self-suspension blocked, last-admin protection, sessions revoked on admin removal |
| Club/project/event data | IDOR (swapping ids) | every mutation loads the target, resolves the actor's role on that target, and checks permission; covered by tests that swap ids |
| Registration | oversubscription via races | `select … for update` on the event row inside a transaction; partial unique index on active registrations |
| Check-in | sharing or replaying codes | short-lived, single-use tokens; only the hash stored; consumption updates `used_at` atomically; organizer role required |
| Audit trail | tampering | append-only trigger rejects `UPDATE`/`DELETE`; writes happen in the same transaction as the action where practical |
| Abuse | spam reports/registrations | per-account and per-IP fixed-window limits stored in PostgreSQL |
| Cross-site requests | CSRF | SameSite=Lax cookies, server-action origin checks, explicit `Origin` validation on API mutations |
| XSS | injected content | React escaping, no `dangerouslySetInnerHTML`, CSP with per-request nonce and `strict-dynamic`, no third-party scripts |
| Clickjacking | framing | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| Data leaks via errors | stack traces/SQL | public error envelope; details logged server-side with a correlation id |
| Supply chain | vulnerable dependencies | pinned versions, lockfile, `npm audit`, CI on every change |

## Implemented controls (evidence)

- **Passwordless by design.** No passwords are stored, so there is no password
  hashing to get wrong and no reset flow to abuse.
- **Session storage.** `sessions.token_hash`, `expires_at`, `revoked_at`,
  `last_used_at`; resolution rejects expired, revoked, suspended and deleted
  accounts.
- **OAuth state.** `oauth_states` stores SHA-256 hashes of state, nonce and the
  PKCE verifier with a ten-minute expiry; the raw values live only in HttpOnly
  cookies. A replayed or unknown state is rejected.
- **Development sign-in** is compiled into the product but impossible in
  production: `loadEnv()` throws if `NODE_ENV=production` and
  `ALLOW_DEV_SIGN_IN=true`. The route refuses to run in production even if the
  flag is flipped at runtime.
- **Authorization tests** cover: non-member editing a club, member granting
  roles, non-lead deciding applications, non-organizer checking in, anonymous
  access to unapproved projects, and members-only project visibility.
- **CSP** is generated per request in `apps/web/proxy.ts`: no third-party
  script origins, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`. Styles allow inline because React style attributes
  require it; scripts do not.
- **Headers** set globally: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, a restrictive `Permissions-Policy`, and HSTS in production.
- **Privacy by minimisation.** Rate-limit buckets and metrics store hashed
  identities, not raw IPs. Audit metadata never contains tokens, passwords or
  full request bodies.
- **Uploads are constrained images, not arbitrary files.** The browser receives
  a short-lived presigned PUT for a server-generated key; the bytes never pass
  through the app server in production. At completion the server re-reads the
  object and checks byte size, declared content type **and the file's magic
  number** against JPEG/PNG/WebP/AVIF before attaching anything. SVG is not
  accepted (it is a script container). Keys are generated server-side and
  validated (`no ".."`, no empty segments, fixed prefix per kind) before any
  filesystem or storage access, and the local driver also resolves the path and
  refuses anything outside its root. Authorization is per kind: club content
  editors for logos/covers, project leads, event organizers, self for avatars.
  Limits: 5 MB, 30 presigns/hour/user, superseded objects are deleted.
- **Dependency scanning** in CI (`npm audit --omit=dev`), plus Dependabot-ready
  lockfiles.

## Known limitations — read before deploying

1. **No independent audit.** The code has not been reviewed by a third party.
2. **No antivirus/CDN/WAF.** Rate limits and CSP are the perimeter.
3. **Email is not authenticated.** Invite-only clubs rely on officers, not on
   verified university email. Google verifies the address; the product does not
   confirm enrolment.
4. **The Rust API is unproven until CI compiles and tests it.** Its SQL mirrors
   the TypeScript queries but has not executed in this environment.
5. **Secrets are environment variables.** There is no KMS/secret manager
   integration. Session tokens are opaque random values stored as hashes, so
   there is no signing secret to rotate; revoke sessions explicitly or use
   suspension when an account is compromised.
6. **No SQL-level protection against a compromised app process.** The app's
   database role can read and write all product tables; row-level security is
   not used because authorization is enforced in the service layer and tested
   there. A production hardening step is to give the runtime role only the
   privileges it needs and keep migration credentials separate.
7. **Maintenance mode is enforced at the request boundary**, not inside every
   SQL function. Callers bypassing the service layer (psql) are not blocked.
8. **Images are not re-encoded, resized or stripped.** The magic-number check
   proves the file is an image, not that the image is safe for every decoder;
   EXIF metadata (including GPS coordinates in a phone photo) is preserved.
   A production hardening step is to transcode on upload (strip EXIF, cap
   dimensions, re-encode) behind a queue.
9. **Object storage credentials are long-lived** (Neon `storage:read` /
   `storage:write`). There is no upload-through-the-app fallback in production
   and no per-user signed URL beyond five minutes, but rotate the pair if it
   leaks: old presigned URLs die with it.

## Security-relevant configuration

| Variable | Requirement |
| --- | --- |
| `NODE_ENV=production` | mandatory in production; enables Secure cookies, HSTS and blocks dev sign-in |
| `GOOGLE_CLIENT_ID/SECRET` | required to run the web app in production; the read-only fallback and the worker do not need them |
| `DATABASE_URL` | TLS to Neon; `sslmode=require` is inferred for non-local hosts |
| `ALLOW_DEV_SIGN_IN` | must be `false` in production |
| `RATE_LIMIT_DISABLED` | must be `false` in production |
| `AWS_ACCESS_KEY_ID/SECRET_ACCESS_KEY` | storage credentials; keep on web + worker, never in the client bundle |
| `STORAGE_BUCKET` | `campus`; a private bucket means `/media/<id>` issues presigned redirects |
| `STORAGE_PUBLIC_BASE_URL` | only for a `public_read` bucket — setting it on a private bucket produces broken images, not a leak |

## Operational security

- Migrations run as a single step, never concurrently from every instance.
- The audit table is append-only by trigger.
- Backups must be encrypted at rest (Neon default) and restoration tested.
- Logs are structured JSON in Rust and console output in Next.js; neither logs
  cookies, tokens or request bodies.
