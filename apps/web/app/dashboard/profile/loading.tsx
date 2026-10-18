import { FormSkeleton, HeadSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading your profile">
      <HeadSkeleton chips={2} />
      <FormSkeleton fields={5} />
    </SkeletonShell>
  );
}
