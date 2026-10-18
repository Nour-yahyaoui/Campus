import { listClubs, listEvents, listProjects, siteUrl } from "@campussphere/core";

/**
 * sitemap.xml.
 *
 * A route handler rather than `app/sitemap.ts` for one reason: control over
 * caching. The file must be generated at request time — `NEXT_PUBLIC_SITE_URL`
 * and the database are runtime facts — but it does not need regenerating for
 * every crawler, so it is served with a one-hour shared cache.
 *
 * Every public page is listed, including each club, project and event. Private
 * surfaces are absent, not merely disallowed: a URL in the sitemap is an
 * invitation to crawl.
 */
export const dynamic = "force-dynamic";

interface Entry {
  loc: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const emptyPage = { items: [] as { slug: string }[], nextCursor: null };

export async function GET() {
  const base = siteUrl().replace(/\/+$/, "");
  const now = new Date().toISOString();
  const entries: Entry[] = [
    { loc: `${base}/`, lastmod: now, changefreq: "daily", priority: "1.0" },
    { loc: `${base}/clubs`, lastmod: now, changefreq: "daily", priority: "0.9" },
    { loc: `${base}/events`, lastmod: now, changefreq: "daily", priority: "0.9" },
    { loc: `${base}/projects`, lastmod: now, changefreq: "daily", priority: "0.9" },
    { loc: `${base}/about`, lastmod: now, changefreq: "monthly", priority: "0.5" },
  ];

  const [clubs, projects, upcoming, past] = await Promise.all([
    listClubs({ limit: 200 }).catch(() => emptyPage),
    listProjects({ limit: 200 }).catch(() => emptyPage),
    listEvents({ limit: 200, when: "upcoming" }).catch(() => emptyPage),
    listEvents({ limit: 200, when: "past" }).catch(() => emptyPage),
  ]);

  for (const club of clubs.items) {
    entries.push({ loc: `${base}/clubs/${club.slug}`, lastmod: now, changefreq: "weekly", priority: "0.7" });
  }
  for (const project of projects.items) {
    entries.push({ loc: `${base}/projects/${project.slug}`, lastmod: now, changefreq: "weekly", priority: "0.7" });
  }
  // Past events stay listed: they are real pages with real content, and
  // dropping them only makes them harder to find.
  const seen = new Set<string>();
  for (const event of [...upcoming.items, ...past.items]) {
    if (seen.has(event.slug)) continue;
    seen.add(event.slug);
    entries.push({ loc: `${base}/events/${event.slug}`, lastmod: now, changefreq: "weekly", priority: "0.7" });
  }

  const body = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
