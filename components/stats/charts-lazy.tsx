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

export const MarkerWeightChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.MarkerWeightChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const CalorieChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.CalorieChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const FiberChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.FiberChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const SatFatChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.SatFatChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const HydrationChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.HydrationChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const CompositionChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.CompositionChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const LiftChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.LiftChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const DistanceChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.DistanceChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const StepsChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.StepsChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const SleepChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.SleepChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const HeartRateChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.HeartRateChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const Vo2maxChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.Vo2maxChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const TrainingLoadChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.TrainingLoadChart })),
  { ssr: false, loading: ChartSkeleton },
);
