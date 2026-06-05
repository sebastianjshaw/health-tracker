"use client";

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
import type { CaloriePoint, LiftPoint, WeightPoint } from "@/lib/stats-data";

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
