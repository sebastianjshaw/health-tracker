"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cardioSessions, liftSessions, liftSets } from "@/db/schema";
import { CardioType, Exercise } from "./constants";
import { isValidISO } from "./date";
import { exerciseSucceeded, nextWeight } from "./lifts";
import {
  getLiftFails,
  getLiftWeights,
  setLiftFails,
  setLiftWeights,
  setNextWorkout,
} from "./settings";
import { EXERCISES } from "./constants";
import { revalidatePaths } from "./revalidate";

export type CardioInput = {
  date: string;
  type: CardioType;
  durationMin?: number | null;
  distanceKm?: number | null;
  avgHr?: number | null;
  kcal?: number | null;
  notes?: string | null;
};

export async function logCardio(input: CardioInput): Promise<void> {
  if (!isValidISO(input.date)) return;
  await db.insert(cardioSessions).values({
    date: input.date,
    type: input.type,
    durationMin: input.durationMin ?? null,
    distanceKm: input.distanceKm ?? null,
    avgHr: input.avgHr ?? null,
    kcal: input.kcal ?? null,
    notes: input.notes ?? null,
  });
  revalidatePaths("/activity");
}

export async function deleteCardio(id: number): Promise<void> {
  await db.delete(cardioSessions).where(eq(cardioSessions.id, id));
  revalidatePaths("/activity");
}

export type LiftEntry = {
  exercise: Exercise;
  targetWeightKg: number;
  reps: number[];
};

export type CompleteWorkoutInput = {
  date: string;
  workout: "A" | "B";
  entries: LiftEntry[];
};

/** Manually set the working weights (kg) for any exercises — they progress
 * automatically too, but you can correct or set starting weights here. */
export async function updateLiftWeights(
  partial: Partial<Record<Exercise, number>>,
): Promise<void> {
  const weights = await getLiftWeights();
  for (const ex of EXERCISES) {
    const v = partial[ex];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      weights[ex] = v;
    }
  }
  await setLiftWeights(weights);
  revalidatePaths("/activity");
}

/** Persist a finished workout and advance the Seblifts progression. */
export async function completeLiftWorkout(input: CompleteWorkoutInput): Promise<void> {
  if (!isValidISO(input.date)) return;

  const session = await db
    .insert(liftSessions)
    .values({ date: input.date, workout: input.workout })
    .returning();
  const sessionId = session[0].id;

  const setRows = input.entries.flatMap((e) =>
    e.reps.map((reps, idx) => ({
      sessionId,
      exercise: e.exercise,
      targetWeightKg: e.targetWeightKg,
      setNumber: idx + 1,
      repsDone: reps,
    })),
  );
  if (setRows.length > 0) await db.insert(liftSets).values(setRows);

  // Advance progression for each exercise trained.
  const weights = await getLiftWeights();
  const fails = await getLiftFails();

  for (const e of input.entries) {
    const succeeded = exerciseSucceeded(e.exercise, e.reps);
    const { weight, deloaded } = nextWeight(
      e.targetWeightKg,
      succeeded,
      fails[e.exercise],
    );
    weights[e.exercise] = weight;
    fails[e.exercise] = succeeded || deloaded ? 0 : fails[e.exercise] + 1;
  }

  await setLiftWeights(weights);
  await setLiftFails(fails);
  await setNextWorkout(input.workout === "A" ? "B" : "A");

  revalidatePaths("/activity", "/stats");
}
