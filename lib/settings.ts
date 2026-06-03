import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  DEFAULT_LIFT_WEIGHTS,
  DEFAULT_MEAL_SPLIT,
  DEFAULT_TARGETS,
  EXERCISES,
  Exercise,
  MEALS,
  Meal,
} from "./constants";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(value) },
    });
}

export type Targets = { kcal: number; protein: number };

export async function getTargets(): Promise<Targets> {
  return getSetting<Targets>("targets", DEFAULT_TARGETS);
}

export async function getLiftWeights(): Promise<Record<Exercise, number>> {
  const stored = await getSetting<Partial<Record<Exercise, number>>>("liftWeights", {});
  const out = { ...DEFAULT_LIFT_WEIGHTS };
  for (const ex of EXERCISES) {
    if (typeof stored[ex] === "number") out[ex] = stored[ex] as number;
  }
  return out;
}

export async function setLiftWeights(weights: Record<Exercise, number>): Promise<void> {
  await setSetting("liftWeights", weights);
}

/** Tracks consecutive failures per exercise for the deload rule. */
export async function getLiftFails(): Promise<Record<Exercise, number>> {
  const stored = await getSetting<Partial<Record<Exercise, number>>>("liftFails", {});
  const out = {} as Record<Exercise, number>;
  for (const ex of EXERCISES) out[ex] = stored[ex] ?? 0;
  return out;
}

export async function setLiftFails(fails: Record<Exercise, number>): Promise<void> {
  await setSetting("liftFails", fails);
}

/** Which workout (A/B) comes next; alternates each session. */
export async function getNextWorkout(): Promise<"A" | "B"> {
  return getSetting<"A" | "B">("nextWorkout", "A");
}

export async function setNextWorkout(w: "A" | "B"): Promise<void> {
  await setSetting("nextWorkout", w);
}

export async function getGoalWeight(): Promise<number | null> {
  return getSetting<number | null>("goalWeight", null);
}

export async function setGoalWeight(kg: number | null): Promise<void> {
  await setSetting("goalWeight", kg);
}

export type MealSplit = Record<Meal, number>;

export async function getMealSplit(): Promise<MealSplit> {
  const stored = await getSetting<Partial<MealSplit>>("mealSplit", {});
  const out = { ...DEFAULT_MEAL_SPLIT };
  for (const m of MEALS) {
    if (typeof stored[m] === "number") out[m] = stored[m] as number;
  }
  return out;
}

export async function setMealSplit(split: MealSplit): Promise<void> {
  await setSetting("mealSplit", split);
}
