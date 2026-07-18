"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { round1 } from "@/lib/format";
import { LogWeightButton } from "@/components/stats/LogWeightButton";
import { projectGoalEta } from "@/lib/goal-eta";
import { compositionBars } from "@/lib/metabolic-age";
import { EXERCISE_LABELS, EXERCISES, Meal } from "@/lib/constants";
import {
  Granularity,
  bucketKey,
  bucketKeysBetween,
  bucketLabel,
  bucketReduce,
} from "@/lib/stats-range";
import { acwr, dailyLoad, type Acwr, type LoadSession } from "@/lib/fitness";
import type {
  ActivityPoint,
  CaloriePoint,
  DistancePoint,
  EnergyPoint,
  LiftPoint,
  RestingHrPoint,
  SleepPoint,
  Vo2Point,
  WeightPoint,
  WeightPrediction,
} from "@/lib/stats-data";

const ACTUAL_COLOR = "#22c55e";
const PREDICTED_COLOR = "#60a5fa";
const AVG_COLOR = "var(--muted-foreground)";

// Calorie-bar status colours.
const CAL_COLORS = {
  under: "#22c55e", // comfortably under the (meal-proportional) target
  near: "#f59e0b", // within ±10% of it
  over: "#ef4444", // more than 10% over
  none: "var(--muted-foreground)", // no target / nothing logged
};

// Protein-bar status colours: hit the day's target (a floor to reach) or fell short.
const PROTEIN_COLORS = {
  met: "#22c55e", // at or above the target that day/bucket
  under: "#f59e0b", // below it
  none: "var(--muted-foreground)", // no target / nothing logged
};

// Energy-balance bar colours (consumed vs burned) + the burn line.
const ENERGY_COLORS = {
  deficit: "#22c55e", // ate at or under what was burned → net loss
  surplus: "#ef4444", // ate more than burned → net gain
  none: "var(--muted-foreground)",
  burn: "#f97316", // total-burn overlay line
};

const AXIS = "var(--muted-foreground)";
const GRID = "var(--border)";

function shortDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

