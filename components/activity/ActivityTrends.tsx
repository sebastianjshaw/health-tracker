"use client";

import * as React from "react";
import { SegmentedControl } from "@/components/ui";
import { DistanceChart, LiftChart, StepsChart } from "@/components/stats/charts-lazy";
import { RANGES, Range, cutoffFor, granularityFor, withinRange } from "@/lib/stats-range";
import type { ActivityPoint, DistancePoint, LiftPoint } from "@/lib/stats-data";

/** Lift / movement / cardio trends for the Activity page — the analytical
 * counterpart to the date-scoped logging tabs above. Self-contained range
 * control (the page is otherwise date-scoped, not range-scoped). */
export function ActivityTrends({
  today,
  lifts,
  activity,
  distances,
}: {
  today: string;
  lifts: LiftPoint[];
  activity: ActivityPoint[];
  distances: DistancePoint[];
}) {
  const [range, setRange] = React.useState<Range>("30d");
  const cutoff = cutoffFor(range, today);
  const granularity = granularityFor(range);

  const fLifts = withinRange(lifts, cutoff);
  const fActivity = withinRange(activity, cutoff);
  const fDistances = withinRange(distances, cutoff);
  const start = cutoff ?? fDistances[0]?.date ?? today;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Trends</h2>
        <SegmentedControl options={RANGES} value={range} onChange={setRange} label="Time range" />
      </div>

      <LiftChart data={fLifts} />
      <StepsChart data={fActivity} />
      <DistanceChart data={fDistances} start={start} end={today} granularity={granularity} />
    </section>
  );
}
