"use client";

import dynamic from "next/dynamic";

// recharts is a large dependency; load it only on the client, after hydration,
// so it doesn't bloat the initial /stats payload.

// Card chrome around a chart's plotting area: padding + heading + a typical
// legend/footnote line. Added to each chart's ResponsiveContainer height so the
// skeleton roughly matches the loaded card and the page doesn't jump.
const CHROME = 92;

function makeSkeleton(chartHeight: number) {
  const Skeleton = () => (
    <div
      className="animate-pulse rounded-2xl border border-border bg-card"
      style={{ height: chartHeight + CHROME }}
    />
  );
  Skeleton.displayName = "ChartSkeleton";
  return Skeleton;
}

export const WeightChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.WeightChart })),
  { ssr: false, loading: makeSkeleton(220) },
);

export const MarkerWeightChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.MarkerWeightChart })),
  { ssr: false, loading: makeSkeleton(220) },
);

export const CalorieChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.CalorieChart })),
  { ssr: false, loading: makeSkeleton(220) },
);

export const FiberChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.FiberChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const SatFatChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.SatFatChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const HydrationChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.HydrationChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const CompositionChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.CompositionChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const LiftChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.LiftChart })),
  { ssr: false, loading: makeSkeleton(220) },
);

export const DistanceChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.DistanceChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const StepsChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.StepsChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const SleepChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.SleepChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const HeartRateChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.HeartRateChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const Vo2maxChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.Vo2maxChart })),
  { ssr: false, loading: makeSkeleton(200) },
);

export const TrainingLoadChart = dynamic(
  () => import("./Charts").then((m) => ({ default: m.TrainingLoadChart })),
  { ssr: false, loading: makeSkeleton(180) },
);
