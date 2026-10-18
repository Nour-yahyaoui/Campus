import { FormSkeleton, HeadSkeleton, SkeletonShell } from "@/components/Skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading the project form">
      <HeadSkeleton chips={0} />
      <FormSkeleton fields={7} />
    </SkeletonShell>
  );
}
