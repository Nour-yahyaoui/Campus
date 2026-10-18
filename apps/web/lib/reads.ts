import "server-only";
import type {
  ClubSummary,
  EventSummary,
  Paginated,
  ProjectSummary,
  SearchResults,
} from "@campussphere/contracts";
import { listClubs, listEvents, listProjects, searchAll } from "@campussphere/core";
import { primaryList, primarySearch } from "./upstream";

/**
 * Public reads for the pages: ask the Actix service first, render from this
 * deployment's database when it does not answer.
 *
 * The pages used to query PostgreSQL directly, which made the "primary API"
 * something only `/api/v1` callers ever saw. Routing the render path through
 * the same rule means the Rust service really is the primary for ordinary
 * visitors — and that stopping it degrades latency, not availability.
 *
 * Detail pages are deliberately not routed: the primary implements the list and
 * search subset, and a 503 from it would only be slower than reading locally.
 */

const isClub = (item: unknown): boolean => {
  const value = item as Partial<ClubSummary> | null;
  return (
    typeof value?.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.memberCount === "number"
  );
};

const isEvent = (item: unknown): boolean => {
  const value = item as Partial<EventSummary> | null;
  return (
    typeof value?.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.startsAt === "string"
  );
};

const isProject = (item: unknown): boolean => {
  const value = item as Partial<ProjectSummary> | null;
  return (
    typeof value?.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string"
  );
};

const isSearchDocument = (value: unknown): boolean => {
  const document = value as Partial<SearchResults> | null;
  return (
    Array.isArray(document?.clubs) &&
    Array.isArray(document.projects) &&
    Array.isArray(document.events) &&
    typeof document.total === "number"
  );
};

export async function readClubs(options: {
  category?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<Paginated<ClubSummary>> {
  const remote = await primaryList<ClubSummary>(
    "clubs",
    { category: options.category, q: options.q, cursor: options.cursor, limit: options.limit },
    isClub,
  );
  return remote ?? listClubs(options);
}

export async function readEvents(options: {
  category?: string;
  q?: string;
  when?: "upcoming" | "past" | "all";
  clubSlug?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<Paginated<EventSummary>> {
  // The primary's list query has no club filter; asking it for one would return
  // every club's events. Filtered lists stay local on purpose.
  const remote = options.clubSlug
    ? null
    : await primaryList<EventSummary>(
        "events",
        {
          category: options.category,
          q: options.q,
          when: options.when ?? "upcoming",
          cursor: options.cursor,
          limit: options.limit,
        },
        isEvent,
      );
  return remote ?? listEvents(options);
}

export async function readProjects(options: {
  category?: string;
  q?: string;
  clubSlug?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<Paginated<ProjectSummary>> {
  const remote = options.clubSlug
    ? null
    : await primaryList<ProjectSummary>(
        "projects",
        { category: options.category, q: options.q, cursor: options.cursor, limit: options.limit },
        isProject,
      );
  return remote ?? listProjects(options);
}

export async function readSearch(
  term: string,
  kind: "all" | "clubs" | "projects" | "events",
): Promise<SearchResults> {
  const remote = await primarySearch<SearchResults>(term, kind, isSearchDocument);
  return remote ?? searchAll(term, kind);
}
