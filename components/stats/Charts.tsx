"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, EmptyState } from "@/components/ui";
import { EXERCISE_LABELS, EXERCISES, MEALS, Meal } from "@/lib/constants";
import type { CaloriePoint, LiftPoint, WeightPoint } from "@/lib/stats-data";

const MEAL_INITIAL: Record<Meal, string> = {
  breakfast: "B",
  lunch: "L",
  dinner: "D",
  snacks: "S",
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

  // Cumulative meal budgets: where you should be after each meal.
  const cumulative: { meal: Meal; value: number }[] = [];
  let acc = 0;
  for (const m of MEALS) {
    acc += target * ((mealSplit[m] ?? 0) / 100);
    cumulative.push({ meal: m, value: Math.round(acc) });
  }

  // Keep the goal + ghost lines on-screen even on low-intake days.
  const dataMax = Math.max(0, ...data.map((d) => d.kcal));
  const yMax = Math.ceil(Math.max(dataMax, target) / 100) * 100;

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
              {/* faint cumulative meal-budget lines (after breakfast / lunch / dinner) */}
              {target > 0 &&
                cumulative.slice(0, 3).map((c) => (
                  <ReferenceLine
                    key={c.meal}
                    y={c.value}
                    stroke="var(--muted-foreground)"
                    strokeOpacity={0.35}
                    strokeDasharray="2 4"
                    label={{
                      value: MEAL_INITIAL[c.meal],
                      position: "left",
                      fontSize: 9,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                ))}
              {target > 0 && (
                <ReferenceLine
                  y={target}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{ value: "goal", position: "left", fontSize: 9, fill: "var(--muted-foreground)" }}
                />
              )}
              <Bar dataKey="kcal" fill="#22c55e" radius={[4, 4, 0, 0]} name="kcal" />
            </BarChart>
          </ResponsiveContainer>
          {target > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Ghost lines = cumulative budget after{" "}
              {cumulative
                .slice(0, 3)
                .map((c) => `${MEAL_INITIAL[c.meal]} ${c.value}`)
                .join(" · ")}{" "}
              · goal {target}
            </p>
          )}
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
