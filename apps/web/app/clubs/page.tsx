import type { Metadata } from "next";
import { CLUB_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import { readClubs } from "@/lib/reads";
import { ClubCard, EmptyState, Pager } from "@/components/Pieces";
import { ChipRow, SearchBox } from "@/components/Filters";
import { absolute, itemListJsonLd, jsonLdString } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Clubs",
  description:
    "Browse student clubs at your university: academic societies, cultural groups, sports teams, technology clubs and more.",
  alternates: { canonical: "/clubs" },
  openGraph: { url: absolute("/clubs"), title: "Student clubs" },
};


export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const clubs = await readClubs({ category: params.category, q: params.q, cursor: params.cursor, limit: 12 });

  const itemList = itemListJsonLd(
    clubs.items.map((club) => ({ name: club.name, path: `/clubs/${club.slug}` })),
  );

  return (
    <div className="shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemList) }} />
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
