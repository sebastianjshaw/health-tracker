import { Skeleton, SkeletonCard, SkeletonHeader } from "@/components/Skeleton";

/** Tailored fallback for /stats (the heaviest page): control chips, the summary
 *  grid, then the chart cards. */
export default function StatsLoading() {
  return (
    <div className="space-y-4">
      <SkeletonHeader />

      {/* Range + grouping control rows */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Skeleton className="h-8 w-56 rounded-full" />
        <Skeleton className="h-8 w-36 rounded-full" />
      </div>

      {/* At-a-glance summary grid */}
      <SkeletonCard className="h-44" />

      {/* Chart cards */}
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-56" />
    </div>
  );
}
