"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cardioSessions, freeformLifts, liftSessions, liftSets } from "@/db/schema";
import { actionFail, actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { CARDIO_TYPES, CardioType, Exercise, EXERCISES } from "./constants";
import { isValidISO } from "./date";
import { isFiniteOrNull } from "./validate";
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
  startedAt?: string | null;
  durationMin?: number | null;
  distanceKm?: number | null;
  avgHr?: number | null;
  kcal?: number | null;
  notes?: string | null;
};

/** Optional numeric cardio fields that must be finite when present. */
function cardioNumbersValid(c: { durationMin?: number | null; distanceKm?: number | null; avgHr?: number | null; kcal?: number | null }): boolean {
  return [c.durationMin, c.distanceKm, c.avgHr, c.kcal].every(isFiniteOrNull);
}

export async function logCardio(input: CardioInput): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  if (!CARDIO_TYPES.includes(input.type)) return actionFail("Invalid cardio type");
  if (!cardioNumbersValid(input)) return actionFail("Cardio values must be numbers");
  await db.insert(cardioSessions).values({
    date: input.date,
    type: input.type,
    startedAt: input.startedAt ?? null,
    durationMin: input.durationMin ?? null,
    distanceKm: input.distanceKm ?? null,
    avgHr: input.avgHr ?? null,
    kcal: input.kcal ?? null,
    notes: input.notes ?? null,
  });
  revalidatePaths("/activity", "/stats");
  return actionOk();
}

export type CardioUpdate = {
  id: number;
  type?: CardioType;
  startedAt?: string | null;
  durationMin?: number | null;
  distanceKm?: number | null;
  avgHr?: number | null;
  kcal?: number | null;
  notes?: string | null;
};

/**
 * Edit a logged cardio session. Imported sessions (source !== "manual") only
 * allow editing fields Google Health doesn't own — currently just notes — so
 * a re-sync can't silently revert the user's measured data either.
 */
export async function updateCardio(input: CardioUpdate): Promise<ActionResult> {
  await requireAuth();
  const existing = await db
    .select()
    .from(cardioSessions)
    .where(eq(cardioSessions.id, input.id))
    .get();
  if (!existing) return actionFail("Session not found");
  if (input.type != null && !CARDIO_TYPES.includes(input.type)) {
    return actionFail("Invalid cardio type");
  }
  if (!cardioNumbersValid(input)) return actionFail("Cardio values must be numbers");

  if (existing.source !== "manual") {
    await db
      .update(cardioSessions)
      .set({ notes: input.notes ?? null })
      .where(eq(cardioSessions.id, input.id));
  } else {
    await db
      .update(cardioSessions)
      .set({
        type: input.type ?? existing.type,
        startedAt: input.startedAt ?? null,
        durationMin: input.durationMin ?? null,
        distanceKm: input.distanceKm ?? null,
        avgHr: input.avgHr ?? null,
        kcal: input.kcal ?? null,
        notes: input.notes ?? null,
      })
      .where(eq(cardioSessions.id, input.id));
  }
  revalidatePaths("/activity", "/stats");
  return actionOk();
}

export async function deleteCardio(id: number): Promise<ActionResult> {
  await requireAuth();
  await db.delete(cardioSessions).where(eq(cardioSessions.id, id));
  revalidatePaths("/activity", "/stats");
  return actionOk();
}

export type FreeformLiftInput = {
  date: string;
  exercise: string;
  sets?: number | null;
  repsPerSet?: number | null;
  weightKg?: number | null;
  notes?: string | null;
};

function freeformNumbersValid(c: { sets?: number | null; repsPerSet?: number | null; weightKg?: number | null }): boolean {
  return [c.sets, c.repsPerSet, c.weightKg].every(isFiniteOrNull);
}

/** Log a free-form strength entry (anything outside the 5×5 program). */
export async function logFreeformLift(input: FreeformLiftInput): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  const exercise = input.exercise.trim();
  if (!exercise) return actionFail("Exercise is required");
  if (!freeformNumbersValid(input)) return actionFail("Sets/reps/weight must be numbers");
  await db.insert(freeformLifts).values({
    date: input.date,
    exercise,
    sets: input.sets ?? null,
    repsPerSet: input.repsPerSet ?? null,
    weightKg: input.weightKg ?? null,
    notes: input.notes ?? null,
    source: "manual",
  });
  revalidatePaths("/activity", "/stats");
  return actionOk();
}

export type FreeformLiftUpdate = FreeformLiftInput & { id: number };

export async function updateFreeformLift(input: FreeformLiftUpdate): Promise<ActionResult> {
  await requireAuth();
  const exercise = input.exercise.trim();
  if (!exercise) return actionFail("Exercise is required");
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  if (!freeformNumbersValid(input)) return actionFail("Sets/reps/weight must be numbers");
  const existing = await db.select({ id: freeformLifts.id }).from(freeformLifts).where(eq(freeformLifts.id, input.id)).get();
  if (!existing) return actionFail("Entry not found");
  await db
    .update(freeformLifts)
    .set({
      date: input.date,
      exercise,
      sets: input.sets ?? null,
      repsPerSet: input.repsPerSet ?? null,
      weightKg: input.weightKg ?? null,
      notes: input.notes ?? null,
    })
    .where(eq(freeformLifts.id, input.id));
  revalidatePaths("/activity", "/stats");
  return actionOk();
}

export async function deleteFreeformLift(id: number): Promise<ActionResult> {
  await requireAuth();
  await db.delete(freeformLifts).where(eq(freeformLifts.id, id));
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
