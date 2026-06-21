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
  HydrationChart,
  LiftChart,
  SatFatChart,
  SleepChart,
  StepsChart,
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
  ActivityPoint,
  CaloriePoint,
  DistancePoint,
  LiftPoint,
  RestingHrPoint,
  SleepPoint,
  WeightPoint,
  WeightPrediction,
} from "@/lib/stats-data";
import { EXERCISE_LABELS, type Exercise, type HealthStatus } from "@/lib/constants";
import type { BodyComposition } from "@/lib/metabolic-age";
import type { TdeeEstimate } from "@/lib/tdee";
import type { MonthlyAverage, YearlyAverage } from "@/lib/seasonal";
import type { LiftStat } from "@/lib/strength";
import { trimNum } from "@/lib/format";

export type StatsInsights = {
  tdee: TdeeEstimate | null;
  bodyComp: BodyComposition | null;
  yearly: YearlyAverage[];
  monthly: MonthlyAverage[];
  prs: LiftStat[];
  streak: { logging: number; onTarget: number };
};

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

/** Compact CSS bars of mean weight per calendar month (no chart lib needed). */
function SeasonalBars({ months }: { months: { label: string; avgWeight: number; count: number }[] }) {
  const avgs = months.map((m) => m.avgWeight);
  const lo = Math.min(...avgs);
  const hi = Math.max(...avgs);
  const span = hi - lo || 1;
  return (
    <div className="space-y-1">
      {months.map((m) => (
        <div key={m.label} className="flex items-center gap-2 text-xs">
          <span className="w-8 shrink-0 text-muted-foreground">{m.label}</span>
          <div className="h-2.5 flex-1 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${20 + ((m.avgWeight - lo) / span) * 80}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums">{r1(m.avgWeight)}</span>
        </div>
      ))}
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
  activity,
  sleep,
  restingHr,
  health,
  targets,
  goalWeight,
  mealSplit,
  insights,
}: {
  today: string;
  weight: WeightPoint[];
  predictions: WeightPrediction[];
  calories: CaloriePoint[];
  lifts: LiftPoint[];
  distances: DistancePoint[];
  activity: ActivityPoint[];
  sleep: SleepPoint[];
  restingHr: RestingHrPoint[];
  health: Record<string, HealthStatus>;
  targets: { kcal: number };
  goalWeight: number | null;
  mealSplit: Record<Meal, number>;
  insights: StatsInsights;
}) {
  const [range, setRange] = React.useState<Range>("30d");
  const cutoff = cutoffFor(range, today);
  const granularity = granularityFor(range);

  const fWeight = withinRange(weight, cutoff);
  const fPredictions = withinRange(predictions, cutoff);
  const fCalories = withinRange(calories, cutoff);
  const fLifts = withinRange(lifts, cutoff);
  const fDistances = withinRange(distances, cutoff);
  const fActivity = withinRange(activity, cutoff);
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

      {/* Range-independent insights derived from the full history. */}
      <Section title="Insights">
        <Card className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          <Metric
            label="Maintenance (measured)"
            value={insights.tdee != null ? `${insights.tdee.tdee}` : "—"}
            sub={insights.tdee != null ? `kcal · ${insights.tdee.confidence} conf.` : "needs ~2wk of logs"}
            tone="none"
          />
          <Metric
            label="Lean mass"
            value={insights.bodyComp != null ? `${trimNum(insights.bodyComp.leanMassKg)} kg` : "—"}
            sub={
              insights.bodyComp?.fatMassKg != null
                ? `${trimNum(insights.bodyComp.fatMassKg)} kg fat`
                : "needs body fat"
            }
            tone="none"
          />
          <Metric
            label="FFMI"
            value={insights.bodyComp?.ffmi != null ? `${trimNum(insights.bodyComp.ffmi)}` : "—"}
            sub="lean ÷ height²"
            tone="none"
          />
          <Metric
            label="Metabolic age"
            value={insights.bodyComp?.metabolicAge != null ? `${insights.bodyComp.metabolicAge} yr` : "—"}
            sub="estimated"
            tone="none"
          />
          <Metric
            label="Logging streak"
            value={insights.streak.logging > 0 ? `${insights.streak.logging} d` : "—"}
            sub={insights.streak.onTarget > 0 ? `${insights.streak.onTarget} d on target` : "current run"}
            tone={insights.streak.logging >= 3 ? "good" : "none"}
          />
        </Card>

        {insights.prs.length > 0 && (
          <Card className="p-0">
            <div className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Personal records (est. 1RM)
            </div>
            <div className="mt-1 divide-y divide-border">
              {insights.prs.map((l) => (
                <div key={l.exercise} className="flex items-baseline justify-between px-4 py-2.5">
                  <span className="text-sm">{EXERCISE_LABELS[l.exercise as Exercise] ?? l.exercise}</span>
                  <span className="text-sm font-medium tabular-nums">
                    {l.best1RM} kg
                    {l.latest1RM < l.best1RM && (
                      <span className="ml-2 text-xs text-muted-foreground">now {l.latest1RM}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {insights.yearly.length > 1 && (
          <Card className="p-0">
            <div className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Weight by year
            </div>
            <div className="mt-1 divide-y divide-border">
              {insights.yearly.map((y) => (
                <div key={y.year} className="flex items-baseline justify-between px-4 py-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{y.year}</span>
                  <span className="tabular-nums">
                    <span className="font-medium">{trimNum(y.avgWeight)} kg</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {trimNum(y.min)}–{trimNum(y.max)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {insights.monthly.length >= 6 && (
          <Card className="p-3">
            <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Weight by month (seasonality)
            </div>
            <SeasonalBars months={insights.monthly} />
          </Card>
        )}
      </Section>

      <Section title="Body">
        <WeightChart data={fWeight} predictions={fPredictions} goalWeight={goalWeight} today={today} />
        <HeartRateChart data={fHr} />
        <SleepChart data={fSleep} start={startOf(fSleep)} end={today} granularity={granularity} />
      </Section>

      <Section title="Nutrition">
        <CalorieChart data={fCalories} target={targets.kcal} mealSplit={mealSplit} />
        <FiberChart data={fCalories} />
        <SatFatChart data={fCalories} />
        <HydrationChart data={fCalories} />
      </Section>

      <Section title="Training">
        <LiftChart data={fLifts} />
        <StepsChart data={fActivity} />
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
