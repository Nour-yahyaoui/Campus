import { HeroSkeleton, SkeletonShell, ClubCardsSkeleton, EventRowsSkeleton } from "@/components/Skeletons";

/** The homepage: hero, counters, then the three live lists. */
export default function Loading() {
  return (
    <SkeletonShell label="Loading the homepage">
      <HeroSkeleton />
      <div className="stats-strip" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div className="stat" key={index}>
            <span className="skeleton" style={{ display: "block", width: 60, height: 26 }} />
            <span className="skeleton" style={{ display: "block", width: 96, height: 10, marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="section">
        <ClubCardsSkeleton count={3} />
      </div>
      <div className="section">
        <EventRowsSkeleton count={3} />
      </div>
    </SkeletonShell>
  );
}
