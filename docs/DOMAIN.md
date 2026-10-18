# Custom domain: campus-spheree.com

The canonical origin for the web app is **https://campus-spheree.com**. Everything
that has to agree about the origin — canonical links, `sitemap.xml`, `robots.txt`,
`llms.txt`, the RSS feed, OAuth redirect URIs and session cookies — reads it from
one variable, `NEXT_PUBLIC_SITE_URL`.

## What is already done

| Step | Where | State |
| --- | --- | --- |
| Domain added to the project | Vercel → campus-web → Domains | done |
| `NEXT_PUBLIC_SITE_URL=https://campus-spheree.com` | Vercel → Environment Variables (production + preview) | done |
| Code that hardcoded a host | none — `siteUrl()` is the only source | done |

## What only the domain owner can do

The domain has **no A record yet**: the registry answers with its own default
nameservers, so nothing resolves it. Two ways to fix that, pick one.

### Option A — point DNS at Vercel (keeps your current DNS provider)

At the registrar or DNS host for `campus-spheree.com`:

| Type | Name | Value |
| --- | --- | --- |
| `A` | `@` | `216.198.79.1` |
| `A` | `@` | `64.29.17.1` |
| `CNAME` | `www` | `91bf3867a6277b75.vercel-dns-017.com` |

(`76.76.21.21` also works as the single A value; Vercel lists it as the rank-2
recommendation.)

### Option B — let Vercel manage DNS (simplest, recommended for a fresh domain)

At the registrar, replace the nameservers with:

```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Then add the domain in Vercel → Project → Domains and accept the defaults; Vercel
creates the records itself once the zone is delegated.

Either way, wait for propagation (`dig +short campus-spheree.com`) before judging
the result — Vercel issues the TLS certificate automatically as soon as DNS
resolves to it.

## The one Google-side change

Add this authorised redirect URI to the OAuth 2.0 Web client (Google Cloud
Console → Credentials):

```
https://campus-spheree.com/api/auth/google/callback
```

Keep the old Vercel URL in the list only if you want sign-in to keep working on the
`*.vercel.app` hostname. Sign-in breaks on any host whose callback URI is not
registered, and the error comes from Google, not from this app.

## Setting `www`

If you want `www.campus-spheree.com` to work, add it in Vercel as a **redirect** to
`campus-spheree.com` (308). Do not serve both: two live origins split your search
signal and make the canonical link a lie on one of them.

## Verifying after DNS lands

```bash
curl -sI https://campus-spheree.com | head -3
curl -s  https://campus-spheree.com/robots.txt | tail -2
curl -s  https://campus-spheree.com/sitemap.xml | head -4
curl -s  https://campus-spheree.com/llms.txt | head -3
```

Each of the last three must contain `campus-spheree.com`, not a `*.vercel.app`
hostname. If they do not, the deployment predates the variable change — redeploy.

## Certificate and HSTS

Vercel issues and renews the certificate. `Strict-Transport-Security` is set by the
app on every response, which is safe for a domain served only over HTTPS; do not
enable `includeSubDomains` until every subdomain is HTTPS too.
