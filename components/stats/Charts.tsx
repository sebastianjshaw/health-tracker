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
import { cn } from "@/lib/cn";
import { EXERCISE_LABELS, EXERCISES, Meal } from "@/lib/constants";
import { addDays } from "@/lib/date";
import type {
  CaloriePoint,
  DistancePoint,
  LiftPoint,
  RestingHrPoint,
  SleepPoint,
  WeightPoint,
} from "@/lib/stats-data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  goalWeight,
}: {
  data: WeightPoint[];
  goalWeight?: number | null;
}) {
  const goal = goalWeight ?? null;
  const values = data.map((d) => d.weight).concat(goal != null ? [goal] : []);
  const lo = values.length ? Math.floor(Math.min(...values) - 1) : 0;
  const hi = values.length ? Math.ceil(Math.max(...values) + 1) : 1;
  return (
    <ChartCard title="Weight">
      {data.length === 0 ? (
        <EmptyState>Log your weight to see the trend.</EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
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
            />
            {goal != null && (
              <ReferenceLine
                y={goal}
                stroke="var(--accent)"
                strokeDasharray="5 4"
                label={{ value: `goal ${goal}`, position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
              />
            )}
            <Line
              type="monotone"
              dataKey="weight"
              stroke="#22c55e"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              name="kg"
            />
          </LineChart>
        </ResponsiveContainer>
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
    const eff = target * fraction(d.meals);
    if (eff <= 0) return CAL_COLORS.none;
    if (d.kcal > eff * 1.1) return CAL_COLORS.over; // >10% over → red
    if (d.kcal >= eff * 0.9) return CAL_COLORS.near; // within ±10% → amber
    return CAL_COLORS.under; // comfortably under → green
  };

  return (
    <ChartCard title="Calories (last 14 days)">
      {!hasData ? (
        <EmptyState>No food logged yet.</EmptyState>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
              <YAxis stroke={AXIS} fontSize={11} width={40} domain={[0, yMax]} />
              <Tooltip
                contentStyle={tooltipStyle}
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
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Swatch color={CAL_COLORS.under} label="Under" />
            <Swatch color={CAL_COLORS.near} label="Within ±10%" />
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
  return (
    <ChartCard title="Lift progression (kg)">
      {data.length === 0 ? (
        <EmptyState>Complete a workout to see progress.</EmptyState>
      ) : (
        <>
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

type Period = "day" | "week" | "month" | "year";
const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];
const PERIOD_COUNT: Record<Period, number> = { day: 14, week: 12, month: 12, year: 5 };

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
}
function bucketKey(period: Period, date: string): string {
  if (period === "day") return date;
  if (period === "week") return mondayOf(date);
  if (period === "month") return date.slice(0, 7);
  return date.slice(0, 4);
}
function bucketLabel(period: Period, key: string): string {
  if (period === "day" || period === "week") {
    const [, m, d] = key.split("-");
    return `${d}/${m}`;
  }
  if (period === "month") {
    const [y, m] = key.split("-");
    return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
  }
  return key;
}
/** Ordered bucket keys for the window ending at `end` (oldest → newest). */
function bucketKeysEnding(period: Period, end: string): string[] {
  const n = PERIOD_COUNT[period];
  const keys: string[] = [];
  if (period === "day") {
    for (let i = n - 1; i >= 0; i--) keys.push(addDays(end, -i));
  } else if (period === "week") {
    const m = mondayOf(end);
    for (let i = n - 1; i >= 0; i--) keys.push(addDays(m, -i * 7));
  } else if (period === "month") {
    const [y, mo] = end.split("-").map(Number);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(y, mo - 1 - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  } else {
    const y = Number(end.slice(0, 4));
    for (let i = n - 1; i >= 0; i--) keys.push(String(y - i));
  }
  return keys;
}

export function DistanceChart({ data, end }: { data: DistancePoint[]; end: string }) {
  const [period, setPeriod] = React.useState<Period>("month");

  const { chart, total } = React.useMemo(() => {
    const keys = bucketKeysEnding(period, end);
    const sums = new Map<string, number>(keys.map((k) => [k, 0]));
    for (const p of data) {
      const k = bucketKey(period, p.date);
      if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + p.km);
    }
    return {
      chart: keys.map((k) => ({ label: bucketLabel(period, k), km: round1(sums.get(k) ?? 0) })),
      total: keys.reduce((s, k) => s + (sums.get(k) ?? 0), 0),
    };
  }, [data, end, period]);

  const windowLabel = period === "day" ? "14 days" : `${PERIOD_COUNT[period]} ${period}s`;
  const equiv = distanceEquivalent(total);

  return (
    <ChartCard title="Distance">
      <div className="mb-3 flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-sm",
              period === p.key
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <EmptyState>Log a cardio session with a distance to see this.</EmptyState>
      ) : (
        <>
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
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{round1(total)} km</span> over the last{" "}
            {windowLabel}
            {equiv && <> · {equiv}</>}
          </p>
        </>
      )}
    </ChartCard>
  );
}

// ---- Sleep ----

const SLEEP_COLORS = { deep: "#1e3a8a", rem: "#6366f1", light: "#93c5fd" };

export function SleepChart({ data }: { data: SleepPoint[] }) {
  const recent = data.slice(-14);
  const hasStages = recent.some(
    (d) => d.deepMin != null || d.remMin != null || d.lightMin != null,
  );
  const chart = recent.map((d) => ({
    date: d.date,
    deep: round1((d.deepMin ?? 0) / 60),
    rem: round1((d.remMin ?? 0) / 60),
    light: round1((d.lightMin ?? 0) / 60),
    asleep: round1(d.durationMin / 60),
  }));
  const avgH = data.length
    ? round1(data.reduce((s, d) => s + d.durationMin, 0) / data.length / 60)
    : 0;

  return (
    <ChartCard title="Sleep">
      {data.length === 0 ? (
        <EmptyState>Connect a wearable to see your sleep.</EmptyState>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chart} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
              <YAxis stroke={AXIS} fontSize={11} width={40} unit="h" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => shortDate(String(l))}
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
  return (
    <ChartCard title="Resting heart rate">
      {data.length === 0 ? (
        <EmptyState>Connect a wearable to see resting HR.</EmptyState>
      ) : (
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
      )}
    </ChartCard>
  );
}
