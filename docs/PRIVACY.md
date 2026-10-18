# Privacy

CampusSphere is designed to collect as little as possible while still running a
real community. This document is the plain-language inventory the product itself
links to, written for operators and contributors rather than lawyers.

## What is stored

| Data | Why | Retention |
| --- | --- | --- |
| Google subject, name, email, Google avatar URL, email-verified flag | identity and contact | until account deletion |
| Uploaded images (profile photo, club logo/cover, project/event cover) and their object keys | profile and club/project/event presentation | until replaced, deleted, or the account is deleted |
| Bio (optional) | profile | until account deletion |
| Club memberships, roles, join messages | participation | retained after deletion, author anonymised |
| Project proposals, applications, tasks, milestones, updates | collaboration | retained after deletion, author anonymised |
| Event registrations, waitlist position, attendance, feedback | running events | retained after deletion, attendee anonymised |
| Session token hashes, user agent, IP hash | security and replay protection | expired sessions pruned by the cleanup job |
| Rate-limit buckets (hashed IP or user id) | abuse prevention | pruned after 24 hours |
| API metrics (route, method, status, duration) | observability | `METRICS_RETENTION_DAYS`, default 30 |
| Audit events (actor, action, entity, metadata) | accountability | append-only, retained |
| Moderation reports | safety | retained for accountability, reporter name not public |
| Outbound email records | delivery debugging | pruned after 30 days |

No passwords, payment data, precise location, contacts, or device fingerprints
are stored. IP addresses are hashed before storage and are never displayed.

**Uploaded images are stored in object storage, not in PostgreSQL.** Pages
reference them as `/media/<id>`; the browser is then redirected to the bucket
(or to a short-lived signed URL when the bucket is private), so the storage host
appears in network requests but not in page markup. The app does not strip EXIF
metadata:
a photo taken on a phone may carry GPS coordinates. If that matters for your
pilot, ask people to upload screenshots/resized copies, or add transcoding
before launch (see the limitations in `docs/SECURITY.md`). Deleting an account
removes that person's profile photo from storage; replacing any image deletes
the previous object immediately.

## What is public

Guest-visible: club names, descriptions, officers' names, announcements,
approved public project summaries, published event details, and organisers'
names. Members-only projects and drafts are never public. Email addresses are
never rendered on public pages; admins see them in the operations console.

## Cookies

| Cookie | Purpose | Lifetime |
| --- | --- | --- |
| `cs_session` | signed-in session, HttpOnly | 14 days, revoked on sign-out |
| `cs_oauth_state`, `cs_oauth_verifier` | OAuth state binding and PKCE verifier | 10 minutes |
| `cs_checkin_code` | shows a fresh ticket QR after minting | 2 hours |

No analytics, advertising, or third-party tracking cookies exist. There is no
Google Analytics, no pixel, and no session-replay tool.

## Export and deletion

- **Export**: `/api/me/export` returns a JSON file containing the account,
  memberships, project roles and applications, event registrations,
  notifications, reports filed, and the person's own audit trail. Rate-limited
  to three exports per hour and recorded in the audit log.
- **Deletion**: profile → "Request account deletion" anonymises the account
  immediately (`Former member`, invalidated email, cleared avatar/bio/Google
  subject), revokes every session and writes an audit event. Contributions stay
  attached to an anonymous author so club and project history remains coherent.
  Backups age out on the operator's retention schedule; this is stated rather
  than promising instant erasure from backups.
- Deletion of content itself (e.g. a specific post) is handled by moderators via
  reports, not by the automated account flow.

## Children and consent

The platform is intended for university communities (18+ in most deployments).
Operators must set their own policy for minors and obtain consent where local law
requires it. No age verification is implemented; claiming it would be false.

## Sub-processors

Operators choose their own: Neon (database), Vercel (frontend), Render (Rust API,
fallback, worker), Google (OIDC), SMTP/Resend (email). Each must be listed in a
deployment's own privacy notice. This repository does not assume any of them are
in use.

## Data location and transfers

Determined by the operator's hosting regions. Neon/Vercel/Render may process data
outside the user's country; that disclosure belongs in the operator's notice.

## Contact

The repository profile lists the maintainer. There is no invented DPO address;
operators deploying the software must publish their own contact.
