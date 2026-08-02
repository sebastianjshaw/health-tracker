import { SkeletonCard, SkeletonHeader } from "@/components/Skeleton";

/** Shared fallback for any (main) route without its own loading.tsx — paints
 *  immediately on navigation while the page's server data loads. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <SkeletonHeader />
      <SkeletonCard className="h-36" />
      <SkeletonCard className="h-56" />
      <SkeletonCard className="h-56" />
    </div>
  );
}
