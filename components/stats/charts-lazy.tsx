"use client";

import dynamic from "next/dynamic";

// recharts is a large dependency; load it only on the client, after hydration,
// so it doesn't bloat the initial /stats payload.
function ChartSkeleton() {
  return (
    <div className="h-[296px] animate-pulse rounded-2xl border border-border bg-card" />
  );
}

export const WeightChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.WeightChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const CalorieChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.CalorieChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const LiftChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.LiftChart })),
  { ssr: false, loading: ChartSkeleton },
);
