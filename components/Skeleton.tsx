import { cn } from "@/lib/cn";

/** Pulsing placeholder block. Used by route-level loading.tsx fallbacks so a
 *  navigation paints instantly (with the layout + nav already in place) while
 *  the server component fetches. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} aria-hidden />;
}

/** Card-shaped skeleton matching the app's cards (rounded-2xl + border). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-2xl border border-border bg-card", className)}
      aria-hidden
    />
  );
}

/** Title + subtitle placeholder, matching PageHeader. */
export function SkeletonHeader() {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-56" />
    </div>
  );
}
