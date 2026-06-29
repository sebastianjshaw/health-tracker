import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyMetrics,
  cardioSessions,
  dailyActivity,
  dailyHealthMetrics,
  foodLog,
  foods,
  heartRateDaily,
  liftSessions,
  liftSets,
  recurringFoods,
  sleepSessions,
} from "@/db/schema";
import { Exercise, Meal, contingencyMultiplier } from "./constants";
import { vo2maxFromRun, type LoadSession } from "./fitness";
import { addDays, todayISO } from "./date";
import { ageFrom } from "./health";
import { estimateWaterMl, waterSourceOf } from "./hydration";
import { netPassiveKm, passiveWalkKcal } from "./passive-activity";
import { materializeRecurringRange } from "./recurring-materialize";
import { getContingency, getProfile, getTargetHistory } from "./settings";
import { targetForDate } from "./targets";
import { predictWeights, type WeightPrediction } from "./weight-prediction";

/** All body-metric rows, newest-first. Optionally bounded to an inclusive
 * [from, to] date range (so the report only loads its window). */
export async function getBodyMetrics(from?: string, to?: string) {
  const conds = [
    from ? gte(bodyMetrics.date, from) : undefined,
    to ? lte(bodyMetrics.date, to) : undefined,
  ].filter((c) => c != null);
  return db
    .select()
    .from(bodyMetrics)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(bodyMetrics.date), desc(bodyMetrics.id))
    .all();
}

/** Every logged set as { date, exercise, weightKg, reps } — for 1RM/tonnage/PRs. */
export async function getLiftSets(): Promise<
  { date: string; exercise: string; weightKg: number; reps: number | null }[]
> {
  const rows = await db
    .select({
      date: liftSessions.date,
      exercise: liftSets.exercise,
      weightKg: liftSets.targetWeightKg,
      reps: liftSets.repsDone,
    })
    .from(liftSets)
    .innerJoin(liftSessions, eq(liftSets.sessionId, liftSessions.id))
    .all();
  return rows;
}

export type WeightPoint = {
  date: string;
  weight: number;
  bodyFat: number | null;
  /** Scale-measured fat-free mass (kg), when available — preferred over the
   * derived weight×(1−bf) estimate. Null/absent for manual/legacy entries and
   * series built without it (e.g. the report's summarised weights). */
  leanMass?: number | null;
  /** Scale-measured bone mass (kg), when available — used to split fat-free mass
   * into lean (soft) + bone for the composition chart. */
  boneMass?: number | null;
};

