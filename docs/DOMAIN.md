# The site address

The canonical origin of this deployment is **https://campus-spheree.vercel.app**.

It is set in exactly one place — the `NEXT_PUBLIC_SITE_URL` environment variable on
Vercel (production + preview) — and everything that has to agree about the origin
reads it: canonical links, `sitemap.xml`, `robots.txt`, `llms.txt`, the RSS feed,
OAuth redirect URIs and session-cookie scope.

There is **no custom domain** on this project. The host `campus-spheree.com` was
attached to the Vercel project at some point and then dropped; it has no DNS
records, resolves to nothing (`ENOTFOUND`) and cannot receive traffic. It is safe
to leave it attached and unused, or to remove it under Vercel → campus-web →
Settings → Domains.

## Why the Vercel URL is the canonical one

- It exists today, with a valid certificate, and is the host that is registered on
  the Google OAuth client — so sign-in works without anyone touching DNS.
- A canonical URL must be one that actually answers. Pointing canonicals at a
  domain that does not resolve pushes search engines to a dead host.
- Switching later is a variable change plus a redeploy, nothing else.

## When you do get a domain (optional, ~15 minutes)

1. **Attach it**: Vercel → campus-web → Settings → Domains → add the domain.
2. **Point DNS at Vercel** — either the `A`/`CNAME` records below, or move the
   nameservers to `ns1.vercel-dns.com` / `ns2.vercel-dns.com`:

   | Type | Name | Value |
   | --- | --- | --- |
   | `A` | `@` | `216.198.79.1` |
   | `A` | `@` | `64.29.17.1` |
   | `CNAME` | `www` | `91bf3867a6277b75.vercel-dns-017.com` |

   `76.76.21.21` also works as a single `A` value. Vercel shows the current
   recommended records on the domain's page — trust that panel over this table if
   they ever disagree.
3. **Change the canonical origin**:
   `NEXT_PUBLIC_SITE_URL=https://your-domain` (no trailing slash), then redeploy.
   The value is inlined at build time, so an existing deployment will not pick it
   up on its own.
4. **Google sign-in**: add `https://your-domain/api/auth/google/callback` to the
   OAuth client's authorised redirect URIs (Google Cloud Console → APIs &
   Services → Credentials). Google matches the string verbatim.
5. **Verify**:

   ```bash
   curl -sI https://your-domain | head -3
   curl -s  https://your-domain/robots.txt | tail -2
   curl -s  https://your-domain/sitemap.xml | head -4
   curl -s  https://your-domain/llms.txt | head -3
   ```

   Robots, sitemap and llms must all name the new domain. If they do not, the
   deployment predates the variable change — redeploy.

### `www`

Add `www.your-domain` in Vercel as a **redirect** (308) to the apex. Do not serve
both: two live origins split search signal and make the canonical link a lie on
one of them.

## Google sign-in on more than one host

The redirect URI follows the host the browser is actually on — canonical host, any
`*.vercel.app` alias, or an origin listed in `AUTH_ALLOWED_ORIGINS` — and the
callback repeats the same value for the token exchange. A host that is not
registered on the OAuth client fails with:

```
Error 400: redirect_uri_mismatch
```

That error is always a Google-side list problem: add the exact URI shown in the
error's "details" (or the host in your address bar plus
`/api/auth/google/callback`), wait a few minutes, and retry. Nothing in the
deployment needs to change.

## Certificate and HSTS

Vercel issues and renews the certificate. `Strict-Transport-Security` is set by
the app on every response, which is safe for hosts served only over HTTPS; do not
enable `includeSubDomains` until every subdomain is HTTPS too.
