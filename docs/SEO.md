# SEO, sharing and machine-readable surfaces

Everything a crawler, an assistant or a link preview can use, and where it lives.

| Surface | Route | Source |
| --- | --- | --- |
| Page metadata, Open Graph, Twitter cards | every page | `app/layout.tsx`, per-page `generateMetadata` |
| Canonical URLs | every page | `alternates.canonical` per page |
| Site + organisation JSON-LD | every page | `app/layout.tsx` |
| Entity JSON-LD (Organization / CreativeWork / Event) | detail pages | `apps/web/lib/seo.ts` |
| Breadcrumb JSON-LD | detail pages | `breadcrumbs` in `lib/seo.ts` |
| Listing JSON-LD (ItemList) | `/clubs`, `/events`, `/projects` | page components |
| `robots.txt` | `/robots.txt` | `app/robots.txt/route.ts`, `lib/robots.ts` |
| `sitemap.xml` | `/sitemap.xml` | `app/sitemap.xml/route.ts`, `packages/core/src/services/sitemap.ts` |
| `llms.txt` | `/llms.txt` | `app/llms.txt/route.ts` |
| `llms-full.txt` | `/llms-full.txt` | `app/llms-full.txt/route.ts` |
| RSS feed of events | `/rss.xml` | `app/rss.xml/route.ts` |
| OpenSearch descriptor | `/opensearch.xml` | `app/opensearch.xml/route.ts` |
| Web app manifest | `/manifest.webmanifest` | `app/manifest.ts` |
| Icons | `/icon.svg`, `/apple-icon` | `app/icon.svg`, `app/apple-icon.tsx` |
| Search Console proof | `/googlee1336cabbd4b0d8b.html` | `public/` |
| Security contact | `/.well-known/security.txt` | `public/` |

## Why some of these are dynamic

`robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt` and `rss.xml` are
generated **per request**, not at build time. The build machine has no database,
and `NEXT_PUBLIC_SITE_URL` is a runtime value — a build-time render produced a
sitemap pointing at `localhost` with an empty catalogue. The routes carry
`s-maxage` headers instead, so the CDN caches them for an hour.

The sitemap reads the catalogue through `sitemapCatalogue()` in the core
package, which is one query per entity type. It deliberately does **not** reuse
`listClubs()`/`listEvents()`: those page at 48 rows, so an earlier version of the
sitemap silently stopped at the 48th club. A sitemap that drops the rest of the
catalogue tells a crawler that the rest does not exist.

## What is deliberately excluded

`/dashboard`, `/admin`, `/observatory`, `/login`, `/api/*`, `/media/*` and
`/search`. The first group is authenticated, `/search` would create one indexable
page per query string. They are both disallowed in `robots.txt` and absent from
the sitemap.

## AI crawlers

`robots.txt` names `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`,
`PerplexityBot` and `Google-Extended` explicitly and allows them on the public
pages. A university platform wants to be quoted, with a link back. `llms.txt`
exists for the same reason: a curated map beats an inference from rendered HTML.

## Structured data rules

- One canonical URL per entity, built by `absolute()` — never concatenated by hand.
- JSON-LD is escaped with `jsonLdString()` so a title containing `</script>`
  cannot break out of its tag.
- `Event.offers` reports real availability (`SoldOut` when full or cancelled),
  not a hardcoded value.
- Every description is trimmed at a word boundary (`clampDescription`).

## Analytics

`@vercel/analytics` is mounted once in `app/layout.tsx`. The script is injected
client-side and served same-origin, so the CSP's `'strict-dynamic'` rule covers
it without an extra allowance. Data appears in the Vercel dashboard under
**Analytics**, and requires Web Analytics to be enabled for the project.

## Checking it after a deploy

```bash
curl -s https://<host>/robots.txt | tail -3
curl -s https://<host>/sitemap.xml | grep -c "<loc>"
curl -s https://<host>/llms.txt | head -20
curl -s https://<host>/googlee1336cabbd4b0d8b.html
```

Then add the property in Google Search Console (the file and the meta tag both
prove ownership) and submit `https://<host>/sitemap.xml`.

The canonical production origin is `https://campus-spheree.vercel.app`; see
[docs/DOMAIN.md](DOMAIN.md) for the DNS records and the Google redirect URI that
have to match it.
