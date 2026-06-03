import "server-only";
import { asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { bodyMetrics, liftSessions, liftSets } from "@/db/schema";
import { Exercise } from "./constants";
import { addDays, todayISO } from "./date";
import { getDayEntries } from "./food-data";
import { totals } from "./nutrition";

export async function getBodyMetrics() {
  return db
    .select()
    .from(bodyMetrics)
    .orderBy(desc(bodyMetrics.date), desc(bodyMetrics.id))
    .all();
}

export type WeightPoint = { date: string; weight: number; bodyFat: number | null };

export async function getWeightSeries(): Promise<WeightPoint[]> {
  const rows = await db
    .select()
    .from(bodyMetrics)
    .where(isNotNull(bodyMetrics.weightKg))
    .orderBy(asc(bodyMetrics.date))
    .all();
  return rows.map((r) => ({
    date: r.date,
    weight: r.weightKg as number,
    bodyFat: r.bodyFatPct ?? null,
  }));
}

export type CaloriePoint = { date: string; kcal: number; protein: number };

/** Daily consumed totals (logged + applicable recurring − removals) for last N days. */
export async function getCalorieSeries(days = 14): Promise<CaloriePoint[]> {
  const today = todayISO();
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -(days - 1 - i)));
  const series = await Promise.all(
    dates.map(async (date) => {
      const t = totals(await getDayEntries(date));
      return { date, kcal: Math.round(t.kcal), protein: Math.round(t.protein) };
    }),
  );
  return series;
}

export type LiftPoint = { date: string } & Partial<Record<Exercise, number>>;

/** Per-session top working weight for each exercise, oldest first. */
export async function getLiftProgression(): Promise<LiftPoint[]> {
  const sessions = await db
    .select()
    .from(liftSessions)
    .orderBy(asc(liftSessions.date), asc(liftSessions.id))
    .all();
  if (sessions.length === 0) return [];

  const sets = await db
    .select()
    .from(liftSets)
    .where(inArray(liftSets.sessionId, sessions.map((s) => s.id)))
    .all();

  return sessions.map((s) => {
    const point: LiftPoint = { date: s.date };
    for (const st of sets.filter((x) => x.sessionId === s.id)) {
      const ex = st.exercise as Exercise;
      point[ex] = Math.max(point[ex] ?? 0, st.targetWeightKg);
    }
    return point;
  });
}
