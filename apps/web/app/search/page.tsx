import Link from "next/link";
import type { Metadata } from "next";
import { searchAll } from "@campussphere/core";
import { ClubCard, EmptyState, EventRow, ProjectCard } from "@/components/Pieces";
import { SearchBox } from "@/components/Filters";

export const metadata: Metadata = {
  title: "Search",
  description: "Search clubs, projects and events across CampusSphere.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const type = params.type === "clubs" || params.type === "projects" || params.type === "events" ? params.type : "all";
  const results = query.length >= 2 ? await searchAll(query, type) : null;

  return (
    <div className="shell">
      <div className="page-head">
        <p className="eyebrow">Find it</p>
        <h1>Search campus</h1>
        <p className="lede">Public clubs, approved projects and upcoming events. Private and unapproved content is never searched.</p>
        <div className="mt-2">
          <SearchBox action="/search" defaultValue={query} placeholder="e.g. robotics, debate, volunteering" label="Search campus" />
        </div>
      </div>

      {type !== "all" ? (
        <p className="small muted">
          Showing only {type}.{" "}
          <Link href={`/search?q=${encodeURIComponent(query)}`}>Search everything</Link>
        </p>
      ) : null}

      {!results ? (
        <EmptyState title="Type at least two characters">
          Search works across club names, project titles and event details.
        </EmptyState>
      ) : results.total === 0 ? (
        <EmptyState title={`No results for “${results.query}”`}>
          Try a shorter word, or browse <Link href="/clubs">clubs</Link>, <Link href="/projects">projects</Link>{" "}
          and <Link href="/events">events</Link> directly.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          {results.clubs.length > 0 ? (
            <section>
              <div className="section-head">
                <h2 style={{ fontSize: "1.4rem" }}>Clubs</h2>
                <Link className="small" href={`/search?q=${encodeURIComponent(query)}&type=clubs`}>Only clubs</Link>
              </div>
              <div className="grid-3">
                {results.clubs.map((club) => <ClubCard key={club.id} club={club} />)}
              </div>
            </section>
          ) : null}
          {results.projects.length > 0 ? (
            <section>
              <div className="section-head">
                <h2 style={{ fontSize: "1.4rem" }}>Projects</h2>
                <Link className="small" href={`/search?q=${encodeURIComponent(query)}&type=projects`}>Only projects</Link>
              </div>
              <div className="grid-3">
                {results.projects.map((project) => <ProjectCard key={project.id} project={project} />)}
              </div>
            </section>
          ) : null}
          {results.events.length > 0 ? (
            <section>
              <div className="section-head">
                <h2 style={{ fontSize: "1.4rem" }}>Events</h2>
                <Link className="small" href={`/search?q=${encodeURIComponent(query)}&type=events`}>Only events</Link>
              </div>
              <div className="card card-flat">
                {results.events.map((event) => <EventRow key={event.id} event={event} />)}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
