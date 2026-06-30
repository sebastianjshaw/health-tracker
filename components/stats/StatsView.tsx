"use client";

import * as React from "react";
import { Card, SegmentedControl, Stat, type StatTone } from "@/components/ui";
import { Meal } from "@/lib/constants";
import { bmi, bmiClass } from "@/lib/health";
import {
  CalorieChart,
  CompositionChart,
  FiberChart,
  HeartRateChart,
  HydrationChart,
  SatFatChart,
  SleepChart,
  TrainingLoadChart,
  Vo2maxChart,
  WeightChart,
} from "@/components/stats/charts-lazy";
import { HealthCalendar } from "@/components/stats/HealthCalendar";
import { BodyInsights } from "@/components/stats/BodyInsights";
import { RecoveryCard } from "@/components/stats/RecoveryCard";
import type { BodyComposition } from "@/lib/metabolic-age";
import type { MonthlyAverage, YearlyAverage } from "@/lib/seasonal";
import {
  RANGES,
  Range,
  Granularity,
  cutoffFor,
  withinRange,
} from "@/lib/stats-range";

const GROUPINGS: { key: Granularity; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];
import type {
  CaloriePoint,
  DistancePoint,
  RecoveryPoint,
  RestingHrPoint,
  SleepPoint,
  Vo2Point,
  WeightPoint,
  WeightPrediction,
} from "@/lib/stats-data";
import type { LoadSession } from "@/lib/fitness";
import type { HealthStatus } from "@/lib/constants";
import type { TdeeEstimate } from "@/lib/tdee";

export type StatsInsights = {
  tdee: TdeeEstimate | null;
  streak: { logging: number; onTarget: number };
};

type Tone = StatTone;
const r1 = (n: number) => Math.round(n * 10) / 10;
const last = <T,>(a: T[]): T | undefined => a[a.length - 1];

/** Summary tile — a `Stat` whose sub line follows the value's tone. */
function Metric(props: { label: string; value: string; sub?: string; tone: Tone }) {
  return <Stat {...props} subTone />;
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
  distances,
  sleep,
  restingHr,
  recovery,
  vo2max,
  loadSessions,
  health,
  targets,
  goalWeight,
  mealSplit,
  heightCm,
  insights,
  bodyComp,
  yearly,
  monthly,
  age,
}: {
  today: string;
  weight: WeightPoint[];
  predictions: WeightPrediction[];
  calories: CaloriePoint[];
  distances: DistancePoint[];
  sleep: SleepPoint[];
  restingHr: RestingHrPoint[];
  recovery: RecoveryPoint[];
  vo2max: Vo2Point[];
  loadSessions: LoadSession[];
  health: Record<string, HealthStatus>;
  targets: { kcal: number };
  goalWeight: number | null;
  mealSplit: Record<Meal, number>;
  heightCm: number | null;
  insights: StatsInsights;
  bodyComp: BodyComposition | null;
  yearly: YearlyAverage[];
  monthly: MonthlyAverage[];
  age: number | null;
}) {
  const [range, setRange] = React.useState<Range>("30d");
  const [group, setGroup] = React.useState<Granularity>("day");
  const cutoff = cutoffFor(range, today);

  const fWeight = withinRange(weight, cutoff);
  const fPredictions = withinRange(predictions, cutoff);
  const fCalories = withinRange(calories, cutoff);
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

  // BMI from the range's latest weight, so it tracks the Weight tile + range control.
  const bmiVal = wLast != null ? bmi(wLast, heightCm) : null;
  const bmiTone: Tone =
    bmiVal == null ? "none" : bmiVal < 18.5 ? "even" : bmiVal < 25 ? "good" : bmiVal < 30 ? "even" : "bad";

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
      {/* Range + grouping controls — apply to every chart below. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SegmentedControl options={RANGES} value={range} onChange={setRange} label="Time range" />
        <SegmentedControl options={GROUPINGS} value={group} onChange={setGroup} label="Group by" />
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
          label="BMI"
          value={bmiVal != null ? `${bmiVal}` : "—"}
          sub={bmiVal != null ? bmiClass(bmiVal) : heightCm ? undefined : "set height"}
          tone={bmiTone}
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
        <Metric
          label="Maintenance (measured)"
          value={insights.tdee != null ? `${insights.tdee.tdee}` : "—"}
          sub={insights.tdee != null ? `kcal · ${insights.tdee.confidence} conf.` : "needs ~2wk of logs"}
          tone="none"
        />
        <Metric
          label="Logging streak"
          value={insights.streak.logging > 0 ? `${insights.streak.logging} d` : "—"}
          sub={insights.streak.onTarget > 0 ? `${insights.streak.onTarget} d on target` : "current run"}
          tone={insights.streak.logging >= 3 ? "good" : "none"}
        />
      </Card>

      <Section title="Body">
        <WeightChart
          data={fWeight}
          predictions={fPredictions}
          goalWeight={goalWeight}
          today={today}
          granularity={group}
          start={startOf(fWeight)}
          end={today}
        />
        <CompositionChart data={fWeight} granularity={group} start={startOf(fWeight)} end={today} />
        <BodyInsights bodyComp={bodyComp} yearly={yearly} monthly={monthly} age={age} />
      </Section>

      <Section title="Nutrition">
        <CalorieChart
          data={fCalories}
          target={targets.kcal}
          mealSplit={mealSplit}
          granularity={group}
          start={startOf(fCalories)}
          end={today}
        />
        <FiberChart data={fCalories} granularity={group} start={startOf(fCalories)} end={today} />
        <SatFatChart data={fCalories} granularity={group} start={startOf(fCalories)} end={today} />
        <HydrationChart data={fCalories} granularity={group} start={startOf(fCalories)} end={today} />
      </Section>

      <Section title="Fitness & recovery">
        <RecoveryCard data={recovery} />
        <Vo2maxChart data={vo2max} granularity={group} />
        <TrainingLoadChart sessions={loadSessions} today={today} granularity={group} />
      </Section>

      <Section title="Wellbeing">
        <SleepChart data={fSleep} start={startOf(fSleep)} end={today} granularity={group} />
        <HeartRateChart data={fHr} granularity={group} start={startOf(fHr)} end={today} />
        {/* Health calendar keeps its own year view, independent of the range above. */}
        <HealthCalendar statuses={health} end={today} />
      </Section>
    </div>
  );
}
