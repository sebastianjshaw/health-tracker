import "server-only";
import { buildCharacter, type Character } from "./character";
import { addDays, todayISO } from "./date";
import { ageFrom, bmi } from "./health";
import { getRecentCardio } from "./activity-data";
import { getBloodPanels } from "./blood-data";
import {
  getCalorieSeries,
  getCardioDistances,
  getLiftProgression,
  getRestingHrSeries,
  getSleepSeries,
  getWeightSeries,
} from "./stats-data";
import { getLiftWeights, getProfile } from "./settings";

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function getCharacterSheet(): Promise<{ character: Character; name: string }> {
  const today = todayISO();
  const [
    profile,
    weights,
    lifts,
    liftSessions,
    cardioDist,
    recentCardio,
    restingHr,
    sleep,
    calories,
    panels,
  ] = await Promise.all([
    getProfile(),
    getWeightSeries(),
    getLiftWeights(),
    getLiftProgression(),
    getCardioDistances(),
    getRecentCardio(50),
    getRestingHrSeries(),
    getSleepSeries(),
    getCalorieSeries(30),
    getBloodPanels(),
  ]);

  const weightKg = weights.length ? weights[weights.length - 1].weight : null;
  const bmiVal = weightKg != null ? bmi(weightKg, profile.heightCm) : null;
  const liftTotalKg = (lifts.squat ?? 0) + (lifts.bench ?? 0) + (lifts.deadlift ?? 0);

  // recent cardio volume (last 28 days) → per-week km
  const cutoff = addDays(today, -27);
  const recentKm = cardioDist.filter((c) => c.date >= cutoff).reduce((s, c) => s + c.km, 0);
  const weeklyKm = cardioDist.some((c) => c.date >= cutoff) ? r1(recentKm / 4) : null;

  // best running pace (min/km) from recent runs
  let bestRunPace: number | null = null;
  for (const c of recentCardio) {
    if (c.type === "run" && c.distanceKm && c.distanceKm > 0 && c.durationMin && c.durationMin > 0) {
      const pace = c.durationMin / c.distanceKm;
      if (bestRunPace == null || pace < bestRunPace) bestRunPace = pace;
    }
  }
  if (bestRunPace != null) bestRunPace = r1(bestRunPace);

  const restingBpm = restingHr.length ? restingHr[restingHr.length - 1].restingBpm : null;

  const recentSleep = sleep.slice(-30);
  const avgSleepH = recentSleep.length
    ? r1(recentSleep.reduce((s, n) => s + n.durationMin, 0) / recentSleep.length / 60)
    : null;

  // adherence + tracking over the 30-day calorie window
  const logged = calories.filter((c) => c.kcal > 0);
  const calorieAdherencePct = logged.length
    ? r1((logged.filter((c) => c.kcal <= c.targetKcal).length / logged.length) * 100)
    : null;
  const proteinAdherencePct = logged.length
    ? r1((logged.filter((c) => c.protein >= c.targetProtein).length / logged.length) * 100)
    : null;
  const trackingPct = r1(Math.min(100, (logged.length / 30) * 100));

  const domainsCovered = [
    weights.length > 0,
    liftSessions.length > 0,
    cardioDist.length > 0,
    sleep.length > 0,
    restingHr.length > 0,
    panels.length > 0,
  ].filter(Boolean).length;

  const character = buildCharacter({
    sex: profile.sex,
    age: profile.dob ? ageFrom(profile.dob) : null,
    heightCm: profile.heightCm,
    weightKg,
    bmi: bmiVal,
    liftTotalKg,
    restingHr: restingBpm,
    avgSleepH,
    weeklyKm,
    bestRunPace,
    calorieAdherencePct,
    proteinAdherencePct,
    trackingPct,
    domainsCovered,
    workoutCount: liftSessions.length,
    cardioCount: cardioDist.length,
    bloodPanels: panels.length,
  });

  return { character, name: profile.name?.trim() || "Adventurer" };
}
