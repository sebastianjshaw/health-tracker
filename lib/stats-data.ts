import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyMetrics,
  foodLog,
  foods,
  liftSessions,
  liftSets,
  recurringFoods,
  recurringRemovals,
} from "@/db/schema";
import { Exercise, Schedule } from "./constants";
import { addDays, schedulesFor, todayISO } from "./date";

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

/**
 * Daily consumed totals (logged + applicable recurring − removals) for the last
 * N days. Uses three range queries (logged entries, recurring templates,
 * removals) and merges in JS, rather than querying each day separately.
 */
export async function getCalorieSeries(days = 14): Promise<CaloriePoint[]> {
  const today = todayISO();
  return calorieSeriesRange(addDays(today, -(days - 1)), today);
}

/** Daily consumed totals merged for an inclusive [start, end] date range. */
export async function calorieSeriesRange(
  start: string,
  end: string,
): Promise<CaloriePoint[]> {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

  const [logged, recurring, removals] = await Promise.all([
    db
      .select({
        date: foodLog.date,
        quantity: foodLog.quantity,
        kcal: foodLog.kcal,
        protein: foodLog.protein,
      })
      .from(foodLog)
      .where(and(gte(foodLog.date, start), lte(foodLog.date, end)))
      .all(),
    db
      .select({
        id: recurringFoods.id,
        schedule: recurringFoods.schedule,
        quantity: recurringFoods.quantity,
        kcal: foods.kcal,
        protein: foods.protein,
      })
      .from(recurringFoods)
      .innerJoin(foods, eq(recurringFoods.foodId, foods.id))
      .all(),
    db
      .select({
        date: recurringRemovals.date,
        recurringId: recurringRemovals.recurringId,
      })
      .from(recurringRemovals)
      .where(and(gte(recurringRemovals.date, start), lte(recurringRemovals.date, end)))
      .all(),
  ]);

  const loggedByDate = new Map<string, { kcal: number; protein: number }>();
  for (const r of logged) {
    const acc = loggedByDate.get(r.date) ?? { kcal: 0, protein: 0 };
    acc.kcal += r.kcal * r.quantity;
    acc.protein += r.protein * r.quantity;
    loggedByDate.set(r.date, acc);
  }

  const removedByDate = new Map<string, Set<number>>();
  for (const r of removals) {
    const set = removedByDate.get(r.date) ?? new Set<number>();
    set.add(r.recurringId);
    removedByDate.set(r.date, set);
  }

  return dates.map((date) => {
    let kcal = 0;
    let protein = 0;

    const l = loggedByDate.get(date);
    if (l) {
      kcal += l.kcal;
      protein += l.protein;
    }

    const schedules = schedulesFor(date);
    const removed = removedByDate.get(date);
    for (const rec of recurring) {
      if (!schedules.includes(rec.schedule as Schedule)) continue;
      if (removed?.has(rec.id)) continue;
      kcal += rec.kcal * rec.quantity;
      protein += rec.protein * rec.quantity;
    }

    return { date, kcal: Math.round(kcal), protein: Math.round(protein) };
  });
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
    .where(
      inArray(
        liftSets.sessionId,
        sessions.map((s) => s.id),
      ),
    )
    .all();

  const bySession = new Map<number, typeof sets>();
  for (const st of sets) {
    const arr = bySession.get(st.sessionId);
    if (arr) arr.push(st);
    else bySession.set(st.sessionId, [st]);
  }

  return sessions.map((s) => {
    const point: LiftPoint = { date: s.date };
    for (const st of bySession.get(s.id) ?? []) {
      const ex = st.exercise as Exercise;
      point[ex] = Math.max(point[ex] ?? 0, st.targetWeightKg);
    }
    return point;
  });
}
