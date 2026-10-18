import { many } from "../db";

/**
 * The public catalogue, reduced to what a sitemap needs.
 *
 * This is a dedicated query rather than four calls to the listing services for
 * one reason: those services page at 48 rows, so a sitemap built from them
 * silently stopped at 48 clubs and 48 events. A sitemap that quietly drops
 * everything after the first page is worse than no sitemap — it tells a crawler
 * the rest of the catalogue does not exist.
 *
 * Only public, indexable rows are returned: active clubs, approved and public
 * projects, published or completed events. Drafts, submissions awaiting review,
 * members-only projects and suspended clubs never appear.
 */

export interface SitemapEntry {
  slug: string;
  lastModified: Date;
}

export interface SitemapCatalogue {
  clubs: SitemapEntry[];
  projects: SitemapEntry[];
  events: SitemapEntry[];
}

/** A hard ceiling that keeps the response well under the 50 000-URL limit. */
const MAX_PER_TYPE = 20_000;

export async function sitemapCatalogue(): Promise<SitemapCatalogue> {
  const [clubs, projects, events] = await Promise.all([
    many<{ slug: string; updated_at: Date }>(
      `select slug, updated_at from clubs
        where status = 'active'
        order by updated_at desc
        limit $1`,
      [MAX_PER_TYPE],
    ),
    many<{ slug: string; updated_at: Date }>(
      `select slug, updated_at from projects
        where status = 'approved' and visibility = 'public'
        order by coalesce(approved_at, updated_at) desc
        limit $1`,
      [MAX_PER_TYPE],
    ),
    many<{ slug: string; updated_at: Date }>(
      `select slug, updated_at from events
        where status in ('published', 'completed')
        order by starts_at desc
        limit $1`,
      [MAX_PER_TYPE],
    ),
  ]);

  const toEntries = (rows: Array<{ slug: string; updated_at: Date }>) =>
    rows.map((row) => ({ slug: row.slug, lastModified: row.updated_at }));

  return {
    clubs: toEntries(clubs),
    projects: toEntries(projects),
    events: toEntries(events),
  };
}
