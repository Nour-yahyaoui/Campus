import { HeadSkeleton, ProjectCardsSkeleton, SearchBarSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading projects">
      <HeadSkeleton chips={5} />
      <SearchBarSkeleton />
      <div className="mt-3">
        <ProjectCardsSkeleton count={9} />
      </div>
    </SkeletonShell>
  );
}
