import { HeadSkeleton, RowsSkeleton, SearchBarSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Searching">
      <HeadSkeleton chips={0} />
      <SearchBarSkeleton />
      <div className="mt-3">
        <RowsSkeleton count={7} />
      </div>
    </SkeletonShell>
  );
}
