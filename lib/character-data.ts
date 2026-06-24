import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { bodyMetrics, foodLog } from "@/db/schema";
import { buildCharacter, type Character } from "./character";
import { addDays, todayISO } from "./date";
import { ageFrom, bmi } from "./health";
import { getCardioInRange, getRecentCardio } from "./activity-data";
import { getBloodPanels } from "./blood-data";
import {
  calorieSeriesRange,
  getCalorieSeries,
  getCardioDistances,
  getLiftProgression,
  getLiftSets,
  getRestingHrSeries,
  getSleepSeries,
  getWeightSeries,
} from "./stats-data";
import { latestBodyComposition, type BodyComposition } from "./metabolic-age";
import { liftStats, type LiftStat } from "./strength";
import { getLiftWeights, getProfile } from "./settings";

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : null);

/** Calendar years that have any data (weigh-ins or food), newest first, for the
 * character-sheet year picker. */
export async function getCharacterYears(): Promise<number[]> {
  const [w, f] = await Promise.all([
    db.select({ d: sql<string>`min(${bodyMetrics.date})` }).from(bodyMetrics).get(),
    db.select({ d: sql<string>`min(${foodLog.date})` }).from(foodLog).get(),
  ]);
  const earliest = [w?.d, f?.d].filter(Boolean).sort()[0];
  const startYear = earliest ? Number(earliest.slice(0, 4)) : Number(todayISO().slice(0, 4));
  const thisYear = Number(todayISO().slice(0, 4));
  const years: number[] = [];
  for (let y = thisYear; y >= startYear; y--) years.push(y);
  return years;
}

export type CharacterSheetData = {
  character: Character;
  name: string;
  bodyComp: BodyComposition | null;
  lifts: LiftStat[];
  year: number | null;
  years: number[];
};

/**
 * Build the character sheet. With no `year` it's the live snapshot (latest
 * weight + recent training/adherence windows). With a `year` it's that calendar
 * year's AVERAGE: mean weight/body-fat, that year's best big-three total, cardio
 * volume/pace over the year, and adherence/tracking across the year — so you can
 * see "who you were" in 2019. Domains with no data that year simply read low,
 * exactly as the live sheet degrades for missing data.
 */
