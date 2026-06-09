"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cardioSessions, liftSessions, liftSets } from "@/db/schema";
import { actionFail, actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { CardioType, Exercise, EXERCISES } from "./constants";
import { isValidISO } from "./date";
import { exerciseSucceeded, nextWeight } from "./lifts";
import {
  getLiftFails,
  getLiftWeights,
  setLiftFails,
  setLiftWeights,
  setNextWorkout,
} from "./settings";
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

export async function logCardio(input: CardioInput): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  await db.insert(cardioSessions).values({
    date: input.date,
    type: input.type,
    durationMin: input.durationMin ?? null,
    distanceKm: input.distanceKm ?? null,
    avgHr: input.avgHr ?? null,
    kcal: input.kcal ?? null,
    notes: input.notes ?? null,
  });
  revalidatePaths("/activity", "/stats");
  return actionOk();
}

export async function deleteCardio(id: number): Promise<ActionResult> {
  await requireAuth();
  await db.delete(cardioSessions).where(eq(cardioSessions.id, id));
  revalidatePaths("/activity", "/stats");
  return actionOk();
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
): Promise<ActionResult> {
  await requireAuth();
  const weights = await getLiftWeights();
  for (const ex of EXERCISES) {
    const v = partial[ex];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      weights[ex] = v;
    }
  }
  await setLiftWeights(weights);
  revalidatePaths("/activity");
  return actionOk();
}

/** Persist a finished workout and advance the Seblifts progression. */
export async function completeLiftWorkout(
  input: CompleteWorkoutInput,
): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  if (input.entries.length === 0) return actionFail("No exercises logged");

  const existing = await db
    .select({ id: liftSessions.id })
    .from(liftSessions)
    .where(and(eq(liftSessions.date, input.date), eq(liftSessions.workout, input.workout)))
    .get();
  if (existing) return actionFail("This workout is already logged for this date");

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
  return actionOk();
}