/** Weigh-ins ascending. Optionally bounded to an inclusive [from, to] range. */
export async function getWeightSeries(from?: string, to?: string): Promise<WeightPoint[]> {
  const conds = [
    isNotNull(bodyMetrics.weightKg),
    from ? gte(bodyMetrics.date, from) : undefined,
    to ? lte(bodyMetrics.date, to) : undefined,
  ].filter((c) => c != null);
  const rows = await db
    .select()
    .from(bodyMetrics)
    .where(and(...conds))
    .orderBy(asc(bodyMetrics.date))
    .all();
  return rows.map((r) => ({
    date: r.date,
    weight: r.weightKg as number,
    bodyFat: r.bodyFatPct ?? null,
    leanMass: r.leanMassKg ?? null,
    boneMass: r.boneMassKg ?? null,
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

  const [series, cardio, activity, profile] = await Promise.all([
    calorieSeriesRange(start, end), // contingency-adjusted intake per day
    db
      .select({
        date: cardioSessions.date,
        kcal: cardioSessions.kcal,
        distanceKm: cardioSessions.distanceKm,
      })
      .from(cardioSessions)
      .where(and(gte(cardioSessions.date, start), lte(cardioSessions.date, end)))
      .all(),
    db
      .select({ date: dailyActivity.date, distanceKm: dailyActivity.distanceKm })
      .from(dailyActivity)
      .where(and(gte(dailyActivity.date, start), lte(dailyActivity.date, end)))
      .all(),
    getProfile(),
  ]);

  const intakeByDate = new Map(series.map((c) => [c.date, c.kcal]));
  const cardioByDate = new Map<string, number>();
  const sessionDistByDate = new Map<string, number>();
  for (const c of cardio) {
    if (c.kcal != null) cardioByDate.set(c.date, (cardioByDate.get(c.date) ?? 0) + c.kcal);
    if (c.distanceKm != null)
      sessionDistByDate.set(c.date, (sessionDistByDate.get(c.date) ?? 0) + c.distanceKm);
  }

  // Passive walking adds to burn, but only the distance NOT already covered by a
  // logged session that day, so it isn't double-counted against the sessions.
  const latestWeight = weighIns[weighIns.length - 1]?.weight ?? null;
  for (const a of activity) {
    const net = netPassiveKm(a.distanceKm ?? 0, sessionDistByDate.get(a.date) ?? 0);
    const kcal = passiveWalkKcal(net, latestWeight);
    if (kcal > 0) cardioByDate.set(a.date, (cardioByDate.get(a.date) ?? 0) + kcal);
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

export type ActivityPoint = { date: string; steps: number; distanceKm: number };

/** Passive daily movement (steps + distance) imported from the provider, oldest first. */
export async function getDailyActivity(): Promise<ActivityPoint[]> {
  const rows = await db.select().from(dailyActivity).orderBy(asc(dailyActivity.date)).all();
  return rows.map((r) => ({
    date: r.date,
    steps: r.steps ?? 0,
    distanceKm: r.distanceKm ?? 0,
  }));
}

export type CaloriePoint = {
  date: string;
  kcal: number;
  protein: number;
  /** Daily fiber / saturated-fat totals (only present on rows logged since the
   * snapshot columns were added; older days read as 0). */
  fiber: number;
  /** Portion of `fiber` that was AI-estimated (foods logged without fiber data). */
  fiberEstimated: number;
  satFat: number;
  /** Estimated water intake (mL) from food + drink, total and by source. */
  water: number;
  waterWater: number;
  waterDrink: number;
  waterFood: number;
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

/** Daily consumed totals across the entire logged history (earliest food-log day
 * → today), so the stats charts can show years of imported history. Falls back
 * to a short window when nothing is logged. */
export async function getCalorieSeriesAll(): Promise<CaloriePoint[]> {
  const today = todayISO();
  const earliest = (await db.select({ d: sql<string>`min(${foodLog.date})` }).from(foodLog).get())?.d;
  return calorieSeriesRange(earliest && earliest < today ? earliest : addDays(today, -13), today);
}

/** Daily consumed totals merged for an inclusive [start, end] date range. */
export async function calorieSeriesRange(
  start: string,
  end: string,
): Promise<CaloriePoint[]> {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

  // Recurring defaults only exist from their startDate (recent), and
  // materialising writes a row per applicable day — so bound it to the window
  // where templates can apply. Over a multi-year range this avoids building a
  // huge IN(...) for dates that could never have a recurring row anyway.
  const recStart = (
    await db.select({ d: sql<string>`min(${recurringFoods.startDate})` }).from(recurringFoods).get()
  )?.d;
  if (recStart) {
    const matStart = recStart > start ? recStart : start;
    if (matStart <= end) await materializeRecurringRange(db, matStart, end);
  }
  const contingency = await getContingency();
  const targetHistory = await getTargetHistory();

  const logged = await db
    .select({
      date: foodLog.date,
      meal: foodLog.meal,
      quantity: foodLog.quantity,
      name: foodLog.name,
      kcal: foodLog.kcal,
      protein: foodLog.protein,
      carbs: foodLog.carbs,
      fat: foodLog.fat,
      fiber: foodLog.fiber,
      fiberEstimated: foodLog.fiberEstimated,
      saturatedFat: foodLog.saturatedFat,
      servingSize: foodLog.servingSize,
      servingUnit: foodLog.servingUnit,
      evolution: foodLog.evolution,
      category: foods.category,
    })
    .from(foodLog)
    .leftJoin(foods, eq(foodLog.foodId, foods.id))
    .where(and(gte(foodLog.date, start), lte(foodLog.date, end)))
    .all();

  const loggedByDate = new Map<
    string,
    {
      kcal: number;
      protein: number;
      fiber: number;
      fiberEstimated: number;
      satFat: number;
      waterWater: number;
      waterDrink: number;
      waterFood: number;
    }
  >();
  const mealsByDate = new Map<string, Set<Meal>>();
  for (const r of logged) {
    const acc =
      loggedByDate.get(r.date) ??
      { kcal: 0, protein: 0, fiber: 0, fiberEstimated: 0, satFat: 0, waterWater: 0, waterDrink: 0, waterFood: 0 };
    acc.kcal += r.kcal * r.quantity * contingencyMultiplier(r.evolution, contingency);
    acc.protein += r.protein * r.quantity;
    const fiberG = (r.fiber ?? 0) * r.quantity;
    acc.fiber += fiberG;
    if (r.fiberEstimated) acc.fiberEstimated += fiberG;
    acc.satFat += (r.saturatedFat ?? 0) * r.quantity;
    const we = {
      servingSize: r.servingSize,
      servingUnit: r.servingUnit,
      quantity: r.quantity,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      category: r.category,
      name: r.name,
    };
    const ml = estimateWaterMl(we);
    const src = waterSourceOf(we);
    if (src === "water") acc.waterWater += ml;
    else if (src === "drink") acc.waterDrink += ml;
    else acc.waterFood += ml;
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
      fiberEstimated: Math.round(l?.fiberEstimated ?? 0),
      satFat: Math.round(l?.satFat ?? 0),
      water: Math.round((l?.waterWater ?? 0) + (l?.waterDrink ?? 0) + (l?.waterFood ?? 0)),
      waterWater: Math.round(l?.waterWater ?? 0),
      waterDrink: Math.round(l?.waterDrink ?? 0),
      waterFood: Math.round(l?.waterFood ?? 0),
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

export type RecoveryPoint = {
  date: string;
  hrvMs: number | null;
  spo2: number | null;
  spo2Min: number | null;
  restingBpm: number | null;
};

/** Daily recovery metrics (HRV, SpO₂) joined with resting HR, oldest first. */
export async function getRecoverySeries(): Promise<RecoveryPoint[]> {
  const [metrics, hr] = await Promise.all([
    db
      .select({ date: dailyHealthMetrics.date, hrvMs: dailyHealthMetrics.hrvMs, spo2: dailyHealthMetrics.spo2, spo2Min: dailyHealthMetrics.spo2Min })
      .from(dailyHealthMetrics)
      .orderBy(asc(dailyHealthMetrics.date))
      .all(),
    db
      .select({ date: heartRateDaily.date, bpm: heartRateDaily.restingBpm })
      .from(heartRateDaily)
      .where(isNotNull(heartRateDaily.restingBpm))
      .all(),
  ]);
  const rhrByDate = new Map(hr.map((r) => [r.date, r.bpm as number]));
  return metrics.map((m) => ({
    date: m.date,
    hrvMs: m.hrvMs,
    spo2: m.spo2,
    spo2Min: m.spo2Min,
    restingBpm: rhrByDate.get(m.date) ?? null,
  }));
}

export type Vo2Point = { date: string; vo2max: number };

/** VO₂max estimate per qualifying run (≥3 km, ≥10 min), oldest first. */
export async function getRunVo2maxSeries(): Promise<Vo2Point[]> {
  const rows = await db
    .select({ date: cardioSessions.date, km: cardioSessions.distanceKm, min: cardioSessions.durationMin })
    .from(cardioSessions)
    .where(and(eq(cardioSessions.type, "run"), isNotNull(cardioSessions.distanceKm), isNotNull(cardioSessions.durationMin)))
    .orderBy(asc(cardioSessions.date))
    .all();
  const out: Vo2Point[] = [];
  for (const r of rows) {
    const km = r.km as number;
    const min = r.min as number;
    if (km < 3 || min < 10) continue;
    const v = vo2maxFromRun(km, min);
    if (v != null) out.push({ date: r.date, vo2max: v });
  }
  return out;
}

/** All cardio sessions reduced to {date, type, durationMin} for load/ACWR. */
export async function getCardioLoadSessions(): Promise<LoadSession[]> {
  return db
    .select({ date: cardioSessions.date, type: cardioSessions.type, durationMin: cardioSessions.durationMin })
    .from(cardioSessions)
    .where(isNotNull(cardioSessions.durationMin))
    .orderBy(asc(cardioSessions.date))
    .all();
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
