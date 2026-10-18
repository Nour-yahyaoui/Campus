import type { SearchResults } from "@campussphere/contracts";
import { many } from "../db";
import { likePattern } from "../db";
import { listClubs } from "./clubs";
import { listProjects } from "./projects";
import { listEvents } from "./events";

/**
 * Search is deliberately simple and bounded: ILIKE against indexed titles with
 * a hard cap per type. It never queries private or unapproved content.
 */
export async function searchAll(query: string, types: "all" | "clubs" | "projects" | "events" = "all"): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return { query: q, clubs: [], projects: [], events: [], total: 0 };
  const [clubs, projects, events] = await Promise.all([
    types === "all" || types === "clubs" ? listClubs({ q, limit: 5 }) : Promise.resolve({ items: [] }),
    types === "all" || types === "projects" ? listProjects({ q, limit: 5 }) : Promise.resolve({ items: [] }),
    types === "all" || types === "events" ? listEvents({ q, limit: 5, when: "upcoming" }) : Promise.resolve({ items: [] }),
  ]);
  return {
    query: q,
    clubs: clubs.items,
    projects: projects.items,
    events: events.items,
    total: clubs.items.length + projects.items.length + events.items.length,
  };
}

export async function suggestions(prefix: string): Promise<Array<{ label: string; href: string }>> {
  if (prefix.trim().length < 2) return [];
  const pattern = likePattern(prefix.trim());
  const [clubs, events] = await Promise.all([
    many<{ slug: string; name: string }>(
      "select slug, name from clubs where status = 'active' and name ilike $1 order by name limit 4",
      [pattern],
    ),
    many<{ slug: string; title: string }>(
      "select slug, title from events where status = 'published' and starts_at > now() and title ilike $1 order by starts_at limit 4",
      [pattern],
    ),
  ]);
  return [
    ...clubs.map((club) => ({ label: club.name, href: `/clubs/${club.slug}` })),
    ...events.map((event) => ({ label: event.title, href: `/events/${event.slug}` })),
  ];
}
