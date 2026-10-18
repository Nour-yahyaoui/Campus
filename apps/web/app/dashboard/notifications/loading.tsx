import { HeadSkeleton, RowsSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading notifications">
      <HeadSkeleton chips={2} />
      <RowsSkeleton count={9} avatar />
    </SkeletonShell>
  );
}
