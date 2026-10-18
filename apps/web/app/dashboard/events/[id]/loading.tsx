import { HeadSkeleton, MiniStatsSkeleton, RowsSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading event management">
      <HeadSkeleton chips={3} />
      <MiniStatsSkeleton />
      <div className="card mt-3">
        <RowsSkeleton count={7} avatar />
      </div>
    </SkeletonShell>
  );
}
