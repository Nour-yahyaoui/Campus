import { listClubs, listEvents, listProjects } from "@campussphere/core";
import { SITE, absolute } from "@/lib/seo";

/**
 * `llms.txt` — the emerging convention that gives language models a curated,
 * plain-text map of a site instead of making them guess from rendered HTML.
 *
 * Kept deliberately small and stable: what the site is, which pages matter,
 * and the current public catalogue. Everything is public data; nothing here is
 * user-specific.
 */
// Generated per request, not at build time: the build machine may have no
// database, and a catalogue frozen at build would describe a site that never
// existed. The Cache-Control header below does the caching instead.
export const dynamic = "force-dynamic";

export async function GET() {
  const [clubs, projects, events] = await Promise.all([
    listClubs({ limit: 30 }).catch(() => ({ items: [] as { slug: string; name: string }[] })),
    listProjects({ limit: 20 }).catch(() => ({ items: [] as { slug: string; title: string }[] })),
    listEvents({ limit: 20, when: "upcoming" }).catch(() => ({ items: [] as { slug: string; title: string }[] })),
  ]);

  const lines: string[] = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} is an open-source (${SITE.license}) university community platform. Students browse and join clubs, take part in student projects, and register for campus events. Browsing is public; joining and registering need a free account.`,
    "",
    "## What this site contains",
    "",
    "- **Clubs** — every student organisation, with its category, membership policy, officers and upcoming events.",
    "- **Projects** — student-led work, its lead, the roles that are open, and the club behind it.",
    "- **Events** — dated campus or online events with capacity, waitlist and registration state.",
    "- **Search** — one query across all three, at `/search?q=…`.",
    "",
    "## Main pages",
    "",
    `- [Home](${absolute("/")}): what the platform is and what is happening now.`,
    `- [Clubs](${absolute("/clubs")}): the full public directory.`,
    `- [Projects](${absolute("/projects")}): student projects open to contributors.`,
    `- [Events](${absolute("/events")}): upcoming events, filterable by category and date.`,
    `- [Search](${absolute("/search")}): query across clubs, projects and events.`,
    `- [About](${absolute("/about")}): who runs it and why it exists.`,
    "",
    "## Not for indexing",
    "",
    "`/dashboard`, `/admin`, `/observatory` and `/api/*` are authenticated application surfaces. `/login` is a sign-in form. They are excluded in `robots.txt`.",
    "",
    "## API",
    "",
    "A read-only JSON API is served on the same origin, and by a separate primary service:",
    "",
    `- \`GET ${absolute("/api/v1/clubs")}\`, \`/projects\`, \`/events\`, \`/search?q=\``,
    "- Machine-readable contract: `openapi/openapi.yaml` in the repository.",
    `- Source: ${SITE.repository}`,
    "",
    "## Current public catalogue",
    "",
  ];

  if (clubs.items.length > 0) {
    lines.push("### Clubs", "");
    for (const club of clubs.items) {
      lines.push(`- [${club.name}](${absolute(`/clubs/${club.slug}`)})`);
    }
    lines.push("");
  }

  if (projects.items.length > 0) {
    lines.push("### Projects", "");
    for (const project of projects.items) {
      lines.push(`- [${project.title}](${absolute(`/projects/${project.slug}`)})`);
    }
    lines.push("");
  }

  if (events.items.length > 0) {
    lines.push("### Upcoming events", "");
    for (const event of events.items) {
      lines.push(`- [${event.title}](${absolute(`/events/${event.slug}`)})`);
    }
    lines.push("");
  }

  // A fresh deployment has a schema but no content. Saying so is more useful to
  // a reader than an empty heading, and it keeps this file honest about state.
  if (clubs.items.length + projects.items.length + events.items.length === 0) {
    lines.push("No clubs, projects or events have been published yet.", "");
  }

  lines.push(
    "## Optional",
    "",
    `- [llms-full.txt](${absolute("/llms-full.txt")}): the same information with descriptions.`,
    `- [Sitemap](${absolute("/sitemap.xml")}) · [robots.txt](${absolute("/robots.txt")})`,
    `- [RSS feed](${absolute("/rss.xml")}) of upcoming events.`,
    "",
    `Last generated: ${new Date().toISOString()}`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
