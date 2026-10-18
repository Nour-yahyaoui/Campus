import { EventRowsSkeleton, HeadSkeleton, SearchBarSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading events">
      <HeadSkeleton chips={5} />
      <SearchBarSkeleton />
      <div className="mt-3">
        <EventRowsSkeleton count={8} />
      </div>
    </SkeletonShell>
  );
}