/** "dd/mm/yy" from an ISO date — for tooltips where the year matters. */
function shortDateYear(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Jul 2027" from an ISO date — tz-stable (parses the string parts). */
function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/**
 * Nutrition rows for a chart at the chosen grouping. "day" passes each logged
 * day through; "week"/"month" sum the metrics into one bar per bucket (so a long
 * range reads as totals, not a forest of daily bars). `loggedDays` lets a chart
 * scale its per-day target to the bucket (target × days logged).
 */
type NutRow = {
  key: string;
  loggedDays: number;
  kcal: number;
  protein: number;
  /** Protein target for the bucket: the per-day target (day view), or the sum of
   * each logged day's target (week/month), so it scales to the total-protein bar
   * and steps as the goal changed. */
  proteinTarget: number;
  fiber: number;
  fiberEstimated: number;
  satFat: number;
  water: number;
  waterWater: number;
  waterDrink: number;
  waterFood: number;
};
function nutritionRows(
  data: CaloriePoint[],
  g: Granularity,
  start: string,
  end: string,
): NutRow[] {
  if (g === "day") {
    return data.map((d) => ({
      key: d.date,
      loggedDays: d.kcal > 0 ? 1 : 0,
      kcal: d.kcal,
      protein: d.protein,
      // Day view: always show the day's own target (the moving dotted line), even
      // on unlogged days, so the goal-over-time line stays continuous.
      proteinTarget: d.targetProtein,
      fiber: d.fiber,
      fiberEstimated: d.fiberEstimated,
      satFat: d.satFat,
      water: d.water,
      waterWater: d.waterWater,
      waterDrink: d.waterDrink,
      waterFood: d.waterFood,
    }));
  }
  const keys = bucketKeysBetween(g, start, end);
  const acc = new Map(
    keys.map((k) => [
      k,
      { kcal: 0, protein: 0, proteinTarget: 0, fiber: 0, fiberEstimated: 0, satFat: 0, water: 0, waterWater: 0, waterDrink: 0, waterFood: 0, loggedDays: 0 },
    ]),
  );
  for (const d of data) {
    const a = acc.get(bucketKey(g, d.date));
    if (!a) continue;
    a.kcal += d.kcal;
    a.protein += d.protein;
    a.fiber += d.fiber;
    a.fiberEstimated += d.fiberEstimated;
    a.satFat += d.satFat;
    a.water += d.water;
    a.waterWater += d.waterWater;
    a.waterDrink += d.waterDrink;
    a.waterFood += d.waterFood;
    // Sum the target only over logged days, so a partly-logged week isn't judged
    // against a full week's worth of protein goal (mirrors the calorie logic).
    if (d.kcal > 0) {
      a.loggedDays += 1;
      a.proteinTarget += d.targetProtein;
    }
  }
  return keys.map((k) => ({ key: k, ...acc.get(k)! }));
}

const groupNoun = (g: Granularity) => (g === "day" ? "day" : g === "week" ? "week" : "month");

const PERIOD_ADJ: Record<Granularity, string> = { day: "Daily", week: "Weekly", month: "Monthly" };

/**
 * Title suffix spelling out how a grouped series is aggregated, e.g.
 * " · Weekly total". Empty on the day view, where bars/points are the raw
 * per-day values. `agg` is the per-chart reducer ("avg"/"total"/"best") so the
 * title says whether a week bar sums its days or averages them.
 */
function groupSuffix(g: Granularity, agg: "avg" | "total" | "best"): string {
  return g === "day" ? "" : ` · ${PERIOD_ADJ[g]} ${agg}`;
}

function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
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

/** Wraps a chart so assistive tech announces only `summary`. Recharts renders
 * its SVG with role="application" and dozens of empty groups; hiding that
 * subtree keeps the a11y tree to the one curated description. */
function ChartFigure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={summary}>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function WeightChart({
  data,
  predictions = [],
  goalWeight,
  today,
  doseMarkers = [],
  granularity = "day",
  start,
  end,
}: {
  data: WeightPoint[];
  predictions?: WeightPrediction[];
  goalWeight?: number | null;
  /** Vertical markers (e.g. medication dose changes) snapped to the nearest weigh-in. */
  doseMarkers?: { date: string; label: string }[];
  /** When set, shows a quick weight-log button that logs against this date. */
  today?: string;
  granularity?: Granularity;
  start?: string;
  end?: string;
}) {
  const goal = goalWeight ?? null;
  const isDay = granularity === "day";
  // Trailing 7-point moving average smooths daily water-weight noise so the
  // trend is readable (only worth showing once there are a few weigh-ins).
  // Only meaningful on the daily view — week/month buckets are already averaged.
  const showAvg = isDay && data.length >= 5;
  const s = start ?? data[0]?.date ?? today ?? "";
  const e = end ?? today ?? data[data.length - 1]?.date ?? "";

  // `x` is the categorical axis value (date for day; bucket key otherwise).
  type Row = { x: string; weight: number | null; predicted: number | null; avg: number | null };
  const { chartData, snappedMarkers } = React.useMemo<{
    chartData: Row[];
    snappedMarkers: { x: string; label: string }[];
  }>(() => {
    const predByDate = new Map(predictions.map((p) => [p.date, p.predicted]));
    if (isDay) {
      const rows = data.map((d, i) => {
        const window = data.slice(Math.max(0, i - 6), i + 1);
        const avg = window.reduce((sum, p) => sum + p.weight, 0) / window.length;
        return {
          x: d.date,
          weight: d.weight,
          predicted: predByDate.get(d.date) ?? null,
          avg: showAvg ? round1(avg) : null,
        };
      });
      // Snap each dose marker to the nearest weigh-in date (categorical X axis).
      const chartDates = data.map((d) => d.date);
      const markers = doseMarkers
        .map((m) => {
          let best: string | null = null;
          let bestDiff = Infinity;
          for (const d of chartDates) {
            const diff = Math.abs(Date.parse(d) - Date.parse(m.date));
            if (diff < bestDiff) {
              bestDiff = diff;
              best = d;
            }
          }
          return best ? { x: best, label: m.label } : null;
        })
        .filter((m): m is { x: string; label: string } => m != null);
      return { chartData: rows, snappedMarkers: markers };
    }
    const wk = bucketReduce(data, (d) => d.date, (d) => d.weight, granularity, s, e, "avg");
    const pr = bucketReduce(predictions, (p) => p.date, (p) => p.predicted, granularity, s, e, "avg");
    // Key on the bucket key (unique) rather than the display label (week labels
    // repeat across years), and format the label at the axis/tooltip.
    const rows = wk.map((w, i) => ({
      x: w.key,
      weight: w.value == null ? null : round1(w.value),
      predicted: pr[i]?.value == null ? null : round1(pr[i].value),
      avg: null,
    }));
    // Map each dose marker to its bucket key.
    const bucketKeys = new Set(wk.map((w) => w.key));
    const markers = doseMarkers
      .map((m) => {
        const k = bucketKey(granularity, m.date);
        return bucketKeys.has(k) ? { x: k, label: m.label } : null;
      })
      .filter((m): m is { x: string; label: string } => m != null);
    return { chartData: rows, snappedMarkers: markers };
  }, [data, predictions, doseMarkers, granularity, s, e, isDay, showAvg]);

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
  const eta =
    goal != null && today
      ? projectGoalEta(
          data.map((d) => ({ date: d.date, weight: d.weight })),
          goal,
          today,
        )
      : null;
  const goalNote =
    goal != null
      ? `Goal ${goal} kg${
          toGoal != null && toGoal !== 0
            ? ` · ${Math.abs(toGoal)} kg ${toGoal > 0 ? "to go" : "below"}`
            : ""
        }${
          eta ? ` · est. ${longDate(eta.date)} at ${Math.abs(eta.kgPerWeek)} kg/wk` : ""
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
    <ChartCard
      title={`Weight${groupSuffix(granularity, "avg")}`}
      action={
        today ? (
          <LogWeightButton date={today} current={data[data.length - 1]?.weight ?? null} />
        ) : undefined
      }
    >
      {data.length === 0 ? (
        <EmptyState>Log your weight to see the trend.</EmptyState>
      ) : (
        <ChartFigure summary={summary}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="x"
              tickFormatter={(v) => bucketLabel(granularity, String(v))}
              interval="preserveStartEnd"
              stroke={AXIS}
              fontSize={11}
            />
            <YAxis
              stroke={AXIS}
              fontSize={11}
              allowDecimals={false}
              width={40}
              domain={[lo, hi]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label) =>
                isDay ? shortDateYear(String(label)) : bucketLabel(granularity, String(label))
              }
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
            {snappedMarkers.map((m, i) => (
              <ReferenceLine
                key={`dose-${i}`}
                x={m.x}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 3"
                label={{ value: m.label, position: "top", fontSize: 9, fill: "var(--muted-foreground)" }}
              />
            ))}
            {showAvg && (
              <Line
                type="monotone"
                dataKey="avg"
                stroke={AVG_COLOR}
                strokeWidth={1.5}
                dot={false}
                name="7-day avg"
              />
            )}
            <Line
              type="monotone"
              dataKey="weight"
              stroke={ACTUAL_COLOR}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls={!isDay}
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
        </ChartFigure>
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
      {(showAvg || predictions.length > 0) && (
        <>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <Swatch color={ACTUAL_COLOR} label="Actual" />
            {showAvg && <Swatch color={AVG_COLOR} label="7-day avg" />}
            {predictions.length > 0 && <Swatch color={PREDICTED_COLOR} label="Predicted" />}
          </div>
          {predictions.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Predicted from the prior window&apos;s food &amp; exercise. A gap from
              actual suggests under-reporting or that contingency needs tuning.
            </p>
          )}
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

const MARKER_COLOR = "#a855f7";

/** A blood/lab marker over time overlaid on body weight (dual y-axis), to see
 * whether weight change tracked a marker — e.g. "did losing weight move LDL?". */
export function MarkerWeightChart({
  markerName,
  unit,
  marker,
  weight,
}: {
  markerName: string;
  unit: string;
  marker: { date: string; value: number }[];
  weight: { date: string; weight: number }[];
}) {
  // Span the weight line over the marker's own date range, so a couple of recent
  // labs aren't lost against 14 years of weigh-ins.
  const first = marker[0]?.date ?? "";
  const last = marker[marker.length - 1]?.date ?? "";
  const byDate = new Map<string, { date: string; marker?: number; weight?: number }>();
  for (const m of marker) byDate.set(m.date, { ...(byDate.get(m.date) ?? { date: m.date }), marker: m.value });
  for (const w of weight) {
    if (w.date < first || w.date > last) continue;
    byDate.set(w.date, { ...(byDate.get(w.date) ?? { date: w.date }), weight: w.weight });
  }
  const data = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  if (marker.length < 2) {
    return (
      <EmptyState>Need at least two dated {markerName} results to chart a trend.</EmptyState>
    );
  }

  return (
    <ChartFigure summary={`${markerName} vs body weight over time`}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
          <YAxis yAxisId="marker" stroke={MARKER_COLOR} fontSize={11} width={44} />
          <YAxis
            yAxisId="weight"
            orientation="right"
            stroke={ACTUAL_COLOR}
            fontSize={11}
            width={40}
            domain={["dataMin - 1", "dataMax + 1"]}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => longDate(String(label))}
            formatter={(value, name) =>
              value == null ? ["—", name] : [`${value}${name === "weight" ? " kg" : ` ${unit}`}`, name]
            }
          />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="weight"
            stroke={ACTUAL_COLOR}
            strokeWidth={1.5}
            dot={false}
            connectNulls
            name="weight"
          />
          <Line
            yAxisId="marker"
            type="monotone"
            dataKey="marker"
            stroke={MARKER_COLOR}
            strokeWidth={2.5}
            dot={{ r: 3, fill: MARKER_COLOR }}
            connectNulls
            name={markerName}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Swatch color={MARKER_COLOR} label={`${markerName}${unit ? ` (${unit})` : ""}`} />
        <Swatch color={ACTUAL_COLOR} label="Body weight (kg)" />
      </div>
    </ChartFigure>
  );
}

export function CalorieChart({
  data,
  target,
  mealSplit,
  granularity = "day",
  start,
  end,
}: {
  data: CaloriePoint[];
  target: number;
  mealSplit: Record<Meal, number>;
  granularity?: Granularity;
  start?: string;
  end?: string;
}) {
  const isDay = granularity === "day";
  const rows = React.useMemo(
    () => nutritionRows(data, granularity, start ?? data[0]?.date ?? "", end ?? data[data.length - 1]?.date ?? ""),
    [data, granularity, start, end],
  );
  const hasData = rows.some((r) => r.kcal > 0);

  // Day view judges each day against the target in effect that day, counting only
  // the meals actually logged (so a half-logged day isn't unfairly "over").
  const dayByKey = new Map(data.map((d) => [d.date, d]));
  const fraction = (meals: Meal[]) => meals.reduce((s, m) => s + (mealSplit[m] ?? 0), 0) / 100;
  const colorFor = (r: NutRow) => {
    if (isDay) {
      const d = dayByKey.get(r.key)!;
      const eff = (d.targetKcal ?? target) * fraction(d.meals);
      if (eff <= 0) return CAL_COLORS.none;
      return d.kcal > eff * 1.1 ? CAL_COLORS.over : d.kcal > eff ? CAL_COLORS.near : CAL_COLORS.under;
    }
    // Week/month: total vs the daily target scaled to days actually logged.
    const eff = target * r.loggedDays;
    if (eff <= 0) return CAL_COLORS.none;
    return r.kcal > eff * 1.1 ? CAL_COLORS.over : r.kcal > eff ? CAL_COLORS.near : CAL_COLORS.under;
  };
  const chart = rows.map((r) => ({ ...r, color: colorFor(r) }));

  const dataMax = Math.max(0, ...chart.map((r) => r.kcal));
  const yMax = Math.ceil(Math.max(dataMax, isDay ? target : 0) / 100) * 100 || 100;
  const totalKcal = chart.reduce((s, r) => s + r.kcal, 0);
  const totalDays = chart.reduce((s, r) => s + r.loggedDays, 0);
  const avg = totalDays ? Math.round(totalKcal / totalDays) : 0;
  const summary = `Calories: averaging ${avg} kcal per logged day versus a ${target} kcal target.`;
  return (
    <ChartCard title={`Calories${groupSuffix(granularity, "total")}`}>
      {!hasData ? (
        <EmptyState>No food logged yet.</EmptyState>
      ) : (
        <>
          <ChartFigure summary={summary}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="key"
                tickFormatter={(v) => bucketLabel(granularity, String(v))}
                stroke={AXIS}
                fontSize={11}
                interval="preserveStartEnd"
              />
              <YAxis stroke={AXIS} fontSize={11} width={40} domain={[0, yMax]} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--foreground)" }}
                labelFormatter={(label) => bucketLabel(granularity, String(label))}
                formatter={(value) => [`${Math.round(Number(value))} kcal`, "kcal"]}
                cursor={{ fill: "var(--muted)" }}
              />
              {isDay && target > 0 && (
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
                {chart.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </ChartFigure>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Swatch color={CAL_COLORS.under} label="On/under" />
            <Swatch color={CAL_COLORS.near} label="Up to 10% over" />
            <Swatch color={CAL_COLORS.over} label="Over" />
            <span>
              {isDay
                ? `· judged vs the day’s logged-meal share of ${target} kcal`
                : `· each ${groupNoun(granularity)} judged vs ${target} kcal × days logged`}
            </span>
          </div>
        </>
      )}
    </ChartCard>
  );
}

/**
 * Protein grams per day (or bucket total) with a dotted target line that steps
 * over time — each day is compared against the target that was in effect *that*
 * day, so past days keep their old goal when the goal later changes. Bars are
 * green when they meet the target, amber when short. Week/month sum both the
 * protein and (over logged days) the target, so the line stays comparable.
 */
export function ProteinChart({ data, granularity = "day", start, end }: NutrientChartProps) {
  const isDay = granularity === "day";
  const rows = React.useMemo(
    () => nutritionRows(data, granularity, start ?? data[0]?.date ?? "", end ?? data[data.length - 1]?.date ?? ""),
    [data, granularity, start, end],
  );
  const hasData = rows.some((r) => r.protein > 0);
  const colorFor = (r: NutRow) =>
    r.proteinTarget <= 0
      ? PROTEIN_COLORS.none
      : r.protein >= r.proteinTarget
        ? PROTEIN_COLORS.met
        : PROTEIN_COLORS.under;
  const chart = rows.map((r) => ({ ...r, color: colorFor(r) }));

  const dataMax = Math.max(0, ...chart.map((r) => Math.max(r.protein, r.proteinTarget)));
  const yMax = Math.max(20, Math.ceil(dataMax / 20) * 20);
  const totalProtein = chart.reduce((s, r) => s + r.protein, 0);
  const totalDays = chart.reduce((s, r) => s + r.loggedDays, 0);
  const avg = totalDays ? Math.round(totalProtein / totalDays) : 0;
  // Latest goal (last row with a target) for the plain-language summary.
  const latestTarget = [...data].reverse().find((d) => d.targetProtein > 0)?.targetProtein ?? 0;
  const summary = `Protein: averaging ${avg} g per logged day versus a ${latestTarget} g target.`;
  return (
    <ChartCard title={`Protein (g)${groupSuffix(granularity, "total")}`}>
      {!hasData ? (
        <EmptyState>No food logged yet.</EmptyState>
      ) : (
        <>
          <ChartFigure summary={summary}>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chart} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => bucketLabel(granularity, String(v))}
                  stroke={AXIS}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis stroke={AXIS} fontSize={11} width={40} domain={[0, yMax]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--foreground)" }}
                  labelFormatter={(label) => bucketLabel(granularity, String(label))}
                  formatter={(value, name) => [`${Math.round(Number(value))} g`, name]}
                  cursor={{ fill: "var(--muted)" }}
                />
                <Bar dataKey="protein" radius={[4, 4, 0, 0]} name="Protein">
                  {chart.map((r) => (
                    <Cell key={r.key} fill={r.color} />
                  ))}
                </Bar>
                {/* Stepped so it holds a goal flat until it changes, and reads as
                    "the target on that day". */}
                <Line
                  type="stepAfter"
                  dataKey="proteinTarget"
                  name="Target"
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFigure>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Swatch color={PROTEIN_COLORS.met} label="Met target" />
            <Swatch color={PROTEIN_COLORS.under} label="Under" />
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
              Target {isDay ? "that day" : "× days logged"}
            </span>
          </div>
        </>
      )}
    </ChartCard>
  );
}

/**
 * Energy balance: calories consumed (bars) with total daily burn overlaid as a
 * line, so you can see at a glance whether intake sat above or below expenditure.
 * Bars are green on a deficit day/bucket (ate ≤ burned) and red on a surplus.
 * Averaged per logged day at every grouping, so a week reads as a typical day in
 * vs out (not a total that unlogged days would distort).
 */
export function EnergyBalanceChart({
  data,
  granularity = "day",
  start,
  end,
}: {
  data: EnergyPoint[];
  granularity?: Granularity;
  start?: string;
  end?: string;
}) {
  const isDay = granularity === "day";
  const s = start ?? data[0]?.date ?? "";
  const e = end ?? data[data.length - 1]?.date ?? "";
  // Compare in vs out over days actually logged, so unlogged days (0 consumed)
  // don't drag the average down against a burn figure that exists every day.
  const logged = React.useMemo(() => data.filter((d) => d.consumed > 0), [data]);
  const rows = React.useMemo(() => {
    const inn = bucketReduce(logged, (d) => d.date, (d) => d.consumed, granularity, s, e, "avg");
    const out = bucketReduce(logged, (d) => d.date, (d) => d.burned, granularity, s, e, "avg");
    const burnByKey = new Map(out.map((o) => [o.key, o.value]));
    return inn
      .map((i) => ({
        key: i.key,
        consumed: i.value == null ? null : Math.round(i.value),
        burned: burnByKey.get(i.key) == null ? null : Math.round(burnByKey.get(i.key)!),
      }))
      .filter((r) => r.consumed != null || r.burned != null);
  }, [logged, granularity, s, e]);

  const hasData = rows.some((r) => (r.consumed ?? 0) > 0);
  const chart = rows.map((r) => ({
    ...r,
    color:
      r.consumed == null || r.burned == null
        ? ENERGY_COLORS.none
        : r.consumed <= r.burned
          ? ENERGY_COLORS.deficit
          : ENERGY_COLORS.surplus,
  }));

  const dataMax = Math.max(0, ...chart.flatMap((r) => [r.consumed ?? 0, r.burned ?? 0]));
  const yMax = Math.ceil(dataMax / 200) * 200 || 200;

  // Averages over logged days for the summary line.
  const avg = (pick: (r: (typeof chart)[number]) => number | null) => {
    const vals = chart.map(pick).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  };
  const avgIn = avg((r) => r.consumed);
  const avgOut = avg((r) => r.burned);
  const net = avgIn - avgOut;
  const summary = `Energy balance: averaging ${avgIn} kcal in versus ${avgOut} kcal burned per logged day (${net >= 0 ? "+" : ""}${net} net).`;

  return (
    <ChartCard title={`Energy balance${groupSuffix(granularity, "avg")}`}>
      {!hasData ? (
        <EmptyState>No food logged yet.</EmptyState>
      ) : (
        <>
          <ChartFigure summary={summary}>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chart} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => bucketLabel(granularity, String(v))}
                  stroke={AXIS}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis stroke={AXIS} fontSize={11} width={40} domain={[0, yMax]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--foreground)" }}
                  labelFormatter={(label) =>
                    isDay ? shortDateYear(String(label)) : bucketLabel(granularity, String(label))
                  }
                  formatter={(value, name) => [`${Math.round(Number(value))} kcal`, name]}
                  cursor={{ fill: "var(--muted)" }}
                />
                <Bar dataKey="consumed" radius={[4, 4, 0, 0]} name="Consumed">
                  {chart.map((r) => (
                    <Cell key={r.key} fill={r.color} />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="burned"
                  name="Burned"
                  stroke={ENERGY_COLORS.burn}
                  strokeWidth={2}
                  dot={{ r: 2, fill: ENERGY_COLORS.burn }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFigure>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Swatch color={ENERGY_COLORS.deficit} label="Deficit (ate ≤ burned)" />
            <Swatch color={ENERGY_COLORS.surplus} label="Surplus" />
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: ENERGY_COLORS.burn }} />
              Total burned
            </span>
          </div>
        </>
      )}
    </ChartCard>
  );
}

/** Shared grams bar chart for secondary macros (fiber, saturated fat). Day view
 * shows per-day grams vs a daily target; week/month show the bucket total vs the
 * target scaled by days logged. */
function NutrientBarChart({
  title,
  data,
  dataKey,
  color,
  target,
  targetLabel,
  mode,
  emptyHint,
  estimatedDataKey,
  granularity = "day",
  start,
  end,
}: {
  title: string;
  data: CaloriePoint[];
  dataKey: "fiber" | "satFat";
  color: string;
  target: number;
  targetLabel: string;
  /** "more" = good when ≥ target (fiber); "less" = good when ≤ target (sat fat). */
  mode: "more" | "less";
  emptyHint: string;
  /** When set, the estimated portion of each bar is drawn lighter and stacked. */
  estimatedDataKey?: "fiberEstimated";
  granularity?: Granularity;
  start?: string;
  end?: string;
}) {
  const isDay = granularity === "day";
  const rows = React.useMemo(
    () => nutritionRows(data, granularity, start ?? data[0]?.date ?? "", end ?? data[data.length - 1]?.date ?? ""),
    [data, granularity, start, end],
  );
  const hasData = rows.some((r) => r[dataKey] > 0);
  const colorFor = (r: NutRow) => {
    const t = isDay ? target : target * r.loggedDays;
    return mode === "less" ? (r[dataKey] > t ? "#ef4444" : color) : r[dataKey] >= t && t > 0 ? color : "#f59e0b";
  };
  // When tracking estimates, split each bar into measured + estimated portions.
  const chart = rows.map((r) => {
    const est = estimatedDataKey ? r[estimatedDataKey] : 0;
    return { ...r, color: colorFor(r), measured: r[dataKey] - est, estimated: est };
  });
  const hasEstimated = chart.some((r) => r.estimated > 0);
  const dataMax = Math.max(0, ...chart.map((r) => r[dataKey]));
  const yMax = Math.max(5, Math.ceil(Math.max(dataMax, isDay ? target : 0) / 5) * 5);
  const total = chart.reduce((s, r) => s + r[dataKey], 0);
  const totalDays = chart.reduce((s, r) => s + r.loggedDays, 0);
  const avg = totalDays ? Math.round(total / totalDays) : 0;
  const summary = `${title}: averaging ${avg} g per logged day (target ${target} g).`;
  return (
    <ChartCard title={`${title} (g)${groupSuffix(granularity, "total")}`}>
      {!hasData ? (
        <EmptyState>{emptyHint}</EmptyState>
      ) : (
        <ChartFigure summary={summary}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chart} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="key"
                tickFormatter={(v) => bucketLabel(granularity, String(v))}
                stroke={AXIS}
                fontSize={11}
                interval="preserveStartEnd"
              />
              <YAxis stroke={AXIS} fontSize={11} width={40} domain={[0, yMax]} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--foreground)" }}
                labelFormatter={(label) => bucketLabel(granularity, String(label))}
                formatter={(value) => [`${Math.round(Number(value))} g`, title]}
                cursor={{ fill: "var(--muted)" }}
              />
              {isDay && (
                <ReferenceLine
                  y={target}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: targetLabel,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
              )}
              {estimatedDataKey ? (
                <>
                  <Bar dataKey="measured" stackId="n" radius={[4, 4, 0, 0]} name={title}>
                    {chart.map((r) => (
                      <Cell key={r.key} fill={r.color} />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="estimated"
                    stackId="n"
                    radius={[4, 4, 0, 0]}
                    name="Estimated"
                    fill={color}
                    fillOpacity={0.35}
                  />
                </>
              ) : (
                <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} name={title}>
                  {chart.map((r) => (
                    <Cell key={r.key} fill={r.color} />
                  ))}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
          {hasEstimated && (
            <p className="mt-2 text-xs text-muted-foreground">
              Lighter bars are AI-estimated fiber for foods logged without fiber data.
            </p>
          )}
        </ChartFigure>
      )}
    </ChartCard>
  );
}

type NutrientChartProps = { data: CaloriePoint[]; granularity?: Granularity; start?: string; end?: string };

export function FiberChart({ data, granularity, start, end }: NutrientChartProps) {
  return (
    <NutrientBarChart
      title="Fiber"
      data={data}
      dataKey="fiber"
      color="#22c55e"
      target={30}
      targetLabel="30g goal"
      mode="more"
      emptyHint="Fiber shows here once you log foods with fiber data."
      estimatedDataKey="fiberEstimated"
      granularity={granularity}
      start={start}
      end={end}
    />
  );
}

export function SatFatChart({ data, granularity, start, end }: NutrientChartProps) {
  return (
    <NutrientBarChart
      title="Saturated fat"
      data={data}
      dataKey="satFat"
      color="#94a3b8"
      target={22}
      targetLabel="22g cap"
      mode="less"
      emptyHint="Saturated fat shows here once you log foods with that data."
      granularity={granularity}
      start={start}
      end={end}
    />
  );
}

const WATER_COLORS = {
  water: "#38bdf8", // plain water
  drink: "#22d3ee", // other drinks (coffee, tea, milk, …)
  food: "#64748b", // incidental moisture from solid food
};

export function HydrationChart({
  data,
  granularity = "day",
  start,
  end,
}: {
  data: CaloriePoint[];
  granularity?: Granularity;
  start?: string;
  end?: string;
}) {
  const isDay = granularity === "day";
  const rows = React.useMemo(
    () => nutritionRows(data, granularity, start ?? data[0]?.date ?? "", end ?? data[data.length - 1]?.date ?? ""),
    [data, granularity, start, end],
  );
  const hasData = rows.some((r) => r.water > 0);
  const dataMax = Math.max(0, ...rows.map((r) => r.water));
  const yMax = Math.max(500, Math.ceil(Math.max(dataMax, isDay ? 2500 : 0) / 500) * 500);
  const totalWater = rows.reduce((s, r) => s + r.water, 0);
  const totalDays = rows.reduce((s, r) => s + r.loggedDays, 0);
  const avg = totalDays ? Math.round(totalWater / totalDays) : 0;
  const summary = `Hydration: averaging ${(avg / 1000).toFixed(1)} L per logged day — split across plain water, other drinks and food.`;
  return (
    <ChartCard title={`Hydration (est. ml)${groupSuffix(granularity, "total")}`}>
      {!hasData ? (
        <EmptyState>Logged food &amp; drink will show estimated water here.</EmptyState>
      ) : (
        <>
          <ChartFigure summary={summary}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rows} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => bucketLabel(granularity, String(v))}
                  stroke={AXIS}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis stroke={AXIS} fontSize={11} width={40} domain={[0, yMax]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--foreground)" }}
                  labelFormatter={(label) => bucketLabel(granularity, String(label))}
                  formatter={(value, name) => [`${Math.round(Number(value))} ml`, name]}
                  cursor={{ fill: "var(--muted)" }}
                />
                {isDay && (
                  <ReferenceLine
                    y={2500}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={{
                      value: "~2.5L",
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                )}
                <Bar dataKey="waterWater" stackId="w" fill={WATER_COLORS.water} name="Water" />
                <Bar dataKey="waterDrink" stackId="w" fill={WATER_COLORS.drink} name="Other drinks" />
                <Bar
                  dataKey="waterFood"
                  stackId="w"
                  fill={WATER_COLORS.food}
                  name="From food"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFigure>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Swatch color={WATER_COLORS.water} label="Water" />
            <Swatch color={WATER_COLORS.drink} label="Other drinks" />
            <Swatch color={WATER_COLORS.food} label="From food" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Estimated from logged mass &amp; macros — directional, not exact.
          </p>
        </>
      )}
    </ChartCard>
  );
}

const COMP_COLORS = {
  fat: "#f59e0b", // fat mass
  lean: "#16a34a", // soft lean (≈ muscle) mass
  bone: "#94a3b8", // bone mineral mass
};

/** Bodyweight stacked into fat / lean / bone per weigh-in, so the bar height is
 * total weight and the segments show how composition shifts over time. Only days
 * with a fat/lean split (scale body-fat or measured lean) appear. */
export function CompositionChart({
  data,
  granularity = "day",
  start,
  end,
}: {
  data: WeightPoint[];
  granularity?: Granularity;
  start?: string;
  end?: string;
}) {
  const bars = React.useMemo(() => compositionBars(data), [data]);
  const s = start ?? bars[0]?.date ?? "";
  const e = end ?? bars[bars.length - 1]?.date ?? "";
  const chart = React.useMemo(() => {
    if (granularity === "day") {
      return bars.map((b) => ({ key: b.date, fatKg: b.fatKg, leanKg: b.leanKg, boneKg: b.boneKg }));
    }
    const fat = bucketReduce(bars, (b) => b.date, (b) => b.fatKg, granularity, s, e, "avg");
    const lean = bucketReduce(bars, (b) => b.date, (b) => b.leanKg, granularity, s, e, "avg");
    const bone = bucketReduce(bars, (b) => b.date, (b) => b.boneKg, granularity, s, e, "avg");
    return fat
      .map((f, i) => ({
        key: f.key,
        fatKg: f.value == null ? 0 : round1(f.value),
        leanKg: lean[i].value == null ? 0 : round1(lean[i].value),
        boneKg: bone[i].value == null ? 0 : round1(bone[i].value),
      }))
      .filter((r) => r.fatKg > 0 || r.leanKg > 0 || r.boneKg > 0);
  }, [bars, granularity, s, e]);
  const hasData = chart.length > 0;
  const last = bars[bars.length - 1];
  const first = bars[0];
  const leanDelta =
    first && last && bars.length > 1 ? Math.round((last.leanKg - first.leanKg) * 10) / 10 : null;
  const summary = last
    ? `Body composition: latest ${last.fatKg} kg fat, ${last.leanKg} kg lean, ${last.boneKg} kg bone.`
    : "Body composition over time.";
  return (
    <ChartCard title={`Body composition (kg)${groupSuffix(granularity, "avg")}`}>
      {!hasData ? (
        <EmptyState>Weigh-ins with a body-fat reading will break weight into fat, lean &amp; bone here.</EmptyState>
      ) : (
        <>
          <ChartFigure summary={summary}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chart} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => bucketLabel(granularity, String(v))}
                  stroke={AXIS}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis stroke={AXIS} fontSize={11} width={40} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--foreground)" }}
                  labelFormatter={(label) => bucketLabel(granularity, String(label))}
                  formatter={(value, name) => [`${value} kg`, name]}
                  cursor={{ fill: "var(--muted)" }}
                />
                <Bar dataKey="fatKg" stackId="c" fill={COMP_COLORS.fat} name="Fat" />
                <Bar dataKey="leanKg" stackId="c" fill={COMP_COLORS.lean} name="Lean" />
                <Bar dataKey="boneKg" stackId="c" fill={COMP_COLORS.bone} name="Bone" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFigure>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Swatch color={COMP_COLORS.fat} label="Fat" />
            <Swatch color={COMP_COLORS.lean} label="Lean" />
            <Swatch color={COMP_COLORS.bone} label="Bone" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Stacks to total weight. “Lean” is soft lean tissue (≈ muscle); bone splits out only when the
            scale measures it.
            {leanDelta != null && ` Lean ${leanDelta >= 0 ? "+" : ""}${leanDelta} kg over this range.`}
          </p>
        </>
      )}
    </ChartCard>
  );
}

export function StepsChart({ data }: { data: ActivityPoint[] }) {
  const hasData = data.some((d) => d.steps > 0);
  const dataMax = Math.max(0, ...data.map((d) => d.steps));
  const yMax = Math.max(2000, Math.ceil(Math.max(dataMax, 10000) / 2000) * 2000);
  const logged = data.filter((d) => d.steps > 0);
  const avg = logged.length
    ? Math.round(logged.reduce((s, d) => s + d.steps, 0) / logged.length)
    : 0;
  const summary = `Steps: averaging ${avg.toLocaleString()} per active day from passive movement.`;
  return (
    <ChartCard title="Steps (passive / day)">
      {!hasData ? (
        <EmptyState>Passive steps appear here once your device syncs movement.</EmptyState>
      ) : (
        <>
          <ChartFigure summary={summary}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
                <YAxis
                  stroke={AXIS}
                  fontSize={11}
                  width={44}
                  domain={[0, yMax]}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--foreground)" }}
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(value, _n, item) => {
                    const km = (item?.payload as ActivityPoint | undefined)?.distanceKm;
                    return [
                      `${Number(value).toLocaleString()} steps${km ? ` · ${km} km` : ""}`,
                      "Movement",
                    ];
                  }}
                  cursor={{ fill: "var(--muted)" }}
                />
                <ReferenceLine
                  y={10000}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: "10k",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
                <Bar dataKey="steps" radius={[4, 4, 0, 0]} fill="#2dd4bf" name="Steps" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFigure>
          <p className="mt-2 text-xs text-muted-foreground">
            Passive movement from your device — counted toward energy use, net of any logged
            cardio sessions.
          </p>
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
          <ChartFigure summary={summary}>
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
          </ChartFigure>
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
  const chart = React.useMemo(
    () =>
      bucketReduce(data, (p) => p.date, (p) => p.km, granularity, start, end, "sum").map((b) => ({
        key: b.key,
        km: round1(b.value ?? 0),
      })),
    [data, granularity, start, end],
  );
  const total = data.reduce((s, p) => s + p.km, 0);
  const equiv = distanceEquivalent(total);
  const summary =
    total > 0
      ? `Distance: ${round1(total)} km total${equiv ? `, ${equiv}` : ""}.`
      : "No distance in range.";

  return (
    <ChartCard title={`Distance${groupSuffix(granularity, "total")}`}>
      {data.length === 0 ? (
        <EmptyState>Log a cardio session with a distance to see this.</EmptyState>
      ) : (
        <>
          <ChartFigure summary={summary}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chart} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => bucketLabel(granularity, String(v))}
                  stroke={AXIS}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis stroke={AXIS} fontSize={11} width={40} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--muted)" }}
                  labelFormatter={(label) => bucketLabel(granularity, String(label))}
                  formatter={(v) => [`${v} km`, "Distance"]}
                />
                <Bar dataKey="km" radius={[4, 4, 0, 0]} fill="#2563eb" name="km" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFigure>
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
  // Per bucket: average per-night hours (so week/month buckets are comparable).
  // Each stage averages minutes-per-night (missing stages count as 0), matching
  // the asleep average, then converts to hours.
  const chart = React.useMemo(() => {
    const avgOf = (pick: (d: SleepPoint) => number) =>
      bucketReduce(data, (d) => d.date, pick, granularity, start, end, "avg");
    const deep = avgOf((d) => d.deepMin ?? 0);
    const rem = avgOf((d) => d.remMin ?? 0);
    const light = avgOf((d) => d.lightMin ?? 0);
    const asleep = avgOf((d) => d.durationMin);
    return deep.map((b, i) => ({
      key: b.key,
      deep: round1((b.value ?? 0) / 60),
      rem: round1((rem[i].value ?? 0) / 60),
      light: round1((light[i].value ?? 0) / 60),
      asleep: round1((asleep[i].value ?? 0) / 60),
    }));
  }, [data, granularity, start, end]);
  const nights = data.length;
  const avgH = nights
    ? round1(data.reduce((s, d) => s + d.durationMin, 0) / nights / 60)
    : 0;
  const summary = nights
    ? `Sleep: ${avgH} hours per night on average over ${nights} nights.`
    : "No sleep data in range.";

  return (
    <ChartCard title={`Sleep${groupSuffix(granularity, "avg")}`}>
      {nights === 0 ? (
        <EmptyState>Connect a wearable to see your sleep.</EmptyState>
      ) : (
        <>
          <ChartFigure summary={summary}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chart} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => bucketLabel(granularity, String(v))}
                  stroke={AXIS}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis stroke={AXIS} fontSize={11} width={40} unit="h" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => bucketLabel(granularity, String(label))}
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
          </ChartFigure>
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

export function HeartRateChart({
  data,
  granularity = "day",
  start,
  end,
}: {
  data: RestingHrPoint[];
  granularity?: Granularity;
  start?: string;
  end?: string;
}) {
  const s = start ?? data[0]?.date ?? "";
  const e = end ?? data[data.length - 1]?.date ?? "";
  const rows = React.useMemo(
    () =>
      granularity === "day"
        ? data.map((d) => ({ key: d.date, bpm: d.restingBpm as number | null }))
        : bucketReduce(data, (d) => d.date, (d) => d.restingBpm, granularity, s, e, "avg").map((b) => ({
            key: b.key,
            bpm: b.value == null ? null : Math.round(b.value),
          })),
    [data, granularity, s, e],
  );
  const vals = rows.map((r) => r.bpm).filter((v): v is number => v != null);
  const lo = vals.length ? Math.floor(Math.min(...vals) - 3) : 0;
  const hi = vals.length ? Math.ceil(Math.max(...vals) + 3) : 1;
  const latest = [...vals].length ? vals[vals.length - 1] : null;
  const summary =
    latest != null ? `Resting heart rate: latest ${latest} bpm.` : "No resting heart rate in range.";
  return (
    <ChartCard title={`Resting heart rate${groupSuffix(granularity, "avg")}`}>
      {vals.length === 0 ? (
        <EmptyState>Connect a wearable to see resting HR.</EmptyState>
      ) : (
        <ChartFigure summary={summary}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={rows} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="key"
              tickFormatter={(v) => bucketLabel(granularity, String(v))}
              stroke={AXIS}
              fontSize={11}
              interval="preserveStartEnd"
            />
            <YAxis stroke={AXIS} fontSize={11} width={40} domain={[lo, hi]} allowDecimals={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label) => bucketLabel(granularity, String(label))}
              formatter={(v) => [`${v} bpm`, "Resting HR"]}
            />
            <Line
              type="monotone"
              dataKey="bpm"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={{ r: 2 }}
              connectNulls
              name="bpm"
            />
          </LineChart>
        </ResponsiveContainer>
        </ChartFigure>
      )}
    </ChartCard>
  );
}

/** Estimated VO₂max (Daniels) per qualifying run, shown as the best per bucket
 * so the long-term fitness trend is legible. */
export function Vo2maxChart({ data, granularity = "month" }: { data: Vo2Point[]; granularity?: Granularity }) {
  const rows = React.useMemo(() => {
    const byBucket = new Map<string, number>();
    for (const d of data) {
      const k = bucketKey(granularity, d.date);
      byBucket.set(k, Math.max(byBucket.get(k) ?? -Infinity, d.vo2max));
    }
    return [...byBucket.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => ({ key: k, vo2max: round1(v) }));
  }, [data, granularity]);
  const latest = rows[rows.length - 1]?.vo2max;
  const summary = latest
    ? `Estimated VO₂max around ${latest} ml/kg/min (best per ${groupNoun(granularity)} from your runs).`
    : "Run with distance + time logged to estimate VO₂max.";
  return (
    <ChartCard title={`VO₂max${groupSuffix(granularity, "best")}`}>
      {rows.length === 0 ? (
        <EmptyState>Log runs with distance &amp; time to estimate VO₂max.</EmptyState>
      ) : (
        <ChartFigure summary={summary}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rows} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="key"
                tickFormatter={(v) => bucketLabel(granularity, String(v))}
                stroke={AXIS}
                fontSize={11}
                interval="preserveStartEnd"
              />
              <YAxis stroke={AXIS} fontSize={11} width={40} domain={["dataMin - 2", "dataMax + 2"]} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label) => bucketLabel(granularity, String(label))}
                formatter={(v) => [`${v} ml/kg/min`, "VO₂max"]}
              />
              <Line type="monotone" dataKey="vo2max" stroke={ACTUAL_COLOR} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFigure>
      )}
      <p className="mt-1 text-xs text-muted-foreground">Daniels–Gilbert estimate — directional; affected by terrain &amp; pacing.</p>
    </ChartCard>
  );
}

const LOAD_ZONE: Record<Acwr["zone"], { label: string; cls: string }> = {
  low: { label: "Detraining", cls: "text-warn" },
  ok: { label: "Optimal", cls: "text-accent" },
  high: { label: "Spike — injury risk", cls: "text-danger" },
  none: { label: "—", cls: "text-muted-foreground" },
};

/** Training load (Σ duration × type-intensity) per bucket, with the current
 * acute:chronic workload ratio — a simple over/under-training signal. The bars
 * honour the page range via `cutoff`, but the ratio always reads from the full
 * session history (it needs the trailing 28 days regardless of the view). */
export function TrainingLoadChart({
  sessions,
  today,
  granularity = "week",
  cutoff,
}: {
  sessions: LoadSession[];
  today: string;
  granularity?: Granularity;
  /** Inclusive start date for the displayed bars; null = all-time. */
  cutoff?: string | null;
}) {
  const loads = React.useMemo(() => dailyLoad(sessions), [sessions]);
  const ratio = React.useMemo(() => acwr(loads, today), [loads, today]);
  const rows = React.useMemo(() => {
    const byBucket = new Map<string, number>();
    for (const [date, load] of loads) {
      if (cutoff != null && date < cutoff) continue;
      const k = bucketKey(granularity, date);
      byBucket.set(k, (byBucket.get(k) ?? 0) + load);
    }
    return [...byBucket.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => ({ key: k, load: Math.round(v) }));
  }, [loads, granularity, cutoff]);
  const zone = LOAD_ZONE[ratio.zone];
  return (
    <ChartCard title={`Training load${groupSuffix(granularity, "total")}`}>
      {rows.length === 0 ? (
        <EmptyState>Logged cardio &amp; hikes build your training-load trend here.</EmptyState>
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-2 text-sm">
            <span className="text-muted-foreground">Acute : chronic</span>
            <span className={cn("font-semibold tabular-nums", zone.cls)}>{ratio.ratio ?? "—"}</span>
            <span className={cn("text-xs", zone.cls)}>{zone.label}</span>
          </div>
          <ChartFigure summary={`Training load; acute-to-chronic ratio ${ratio.ratio ?? "n/a"} (${zone.label}).`}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={rows} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => bucketLabel(granularity, String(v))}
                  stroke={AXIS}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis stroke={AXIS} fontSize={11} width={40} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => bucketLabel(granularity, String(label))}
                  formatter={(v) => [`${v} load`, "Load"]}
                  cursor={{ fill: "var(--muted)" }}
                />
                <Bar dataKey="load" radius={[4, 4, 0, 0]} fill={ACTUAL_COLOR} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFigure>
          <p className="mt-1 text-xs text-muted-foreground">
            Load = duration × type intensity. Sweet spot 0.8–1.3; above ~1.5 is a spike.
          </p>
        </>
      )}
    </ChartCard>
  );
}
