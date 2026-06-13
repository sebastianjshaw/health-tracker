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
import { ageFrom } from "./health";
import { materializeRecurringRange } from "./recurring-materialize";
import { getContingency, getProfile, getTargetHistory } from "./settings";
import { targetForDate } from "./targets";
import { predictWeights, type WeightPrediction } from "./weight-prediction";

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

export type { WeightPrediction } from "./weight-prediction";

/**
 * Per-weigh-in predicted weight from energy balance (contingency-adjusted
 * intake minus BMR-baseline maintenance plus logged cardio), so expected can be
 * compared against actual. Empty if the profile can't yield a BMR or there are
 * fewer than two weigh-ins.
 */
export async function getWeightPredictions(): Promise<WeightPrediction[]> {
  const weighIns = await getWeightSeries(); // ascending, weight present
  if (weighIns.length < 2) return [];

  const start = weighIns[0].date;
  const end = weighIns[weighIns.length - 1].date;

  const [series, cardio, profile] = await Promise.all([
    calorieSeriesRange(start, end), // contingency-adjusted intake per day
    db
      .select({ date: cardioSessions.date, kcal: cardioSessions.kcal })
      .from(cardioSessions)
      .where(and(gte(cardioSessions.date, start), lte(cardioSessions.date, end)))
      .all(),
    getProfile(),
  ]);

  const intakeByDate = new Map(series.map((c) => [c.date, c.kcal]));
  const cardioByDate = new Map<string, number>();
  for (const c of cardio) {
    if (c.kcal == null) continue;
    cardioByDate.set(c.date, (cardioByDate.get(c.date) ?? 0) + c.kcal);
  }

  return predictWeights({
    weighIns,
    intakeByDate,
    cardioByDate,
    heightCm: profile.heightCm,
    age: ageFrom(profile.dob),
    sex: profile.sex,
  });
}

export type CaloriePoint = {
  date: string;
  kcal: number;
  protein: number;
  /** Daily fiber / saturated-fat totals (only present on rows logged since the
   * snapshot columns were added; older days read as 0). */
  fiber: number;
  satFat: number;
  /** Meals that have at least one entry that day (drives the proportional target). */
  meals: Meal[];
  /** Target that was in effect on this date (so past days aren't re-judged). */
  targetKcal: number;
  targetProtein: number;
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
  const targetHistory = await getTargetHistory();

  const logged = await db
    .select({
      date: foodLog.date,
      meal: foodLog.meal,
      quantity: foodLog.quantity,
      kcal: foodLog.kcal,
      protein: foodLog.protein,
      fiber: foodLog.fiber,
      saturatedFat: foodLog.saturatedFat,
      evolution: foodLog.evolution,
    })
    .from(foodLog)
    .where(and(gte(foodLog.date, start), lte(foodLog.date, end)))
    .all();

  const loggedByDate = new Map<
    string,
    { kcal: number; protein: number; fiber: number; satFat: number }
  >();
  const mealsByDate = new Map<string, Set<Meal>>();
  for (const r of logged) {
    const acc = loggedByDate.get(r.date) ?? { kcal: 0, protein: 0, fiber: 0, satFat: 0 };
    acc.kcal += r.kcal * r.quantity * contingencyMultiplier(r.evolution, contingency);
    acc.protein += r.protein * r.quantity;
    acc.fiber += (r.fiber ?? 0) * r.quantity;
    acc.satFat += (r.saturatedFat ?? 0) * r.quantity;
    loggedByDate.set(r.date, acc);
    const ms = mealsByDate.get(r.date) ?? new Set<Meal>();
    ms.add(r.meal as Meal);
    mealsByDate.set(r.date, ms);
  }

  return dates.map((date) => {
    const l = loggedByDate.get(date);
    const t = targetForDate(targetHistory, date);
    return {
      date,
      kcal: Math.round(l?.kcal ?? 0),
      protein: Math.round(l?.protein ?? 0),
      fiber: Math.round(l?.fiber ?? 0),
      satFat: Math.round(l?.satFat ?? 0),
      meals: [...(mealsByDate.get(date) ?? [])],
      targetKcal: t.kcal,
      targetProtein: t.protein,
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
