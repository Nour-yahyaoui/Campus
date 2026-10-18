import { HeadSkeleton, MiniStatsSkeleton, SkeletonShell, TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading club management">
      <HeadSkeleton chips={3} />
      <MiniStatsSkeleton />
      <div className="card mt-3">
        <TableSkeleton rows={8} cols={4} />
      </div>
    </SkeletonShell>
  );
}
