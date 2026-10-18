import { HeadSkeleton, MiniStatsSkeleton, RowsSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading project workspace">
      <HeadSkeleton chips={3} />
      <MiniStatsSkeleton />
      <div className="dash-grid mt-3">
        <div className="sk-card"><RowsSkeleton count={5} avatar /></div>
        <div className="sk-card"><RowsSkeleton count={5} /></div>
      </div>
    </SkeletonShell>
  );
}
