"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, EmptyState } from "@/components/ui";
import { EXERCISE_LABELS, EXERCISES, Meal } from "@/lib/constants";
import {
  Granularity,
  bucketKey,
  bucketKeysBetween,
  bucketLabel,
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

const ACTUAL_COLOR = "#22c55e";
const PREDICTED_COLOR = "#60a5fa";

// Calorie-bar status colours.
const CAL_COLORS = {
  under: "#22c55e", // comfortably under the (meal-proportional) target
  near: "#f59e0b", // within ±10% of it
  over: "#ef4444", // more than 10% over
  none: "var(--muted-foreground)", // no target / nothing logged
};

const AXIS = "var(--muted-foreground)";
const GRID = "var(--border)";

function shortDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </Card>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--foreground)",
  fontSize: 12,
};

export function WeightChart({
  data,
  predictions = [],
  goalWeight,
}: {
  data: WeightPoint[];
  predictions?: WeightPrediction[];
  goalWeight?: number | null;
}) {
  const goal = goalWeight ?? null;
  const predByDate = new Map(predictions.map((p) => [p.date, p.predicted]));
  const chartData = data.map((d) => ({
    ...d,
    predicted: predByDate.get(d.date) ?? null,
  }));

  // Scope the y-axis to the actual + predicted data only; a far-off goal would
  // otherwise squash the whole weight band. The goal is shown as an annotation.
  const values = data.map((d) => d.weight).concat(predictions.map((p) => p.predicted));
  const lo = values.length ? Math.floor(Math.min(...values) - 1) : 0;
  const hi = values.length ? Math.ceil(Math.max(...values) + 1) : 1;
  const goalInView = goal != null && goal >= lo && goal <= hi;

  const latestWeight = data.length ? data[data.length - 1].weight : null;
  const toGoal =
    goal != null && latestWeight != null
      ? Math.round((latestWeight - goal) * 10) / 10
      : null;
  const goalNote =
    goal != null
      ? `Goal ${goal} kg${
          toGoal != null && toGoal !== 0
            ? ` · ${Math.abs(toGoal)} kg ${toGoal > 0 ? "to go" : "below"}`
            : ""
        }`
      : null;

  const latestPred = predictions[predictions.length - 1];
  const summary = data.length
    ? `Weight: latest ${data[data.length - 1].weight} kg${goal != null ? `, goal ${goal} kg` : ""}.${
        latestPred
          ? ` Latest prediction ${latestPred.predicted} kg vs actual ${latestPred.actual} kg.`
          : ""
      }`
    : "No weight logged.";

  return (
    <ChartCard title="Weight">
      {data.length === 0 ? (
        <EmptyState>Log your weight to see the trend.</EmptyState>
      ) : (
        <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
            <YAxis
              stroke={AXIS}
              fontSize={11}
              allowDecimals={false}
              width={40}
              domain={[lo, hi]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label) => shortDate(String(label))}
              formatter={(value, name) =>
                value == null ? ["—", name] : [`${value} kg`, name]
              }
            />
            {goalInView && (
              <ReferenceLine
                y={goal as number}
                stroke="var(--accent)"
                strokeDasharray="5 4"
                label={{ value: `goal ${goal}`, position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
              />
            )}
            <Line
              type="monotone"
              dataKey="weight"
              stroke={ACTUAL_COLOR}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              name="actual"
            />
            {predictions.length > 0 && (
              <Line
                type="monotone"
                dataKey="predicted"
                stroke={PREDICTED_COLOR}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                connectNulls={false}
                dot={{ r: 3, fill: PREDICTED_COLOR }}
                name="predicted"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        </div>
      )}
      {goalNote && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-0 w-3 border-t-2 border-dashed"
            style={{ borderColor: "var(--accent)" }}
          />
          {goalNote}
        </p>
      )}
      {predictions.length > 0 && (
        <>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <Swatch color={ACTUAL_COLOR} label="Actual" />
            <Swatch color={PREDICTED_COLOR} label="Predicted" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Predicted from the prior window&apos;s food &amp; exercise. A gap from
            actual suggests under-reporting or that contingency needs tuning.
          </p>
        </>
      )}
    </ChartCard>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

export function CalorieChart({
  data,
  target,
  mealSplit,
}: {
  data: CaloriePoint[];
  target: number;
  mealSplit: Record<Meal, number>;
}) {
  const hasData = data.some((d) => d.kcal > 0);
  const dataMax = Math.max(0, ...data.map((d) => d.kcal));
  const yMax = Math.ceil(Math.max(dataMax, target) / 100) * 100;

  // Proportional target: only count the meals actually logged that day, so a
  // day with just breakfast + lunch in isn't judged against the full goal.
  const fraction = (meals: Meal[]) =>
    meals.reduce((s, m) => s + (mealSplit[m] ?? 0), 0) / 100;
  const colorFor = (d: CaloriePoint) => {
    // Judge each day against the target that was in effect that day.
    const eff = (d.targetKcal ?? target) * fraction(d.meals);
    if (eff <= 0) return CAL_COLORS.none;
    if (d.kcal > eff * 1.1) return CAL_COLORS.over; // >10% over → red
    if (d.kcal > eff) return CAL_COLORS.near; // up to 10% over → amber
    return CAL_COLORS.under; // at or under target → green (contingency already covers under-reporting)
  };

  const logged = data.filter((d) => d.kcal > 0);
  const avg = logged.length
    ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length)
    : 0;
  const summary = `Calories: averaging ${avg} kcal per logged day versus a ${target} kcal target.`;
  return (
    <ChartCard title="Calories">
      {!hasData ? (
        <EmptyState>No food logged yet.</EmptyState>
      ) : (
        <>
          <div role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
              <YAxis stroke={AXIS} fontSize={11} width={40} domain={[0, yMax]} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--foreground)" }}
                labelFormatter={(label) => shortDate(String(label))}
                cursor={{ fill: "var(--muted)" }}
              />
              {target > 0 && (
                <ReferenceLine
                  y={target}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: `goal ${target}`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
              )}
              <Bar dataKey="kcal" radius={[4, 4, 0, 0]} name="kcal">
                {data.map((d) => (
                  <Cell key={d.date} fill={colorFor(d)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Swatch color={CAL_COLORS.under} label="On/under" />
            <Swatch color={CAL_COLORS.near} label="Up to 10% over" />
            <Swatch color={CAL_COLORS.over} label="Over" />
            <span>· judged vs the day’s logged-meal share of {target} kcal</span>
          </div>
        </>
      )}
    </ChartCard>
  );
}

const LIFT_COLORS: Record<string, string> = {
  squat: "#22c55e",
  bench: "#2563eb",
  row: "#d97706",
  ohp: "#db2777",
  deadlift: "#9333ea",
};

export function LiftChart({ data }: { data: LiftPoint[] }) {
  const summary = `Lift progression across ${data.length} workout${data.length === 1 ? "" : "s"}.`;
  return (
    <ChartCard title="Lift progression (kg)">
      {data.length === 0 ? (
        <EmptyState>Complete a workout to see progress.</EmptyState>
      ) : (
        <>
          <div role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
              <YAxis stroke={AXIS} fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => shortDate(String(label))} />
              {EXERCISES.map((ex) => (
                <Line
                  key={ex}
                  type="monotone"
                  dataKey={ex}
                  stroke={LIFT_COLORS[ex]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                  name={EXERCISE_LABELS[ex]}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {EXERCISES.map((ex) => (
              <span key={ex} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: LIFT_COLORS[ex] }} />
                {EXERCISE_LABELS[ex]}
              </span>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}

// ---- Distance ----

const MARATHON_KM = 42.195;
// Reference distances, smallest → largest, for a friendly "equivalent" callout.
const ROUTES = [
  { label: "a parkrun", km: 5 },
  { label: "a 10K", km: 10 },
  { label: "a half-marathon", km: 21.1 },
  { label: "Gothenburg → Borås", km: 65 },
  { label: "Gothenburg → Jönköping", km: 150 },
  { label: "Gothenburg → Örebro", km: 285 },
  { label: "Gothenburg → Stockholm", km: 470 },
  { label: "Stockholm → Malmö", km: 615 },
  { label: "the length of Sweden", km: 1572 },
];
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Friendly equivalent for a total distance, e.g. "1.5 marathons · about Gothenburg → Örebro". */
function distanceEquivalent(km: number): string | null {
  if (km <= 0) return null;
  const marathons = round1(km / MARATHON_KM);
  const mStr = marathons === 1 ? "1 marathon" : `${marathons} marathons`;
  // Closest reference by multiplicative distance.
  const route = ROUTES.reduce((best, r) =>
    Math.abs(Math.log(km / r.km)) < Math.abs(Math.log(km / best.km)) ? r : best,
  );
  const ratio = km / route.km;
  const rStr =
    ratio >= 0.9 && ratio <= 1.1 ? `about ${route.label}` : `${round1(ratio)}× ${route.label}`;
  return `${mStr} · ${rStr}`;
}

export function DistanceChart({
  data,
  start,
  end,
  granularity,
}: {
  data: DistancePoint[];
  start: string;
  end: string;
  granularity: Granularity;
}) {
  const keys = bucketKeysBetween(granularity, start, end);
  const sums = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const p of data) {
    const k = bucketKey(granularity, p.date);
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + p.km);
  }
  const chart = keys.map((k) => ({ label: bucketLabel(granularity, k), km: round1(sums.get(k) ?? 0) }));
  const total = data.reduce((s, p) => s + p.km, 0);
  const equiv = distanceEquivalent(total);
  const summary =
    total > 0
      ? `Distance: ${round1(total)} km total${equiv ? `, ${equiv}` : ""}.`
      : "No distance in range.";

  return (
    <ChartCard title="Distance">
      {data.length === 0 ? (
        <EmptyState>Log a cardio session with a distance to see this.</EmptyState>
      ) : (
        <>
          <div role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chart} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke={AXIS} fontSize={11} width={40} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--muted)" }}
                  formatter={(v) => [`${v} km`, "Distance"]}
                />
                <Bar dataKey="km" radius={[4, 4, 0, 0]} fill="#2563eb" name="km" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{round1(total)} km</span> total
            {equiv && <> · {equiv}</>}
          </p>
        </>
      )}
    </ChartCard>
  );
}

// ---- Sleep ----

const SLEEP_COLORS = { deep: "#1e3a8a", rem: "#6366f1", light: "#93c5fd" };

export function SleepChart({
  data,
  start,
  end,
  granularity,
}: {
  data: SleepPoint[];
  start: string;
  end: string;
  granularity: Granularity;
}) {
  const hasStages = data.some(
    (d) => d.deepMin != null || d.remMin != null || d.lightMin != null,
  );
  const keys = bucketKeysBetween(granularity, start, end);
  type Acc = { dur: number; deep: number; rem: number; light: number; n: number };
  const acc = new Map<string, Acc>(
    keys.map((k) => [k, { dur: 0, deep: 0, rem: 0, light: 0, n: 0 }]),
  );
  for (const d of data) {
    const a = acc.get(bucketKey(granularity, d.date));
    if (!a) continue;
    a.dur += d.durationMin;
    a.deep += d.deepMin ?? 0;
    a.rem += d.remMin ?? 0;
    a.light += d.lightMin ?? 0;
    a.n++;
  }
  // Per bucket: average per-night hours (so week/month buckets are comparable).
  const chart = keys.map((k) => {
    const a = acc.get(k)!;
    const n = a.n || 1;
    return {
      label: bucketLabel(granularity, k),
      deep: round1(a.deep / n / 60),
      rem: round1(a.rem / n / 60),
      light: round1(a.light / n / 60),
      asleep: round1(a.dur / n / 60),
    };
  });
  const nights = data.length;
  const avgH = nights
    ? round1(data.reduce((s, d) => s + d.durationMin, 0) / nights / 60)
    : 0;
  const summary = nights
    ? `Sleep: ${avgH} hours per night on average over ${nights} nights.`
    : "No sleep data in range.";

  return (
    <ChartCard title="Sleep">
      {nights === 0 ? (
        <EmptyState>Connect a wearable to see your sleep.</EmptyState>
      ) : (
        <>
          <div role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chart} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke={AXIS} fontSize={11} width={40} unit="h" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, n) => [`${v} h`, String(n)]}
                />
                {hasStages ? (
                  <>
                    <Bar dataKey="deep" stackId="s" fill={SLEEP_COLORS.deep} name="Deep" />
                    <Bar dataKey="rem" stackId="s" fill={SLEEP_COLORS.rem} name="REM" />
                    <Bar
                      dataKey="light"
                      stackId="s"
                      fill={SLEEP_COLORS.light}
                      name="Light"
                      radius={[4, 4, 0, 0]}
                    />
                  </>
                ) : (
                  <Bar dataKey="asleep" fill={SLEEP_COLORS.rem} name="Asleep" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {hasStages && (
              <>
                <Swatch color={SLEEP_COLORS.deep} label="Deep" />
                <Swatch color={SLEEP_COLORS.rem} label="REM" />
                <Swatch color={SLEEP_COLORS.light} label="Light" />
              </>
            )}
            <span>· avg {avgH} h/night</span>
          </div>
        </>
      )}
    </ChartCard>
  );
}

// ---- Resting heart rate ----

export function HeartRateChart({ data }: { data: RestingHrPoint[] }) {
  const lo = data.length ? Math.floor(Math.min(...data.map((d) => d.restingBpm)) - 3) : 0;
  const hi = data.length ? Math.ceil(Math.max(...data.map((d) => d.restingBpm)) + 3) : 1;
  const summary = data.length
    ? `Resting heart rate: latest ${data[data.length - 1].restingBpm} bpm.`
    : "No resting heart rate in range.";
  return (
    <ChartCard title="Resting heart rate">
      {data.length === 0 ? (
        <EmptyState>Connect a wearable to see resting HR.</EmptyState>
      ) : (
        <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
            <YAxis stroke={AXIS} fontSize={11} width={40} domain={[lo, hi]} allowDecimals={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(l) => shortDate(String(l))}
              formatter={(v) => [`${v} bpm`, "Resting HR"]}
            />
            <Line
              type="monotone"
              dataKey="restingBpm"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={{ r: 2 }}
              name="bpm"
            />
          </LineChart>
        </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
