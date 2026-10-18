import { FormSkeleton, HeadSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading settings">
      <HeadSkeleton chips={0} />
      <FormSkeleton fields={4} />
    </SkeletonShell>
  );
}
