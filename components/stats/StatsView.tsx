"use client";

import * as React from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Meal } from "@/lib/constants";
import {
  CalorieChart,
  DistanceChart,
  FiberChart,
  HeartRateChart,
  LiftChart,
  SatFatChart,
  SleepChart,
  WeightChart,
} from "@/components/stats/charts-lazy";
import { HealthCalendar } from "@/components/stats/HealthCalendar";
import {
  RANGES,
  Range,
  cutoffFor,
  granularityFor,
  withinRange,
} from "@/lib/stats-range";
import type {
  CaloriePoint,
  DistancePoint,
  LiftPoint,
  RestingHrPoint,
  SleepPoint,
  WeightPoint,
  WeightPrediction,
} from "@/lib/stats-data";
import type { HealthStatus } from "@/lib/constants";

type Tone = "good" | "bad" | "even" | "none";
const TONE: Record<Tone, string> = {
  good: "text-accent",
  bad: "text-danger",
  even: "text-warn",
  none: "text-foreground",
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const last = <T,>(a: T[]): T | undefined => a[a.length - 1];

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: Tone }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", TONE[tone])}>{value}</div>
      {sub && <div className={cn("text-xs", tone === "none" ? "text-muted-foreground" : TONE[tone])}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function StatsView({
  today,
  weight,
  predictions,
  calories,
  lifts,
  distances,
  sleep,
  restingHr,
  health,
  targets,
  goalWeight,
  mealSplit,
}: {
  today: string;
  weight: WeightPoint[];
  predictions: WeightPrediction[];
  calories: CaloriePoint[];
  lifts: LiftPoint[];
  distances: DistancePoint[];
  sleep: SleepPoint[];
  restingHr: RestingHrPoint[];
  health: Record<string, HealthStatus>;
  targets: { kcal: number };
  goalWeight: number | null;
  mealSplit: Record<Meal, number>;
}) {
  const [range, setRange] = React.useState<Range>("30d");
  const cutoff = cutoffFor(range, today);
  const granularity = granularityFor(range);

  const fWeight = withinRange(weight, cutoff);
  const fPredictions = withinRange(predictions, cutoff);
  const fCalories = withinRange(calories, cutoff);
  const fLifts = withinRange(lifts, cutoff);
  const fDistances = withinRange(distances, cutoff);
  const fSleep = withinRange(sleep, cutoff);
  const fHr = withinRange(restingHr, cutoff);
  const startOf = (rows: { date: string }[]) => cutoff ?? rows[0]?.date ?? today;

  // ---- summary metrics ----
  const wFirst = fWeight[0]?.weight;
  const wLast = last(fWeight)?.weight;
  const wDelta = wFirst != null && wLast != null ? r1(wLast - wFirst) : null;
  const wantLoss = goalWeight == null || (wLast ?? 0) >= goalWeight;
  const weightTone: Tone =
    wDelta == null ? "none" : Math.abs(wDelta) < 0.2 ? "even" : wantLoss === wDelta < 0 ? "good" : "bad";

  const logged = fCalories.filter((d) => d.kcal > 0);
  const avgCal = logged.length
    ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length)
    : null;
  const calTone: Tone =
    avgCal == null ? "none" : avgCal <= targets.kcal ? "good" : avgCal <= targets.kcal * 1.1 ? "even" : "bad";

  const avgSleep = fSleep.length
    ? r1(fSleep.reduce((s, d) => s + d.durationMin, 0) / fSleep.length / 60)
    : null;
  const sleepTone: Tone =
    avgSleep == null ? "none" : avgSleep >= 7 ? "good" : avgSleep >= 6 ? "even" : "bad";

  const hrFirst = fHr[0]?.restingBpm;
  const hrLast = last(fHr)?.restingBpm;
  const hrDelta = hrFirst != null && hrLast != null ? hrLast - hrFirst : null;
  const hrTone: Tone = hrDelta == null ? "none" : hrDelta < -1 ? "good" : hrDelta > 1 ? "bad" : "even";

  const distTotal = r1(fDistances.reduce((s, d) => s + d.km, 0));

  // Days flagged unwell ("ill") within the selected range; injured shown alongside.
  let illDays = 0;
  let injuredDays = 0;
  for (const [date, status] of Object.entries(health)) {
    if (date > today || (cutoff != null && date < cutoff)) continue;
    if (status === "unwell") illDays += 1;
    else if (status === "injured") injuredDays += 1;
  }
  const illTone: Tone = illDays === 0 ? "good" : "even";
  const illSub =
    injuredDays > 0
      ? `+${injuredDays} injured`
      : illDays === 0
        ? "none logged"
        : `day${illDays === 1 ? "" : "s"} unwell`;

  const signed = (n: number, unit: string) => `${n > 0 ? "+" : ""}${n} ${unit}`;

  return (
    <div className="space-y-6">
      {/* Range control */}
      <div className="flex gap-1.5">
        {RANGES.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRange(opt.key)}
            aria-pressed={range === opt.key}
            className={cn(
              "rounded-lg px-2.5 py-1 text-sm",
              range === opt.key
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* At-a-glance summary */}
      <Card className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        <Metric
          label="Weight"
          value={wLast != null ? `${wLast} kg` : "—"}
          sub={wDelta != null ? signed(wDelta, "kg") : undefined}
          tone={weightTone}
        />
        <Metric
          label="Calories / day"
          value={avgCal != null ? `${avgCal}` : "—"}
          sub={`vs ${targets.kcal} target`}
          tone={calTone}
        />
        <Metric
          label="Sleep / night"
          value={avgSleep != null ? `${avgSleep} h` : "—"}
          sub="average"
          tone={sleepTone}
        />
        <Metric
          label="Resting HR"
          value={hrLast != null ? `${hrLast} bpm` : "—"}
          sub={hrDelta != null ? signed(hrDelta, "bpm") : undefined}
          tone={hrTone}
        />
        <Metric
          label="Distance"
          value={`${distTotal} km`}
          sub="total"
          tone={distTotal > 0 ? "good" : "none"}
        />
        <Metric label="Days ill" value={`${illDays}`} sub={illSub} tone={illTone} />
      </Card>

      <Section title="Body">
        <WeightChart data={fWeight} predictions={fPredictions} goalWeight={goalWeight} today={today} />
        <HeartRateChart data={fHr} />
        <SleepChart data={fSleep} start={startOf(fSleep)} end={today} granularity={granularity} />
      </Section>

      <Section title="Nutrition">
        <CalorieChart data={fCalories} target={targets.kcal} mealSplit={mealSplit} />
        <FiberChart data={fCalories} />
        <SatFatChart data={fCalories} />
      </Section>

      <Section title="Training">
        <LiftChart data={fLifts} />
        <DistanceChart
          data={fDistances}
          start={startOf(fDistances)}
          end={today}
          granularity={granularity}
        />
      </Section>

      <Section title="Wellbeing">
        {/* Health calendar keeps its own year view, independent of the range above. */}
        <HealthCalendar statuses={health} end={today} />
      </Section>
    </div>
  );
}
