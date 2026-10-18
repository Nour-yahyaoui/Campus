import type { Metadata } from "next";
import Link from "next/link";
import { EVENT_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import { listEvents } from "@campussphere/core";
import { EmptyState, EventRow, Pager } from "@/components/Pieces";
import { ChipRow, SearchBox } from "@/components/Filters";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Upcoming talks, workshops, competitions, meetups and socials across campus — with capacity, waitlists and accessibility details.",
  alternates: { canonical: "/events" },
};


export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; when?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const when = params.when === "past" ? "past" : params.when === "all" ? "all" : "upcoming";
  const events = await listEvents({
    category: params.category,
    q: params.q,
    when,
    cursor: params.cursor,
    limit: 15,
  });

  return (
    <div className="shell">
      <div className="page-head">
        <p className="eyebrow">What&apos;s on</p>
        <h1>Events</h1>
        <p className="lede">
          Approved and published by students and clubs. Capacity and waitlists are enforced in the
          database, not just in the interface.
        </p>
        <div className="mt-2">
          <SearchBox action="/events" defaultValue={params.q} placeholder="Search events, venues, topics" />
        </div>
      </div>

      <div className="filter-bar">
        {[
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past" },
          { value: "all", label: "All" },
        ].map((option) => {
          const search = new URLSearchParams();
          if (params.q) search.set("q", params.q);
          if (params.category) search.set("category", params.category);
          if (option.value !== "upcoming") search.set("when", option.value);
          const query = search.toString();
          return (
            <Link
              key={option.value}
              className="chip"
              href={query ? `/events?${query}` : "/events"}
              aria-current={when === option.value ? "true" : undefined}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <ChipRow
        basePath="/events"
        params={{ q: params.q, when: when === "upcoming" ? undefined : when }}
        active={params.category}
        options={EVENT_CATEGORIES.map((category) => ({ value: category, label: categoryLabel(category) }))}
      />

      {events.items.length === 0 ? (
        <EmptyState title="No events here yet">
          Nothing matches those filters. Try &ldquo;Past&rdquo; or clear the category.
        </EmptyState>
      ) : (
        <div className="card card-flat">
          {events.items.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
      <Pager
        nextCursor={events.nextCursor}
        basePath="/events"
        params={{ category: params.category, q: params.q, when: when === "upcoming" ? undefined : when }}
      />
    </div>
  );
}
