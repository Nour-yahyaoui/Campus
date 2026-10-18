import { listEvents } from "@campussphere/core";
import { SITE, absolute, clampDescription } from "@/lib/seo";

/**
 * RSS 2.0 feed of upcoming events. Feeds get picked up by aggregators,
 * university dashboards and newsletter tools — cheap distribution for a
 * campus calendar.
 */
// Generated per request, not at build time: the build machine may have no
// database, and a catalogue frozen at build would describe a site that never
// existed. The Cache-Control header below does the caching instead.
export const dynamic = "force-dynamic";

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const events = await listEvents({ limit: 50, when: "upcoming" }).catch(() => ({ items: [] }));
  const now = new Date().toUTCString();

  const items = events.items
    .map((event) => {
      const url = absolute(`/events/${event.slug}`);
      return [
        "    <item>",
        `      <title>${escape(event.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        // Events have no created-at in the summary; publication is close enough
        // and keeps the feed ordered the way aggregators expect.
        `      <pubDate>${new Date(event.startsAt).toUTCString()}</pubDate>`,
        `      <description>${escape(clampDescription(event.summary, 300))}</description>`,
        `      <category>${escape(event.category)}</category>`,
        event.club ? `      <author>${escape(event.club.name)}</author>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(SITE.name)} — upcoming events</title>
    <link>${absolute("/events")}</link>
    <atom:link href="${absolute("/rss.xml")}" rel="self" type="application/rss+xml" />
    <description>${escape(SITE.description)}</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}
