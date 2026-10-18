import type { Metadata } from "next";
import { CLUB_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import { listClubs } from "@campussphere/core";
import { ClubCard, EmptyState, Pager } from "@/components/Pieces";
import { ChipRow, SearchBox } from "@/components/Filters";

export const metadata: Metadata = {
  title: "Clubs",
  description:
    "Browse student clubs at your university: academic societies, cultural groups, sports teams, technology clubs and more.",
  alternates: { canonical: "/clubs" },
};


export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const clubs = await listClubs({ category: params.category, q: params.q, cursor: params.cursor, limit: 12 });

  return (
    <div className="shell">
      <div className="page-head">
        <p className="eyebrow">Community</p>
        <h1>Student clubs</h1>
        <p className="lede">
          Every club has a public mini-site: what it does, who leads it, when it meets and how to join.
        </p>
        <div className="mt-2">
          <SearchBox action="/clubs" defaultValue={params.q} placeholder="Search clubs by name or topic" />
        </div>
      </div>

      <ChipRow
        basePath="/clubs"
        params={{ q: params.q }}
        active={params.category}
        options={CLUB_CATEGORIES.map((category) => ({ value: category, label: categoryLabel(category) }))}
      />

      {clubs.items.length === 0 ? (
        <EmptyState title="No clubs match that search">
          Try a different category or clear the search. Clubs appear here as soon as a super-admin
          creates them for the pilot.
        </EmptyState>
      ) : (
        <div className="grid-3">
          {clubs.items.map((club) => (
            <ClubCard key={club.id} club={club} />
          ))}
        </div>
      )}
      <Pager nextCursor={clubs.nextCursor} basePath="/clubs" params={{ category: params.category, q: params.q }} />
    </div>
  );
}
