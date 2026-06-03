"use server";

import { revalidatePath } from "next/cache";
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
  revalidatePath("/activity");
}

export async function deleteCardio(id: number): Promise<void> {
  await db.delete(cardioSessions).where(eq(cardioSessions.id, id));
  revalidatePath("/activity");
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

/** Persist a finished workout and advance the StrongLifts progression. */
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

  revalidatePath("/activity");
}
