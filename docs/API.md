# API

The machine-readable contract is [`openapi/openapi.yaml`](../openapi/openapi.yaml).
This page explains the behaviour that matters when integrating.

## Versioning and shape

- Base path: `/api/v1`. Breaking changes require a new version path.
- JSON only. Request bodies must send `content-type: application/json` and are
  rejected above 512 KB.
- Success: `{ "data": … }`, lists add `{ "meta": { "nextCursor": … } }`.
- Errors: `{ "error": { "code", "message", "details"?, "correlationId"? } }`.
  `details` is only populated for validation failures and never contains
  internal identifiers or provider messages.
- Timestamps are ISO-8601 UTC. Cursors are opaque; do not parse them.

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `invalid_request` | 400 | schema or query validation failed |
| `unauthorized` | 401 | no session, expired or revoked |
| `forbidden` | 403 | authenticated but not allowed |
| `not_found` | 404 | absent, or deliberately hidden from this viewer |
| `conflict` | 409 | duplicate membership/registration, stale decision, last-admin guard |
| `rate_limited` | 429 | see `details.retryAfterSeconds` |
| `unavailable` | 503 | maintenance, fallback write refusal, dependency down |
| `internal_error` | 500 | logged with a correlation id; no internals leaked |

## Authentication

Browser clients use the HttpOnly `cs_session` cookie. Server-to-server clients
send the same opaque token as `Authorization: Bearer <token>`. There are no
long-lived API keys. Sessions are revoked server-side; a token cannot be
extended client-side.

Cookie-authenticated mutations verify `Origin` against the canonical site and
the request host. Server Actions additionally use Next.js's built-in origin
check.

## Pagination and filters

- `limit` defaults to 12, maximum 48. Requesting more than 48 is clamped, not
  rejected.
- `cursor` is the previous response's `meta.nextCursor`.
- Lists expose only public data: active clubs, approved public projects,
  published events. Drafts, submissions and members-only projects never appear,
  even with a valid cursor.
- Search requires at least two characters; shorter queries return an empty
  result set without touching the database.

## Implemented surface

The Rust API and the fallback API implement the routes below. The web app is
not a client of them yet (see ARCHITECTURE.md).

| Route | Rust primary | Next.js fallback |
| --- | --- | --- |
| `GET /health/live` | yes | yes |
| `GET /health/ready` | yes | yes |
| `GET /api/v1/clubs` | yes | yes |
| `GET /api/v1/projects` | yes | yes |
| `GET /api/v1/events` | yes | yes |
| `GET /api/v1/search` | yes | yes |
| `GET /api/v1/me` | yes | yes |
| any mutation | `503` | `503` |
| unknown route | JSON `503` (primary) | JSON `404` |

The fallback also serves a service index at `/` and `/api/v1`.

### Web app routes (same origin as the pages)

These are internal to `apps/web` and are what the browser actually calls.

| Route | Purpose |
| --- | --- |
| `GET/POST /api/initialize` | first-run setup: applies pending migrations and optionally creates the first super-admin (`?email=`). Requires `?token=` when `SETUP_TOKEN` is set; read-only once a super-admin exists |
| `POST /api/uploads` | authorizes an image upload and returns a presigned PUT (`{ mediaId, upload: { url, method, headers }, expiresIn }`) |
| `PUT /api/uploads/body?key=…` | local-driver only (development); never reachable when object storage is configured |
| `POST /api/uploads/:id/complete` | verifies size, content type and magic bytes, then attaches the image |
| `DELETE /api/uploads/:id` | removes an image and clears the reference |
| `GET /media/:id` | stable image URL: `302` to the public object URL or to a short-lived presigned URL, or streams the bytes for the local driver |
| `GET /api/health/live`, `/api/health/ready` | liveness and readiness (database, configuration; storage is reported but does not gate) |

## Fallback semantics

The fallback is **read-only by design**. A write returns:

```json
{
  "error": {
    "code": "unavailable",
    "message": "The fallback API is read-only. This mutation … send it to the primary API.",
    "correlationId": "…"
  }
}
```

with HTTP 503 and no side effects. It shares the same database, so a read served
by the fallback reflects the same state as the primary API. It has its own
liveness/readiness endpoints and metrics.

Failover is **not automatic**. Choosing and testing a traffic switch is an
operator decision; nothing in this repository claims that Render or Vercel will
route around a failed primary. See docs/DEPLOYMENT.md.

## Rate limits

| Surface | Limit |
| --- | --- |
| `GET /api/search` (web) | 60 / minute / IP |
| `GET /api/me/export` | 3 / hour / account |
| Development sign-in | 10 / 5 minutes / IP |
| Moderation reports | 8 / hour / account |
| Fallback reads | 120 / minute / IP / route |
| Rust reads | 120 / minute / IP / route |

Buckets are keyed by a SHA-256 prefix of the forwarded IP or by account id —
never by the raw address. Counters live in PostgreSQL so instances agree and
survive restarts; the cleanup job prunes them.

## CORS

The Rust API allows exactly the configured `NEXT_PUBLIC_SITE_URL` origin, with
credentials, and only `GET`/`HEAD`/`OPTIONS`. The fallback sends no CORS headers:
it is intended for server-to-server calls. Neither accepts `*`.
