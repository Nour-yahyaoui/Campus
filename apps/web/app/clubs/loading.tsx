import { ClubCardsSkeleton, HeadSkeleton, SearchBarSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading clubs">
      <HeadSkeleton chips={6} />
      <SearchBarSkeleton />
      <div className="mt-3">
        <ClubCardsSkeleton count={9} />
      </div>
    </SkeletonShell>
  );
}
