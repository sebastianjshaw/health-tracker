import "server-only";
import { and, asc, desc, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyMetrics,
  cardioSessions,
  foodLog,
  heartRateDaily,
  liftSessions,
  liftSets,
  sleepSessions,
} from "@/db/schema";
import { Exercise, Meal, contingencyMultiplier } from "./constants";
import { addDays, todayISO } from "./date";
import { materializeRecurringRange } from "./recurring-materialize";
import { getContingency } from "./settings";

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

export type CaloriePoint = {
  date: string;
  kcal: number;
  protein: number;
  /** Meals that have at least one entry that day (drives the proportional target). */
  meals: Meal[];
};

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

  await materializeRecurringRange(db, start, end);
  const contingency = await getContingency();

  const logged = await db
    .select({
      date: foodLog.date,
      meal: foodLog.meal,
      quantity: foodLog.quantity,
      kcal: foodLog.kcal,
      protein: foodLog.protein,
      evolution: foodLog.evolution,
    })
    .from(foodLog)
    .where(and(gte(foodLog.date, start), lte(foodLog.date, end)))
    .all();

  const loggedByDate = new Map<string, { kcal: number; protein: number }>();
  const mealsByDate = new Map<string, Set<Meal>>();
  for (const r of logged) {
    const acc = loggedByDate.get(r.date) ?? { kcal: 0, protein: 0 };
    acc.kcal += r.kcal * r.quantity * contingencyMultiplier(r.evolution, contingency);
    acc.protein += r.protein * r.quantity;
    loggedByDate.set(r.date, acc);
    const ms = mealsByDate.get(r.date) ?? new Set<Meal>();
    ms.add(r.meal as Meal);
    mealsByDate.set(r.date, ms);
  }

  return dates.map((date) => {
    const l = loggedByDate.get(date);
    return {
      date,
      kcal: Math.round(l?.kcal ?? 0),
      protein: Math.round(l?.protein ?? 0),
      meals: [...(mealsByDate.get(date) ?? [])],
    };
  });
}

export type DistancePoint = { date: string; km: number };

/** All cardio sessions that recorded a distance, oldest first. */
export async function getCardioDistances(): Promise<DistancePoint[]> {
  const rows = await db
    .select({ date: cardioSessions.date, km: cardioSessions.distanceKm })
    .from(cardioSessions)
    .where(isNotNull(cardioSessions.distanceKm))
    .orderBy(asc(cardioSessions.date))
    .all();
  return rows.map((r) => ({ date: r.date, km: r.km as number }));
}

export type RestingHrPoint = { date: string; restingBpm: number };

/** Daily resting heart rate (where recorded), oldest first. */
export async function getRestingHrSeries(): Promise<RestingHrPoint[]> {
  const rows = await db
    .select({ date: heartRateDaily.date, bpm: heartRateDaily.restingBpm })
    .from(heartRateDaily)
    .where(isNotNull(heartRateDaily.restingBpm))
    .orderBy(asc(heartRateDaily.date))
    .all();
  return rows.map((r) => ({ date: r.date, restingBpm: r.bpm as number }));
}

export type SleepPoint = {
  date: string;
  durationMin: number;
  deepMin: number | null;
  remMin: number | null;
  lightMin: number | null;
  awakeMin: number | null;
};

/** Nightly sleep sessions, oldest first. */
export async function getSleepSeries(): Promise<SleepPoint[]> {
  const rows = await db
    .select()
    .from(sleepSessions)
    .orderBy(asc(sleepSessions.date))
    .all();
  return rows.map((r) => ({
    date: r.date,
    durationMin: r.durationMin,
    deepMin: r.deepMin,
    remMin: r.remMin,
    lightMin: r.lightMin,
    awakeMin: r.awakeMin,
  }));
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
