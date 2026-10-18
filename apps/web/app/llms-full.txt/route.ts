import { listClubs, listEvents, listProjects } from "@campussphere/core";
import { SITE, absolute, clampDescription } from "@/lib/seo";

/**
 * `llms-full.txt` — the same catalogue as `llms.txt` with each entry's
 * description, for models that want detail rather than a link list.
 */
// Generated per request, not at build time: the build machine may have no
// database, and a catalogue frozen at build would describe a site that never
// existed. The Cache-Control header below does the caching instead.
export const dynamic = "force-dynamic";

export async function GET() {
  const [clubs, projects, events] = await Promise.all([
    listClubs({ limit: 30 }).catch(() => ({ items: [] })),
    listProjects({ limit: 20 }).catch(() => ({ items: [] })),
    listEvents({ limit: 20, when: "upcoming" }).catch(() => ({ items: [] })),
  ]);

  const lines: string[] = [
    `# ${SITE.name} — full reference`,
    "",
    `> ${SITE.description}`,
    "",
    `Open source (${SITE.license}) · ${SITE.repository}`,
    "",
    "## Clubs",
    "",
  ];

  for (const club of clubs.items) {
    lines.push(
      `### ${club.name}`,
      "",
      `URL: ${absolute(`/clubs/${club.slug}`)}`,
      `Category: ${club.category} · Membership: ${club.membershipPolicy} · Members: ${club.memberCount}${club.verified ? " · Verified" : ""}`,
      "",
      clampDescription(club.tagline ?? `${club.name} is a student organisation listed on ${SITE.name}.`, 400),
      "",
    );
  }

  if (clubs.items.length === 0) lines.push("No clubs have been published yet.", "");

  lines.push("## Projects", "");
  for (const project of projects.items) {
    lines.push(
      `### ${project.title}`,
      "",
      `URL: ${absolute(`/projects/${project.slug}`)}`,
      `Category: ${project.category} · Lead: ${project.lead.name}${project.club ? ` · Club: ${project.club.name}` : ""} · Open roles: ${project.openRoles}`,
      "",
      clampDescription(project.summary, 400),
      "",
    );
  }

  if (projects.items.length === 0) lines.push("No projects have been published yet.", "");

  lines.push("## Upcoming events", "");
  for (const event of events.items) {
    lines.push(
      `### ${event.title}`,
      "",
      `URL: ${absolute(`/events/${event.slug}`)}`,
      `Starts: ${event.startsAt} · Ends: ${event.endsAt}${event.venueName ? ` · Venue: ${event.venueName}` : ""}${event.isOnline ? " · Online" : ""} · Capacity: ${event.capacity ?? "unlimited"} · Registered: ${event.registeredCount}`,
      "",
      clampDescription(event.summary, 400),
      "",
    );
  }

  if (events.items.length === 0) lines.push("No upcoming events have been published yet.", "");

  lines.push(`Last generated: ${new Date().toISOString()}`, "");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