export async function getCharacterSheet(opts?: { year?: number | null }): Promise<CharacterSheetData> {
  const today = todayISO();
  const year = opts?.year ?? null;
  const from = year != null ? `${year}-01-01` : null;
  const to = year != null ? (`${year}-12-31` < today ? `${year}-12-31` : today) : null;
  const scoped = year != null && from != null && to != null;

  const [
    profile,
    weights,
    liftWeights,
    liftProg,
    cardioDist,
    cardioForPace,
    restingHr,
    sleep,
    calories,
    panels,
    liftSetRows,
    years,
  ] = await Promise.all([
    getProfile(),
    scoped ? getWeightSeries(from!, to!) : getWeightSeries(),
    getLiftWeights(),
    getLiftProgression(),
    getCardioDistances(),
    scoped ? getCardioInRange(from!, to!) : getRecentCardio(50),
    getRestingHrSeries(),
    getSleepSeries(),
    scoped ? calorieSeriesRange(from!, to!) : getCalorieSeries(30),
    getBloodPanels(),
    getLiftSets(),
    getCharacterYears(),
  ]);

  const inWin = (d: string) => !scoped || (d >= from! && d <= to!);

  // ---- weight / body-fat ----
  const winWeights = weights.filter((w) => inWin(w.date));
  let weightKg: number | null;
  let bodyFatPct: number | null = null;
  if (scoped) {
    weightKg = mean(winWeights.map((w) => w.weight));
    if (weightKg != null) weightKg = r1(weightKg);
    bodyFatPct = mean(winWeights.filter((w) => w.bodyFat != null).map((w) => w.bodyFat as number));
    if (bodyFatPct != null) bodyFatPct = r1(bodyFatPct);
  } else {
    weightKg = weights.length ? weights[weights.length - 1].weight : null;
    for (let i = weights.length - 1; i >= 0; i--) {
      if (weights[i].bodyFat != null) {
        bodyFatPct = weights[i].bodyFat;
        break;
      }
    }
  }
  const bmiVal = weightKg != null ? bmi(weightKg, profile.heightCm) : null;

  // ---- strength: big-three total ----
  // Live view uses the current program targets; a year uses that year's best
  // working weight per lift from the progression.
  let liftTotalKg: number;
  if (scoped) {
    const best = (ex: "squat" | "bench" | "deadlift") =>
      liftProg.filter((p) => inWin(p.date)).reduce((m, p) => Math.max(m, p[ex] ?? 0), 0);
    liftTotalKg = best("squat") + best("bench") + best("deadlift");
  } else {
    liftTotalKg = (liftWeights.squat ?? 0) + (liftWeights.bench ?? 0) + (liftWeights.deadlift ?? 0);
  }

  // ---- cardio volume + best run pace ----
  let weeklyKm: number | null;
  if (scoped) {
    const km = cardioDist.filter((c) => inWin(c.date)).reduce((s, c) => s + c.km, 0);
    const weeks = Math.max(1, (Date.parse(to!) - Date.parse(from!)) / (7 * 864e5));
    weeklyKm = km > 0 ? r1(km / weeks) : null;
  } else {
    const cutoff = addDays(today, -27);
    const recentKm = cardioDist.filter((c) => c.date >= cutoff).reduce((s, c) => s + c.km, 0);
    weeklyKm = cardioDist.some((c) => c.date >= cutoff) ? r1(recentKm / 4) : null;
  }

  let bestRunPace: number | null = null;
  for (const c of cardioForPace) {
    if (c.type === "run" && c.distanceKm && c.distanceKm > 0 && c.durationMin && c.durationMin > 0) {
      const pace = c.durationMin / c.distanceKm;
      if (bestRunPace == null || pace < bestRunPace) bestRunPace = pace;
    }
  }
  if (bestRunPace != null) bestRunPace = r1(bestRunPace);

  // ---- resting HR + sleep ----
  const winHr = restingHr.filter((h) => inWin(h.date));
  const restingBpm = scoped
    ? winHr.length
      ? Math.round(mean(winHr.map((h) => h.restingBpm)) as number)
      : null
    : restingHr.length
      ? restingHr[restingHr.length - 1].restingBpm
      : null;

  const winSleep = scoped ? sleep.filter((s) => inWin(s.date)) : sleep.slice(-30);
  const avgSleepH = winSleep.length
    ? r1(winSleep.reduce((s, n) => s + n.durationMin, 0) / winSleep.length / 60)
    : null;

  // ---- adherence + tracking (over the calorie window) ----
  const logged = calories.filter((c) => c.kcal > 0);
  const calorieAdherencePct = logged.length
    ? r1((logged.filter((c) => c.kcal <= c.targetKcal).length / logged.length) * 100)
    : null;
  const proteinAdherencePct = logged.length
    ? r1((logged.filter((c) => c.protein >= c.targetProtein).length / logged.length) * 100)
    : null;
  // Live: vs a 30-day window. Year: logged days / days elapsed in the window.
  const windowDays = scoped
    ? Math.max(1, Math.round((Date.parse(to!) - Date.parse(from!)) / 864e5) + 1)
    : 30;
  const trackingPct = r1(Math.min(100, (logged.length / windowDays) * 100));

  const winLiftProg = liftProg.filter((p) => inWin(p.date));
  const winCardioDist = cardioDist.filter((c) => inWin(c.date));
  const domainsCovered = [
    winWeights.length > 0,
    winLiftProg.length > 0,
    winCardioDist.length > 0,
    winSleep.length > 0,
    winHr.length > 0,
    panels.filter((p) => inWin(p.date)).length > 0,
  ].filter(Boolean).length;

  const character = buildCharacter({
    sex: profile.sex,
    age: profile.dob ? ageFrom(profile.dob) : null,
    heightCm: profile.heightCm,
    weightKg,
    bmi: bmiVal,
    bodyFatPct,
    liftTotalKg,
    restingHr: restingBpm,
    avgSleepH,
    weeklyKm,
    bestRunPace,
    calorieAdherencePct,
    proteinAdherencePct,
    trackingPct,
    domainsCovered,
    workoutCount: winLiftProg.length,
    cardioCount: winCardioDist.length,
    bloodPanels: panels.filter((p) => inWin(p.date)).length,
  });

  // Body composition: the year's representative reading (latest in-window that
  // has both weight + body-fat), else the live latest.
  const compRows = (scoped ? winWeights : weights);
  const bodyComp = latestBodyComposition(
    [...compRows]
      .reverse()
      .map((w) => ({ date: w.date, weightKg: w.weight, bodyFatPct: w.bodyFat, leanMassKg: w.leanMass })),
    { heightCm: profile.heightCm, sex: profile.sex },
  );
  const liftPRs = liftStats(liftSetRows).slice(0, 5);

  return { character, name: profile.name?.trim() || "Adventurer", bodyComp, lifts: liftPRs, year, years };
}
