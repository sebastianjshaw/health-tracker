"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bodyMetrics } from "@/db/schema";
import { actionFail, actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { isValidISO } from "./date";
import { isFiniteNum, isFiniteOrNull } from "./validate";
import { MEALS } from "./constants";
import { revalidatePaths } from "./revalidate";
import {
  MealSplit,
  setContingency,
  setGoalWeight,
  setMealSplit,
  setTargets,
} from "./settings";

function mealSplitSum(split: MealSplit): number {
  return MEALS.reduce((s, m) => s + (split[m] || 0), 0);
}

export type BodyInput = {
  date: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  hipsCm?: number | null;
  restingHr?: number | null;
  notes?: string | null;
};

function hasBodyInput(input: BodyInput): boolean {
  return (
    input.weightKg != null ||
    input.bodyFatPct != null ||
    input.waistCm != null ||
    input.chestCm != null ||
    input.hipsCm != null ||
    input.restingHr != null ||
    (input.notes != null && input.notes.trim() !== "")
  );
}

/** Log or update today's body metrics (one row per date). */
export async function logBody(input: BodyInput): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(input.date)) return actionFail("Invalid date");
  if (!hasBodyInput(input)) return actionFail("Enter at least one measurement");
  if (
    ![input.weightKg, input.bodyFatPct, input.waistCm, input.chestCm, input.hipsCm, input.restingHr].every(
      isFiniteOrNull,
    )
  ) {
    return actionFail("Measurements must be numbers");
  }

  const values = {
    weightKg: input.weightKg ?? null,
    bodyFatPct: input.bodyFatPct ?? null,
    waistCm: input.waistCm ?? null,
    chestCm: input.chestCm ?? null,
    hipsCm: input.hipsCm ?? null,
    restingHr: input.restingHr ?? null,
    notes: input.notes ?? null,
  };

  const existing = await db
    .select()
    .from(bodyMetrics)
    .where(eq(bodyMetrics.date, input.date))
    .orderBy(desc(bodyMetrics.id))
    .get();

  if (existing) {
    await db
      .update(bodyMetrics)
      .set({
        weightKg: values.weightKg ?? existing.weightKg,
        bodyFatPct: values.bodyFatPct ?? existing.bodyFatPct,
        waistCm: values.waistCm ?? existing.waistCm,
        chestCm: values.chestCm ?? existing.chestCm,
        hipsCm: values.hipsCm ?? existing.hipsCm,
        restingHr: values.restingHr ?? existing.restingHr,
        notes: values.notes ?? existing.notes,
      })
      .where(eq(bodyMetrics.id, existing.id));
  } else {
    await db.insert(bodyMetrics).values({ date: input.date, ...values });
  }

  // Latest weight also drives the Profile "suggested target" and the doctor report.
  revalidatePaths("/measurements", "/stats", "/profile", "/report");
  return actionOk();
}

export async function deleteBody(id: number): Promise<ActionResult> {
  await requireAuth();
  await db.delete(bodyMetrics).where(eq(bodyMetrics.id, id));
  revalidatePaths("/measurements", "/stats", "/profile", "/report");
  return actionOk();
}

export async function saveContingency(input: {
  product: number;
  estimated: number;
}): Promise<ActionResult> {
  await requireAuth();
  const clamp = (n: number) => Math.max(0, Math.min(200, Math.round(n)));
  if (!Number.isFinite(input.product) || !Number.isFinite(input.estimated)) {
    return actionFail("Enter both contingency percentages");
  }
  await setContingency({ product: clamp(input.product), estimated: clamp(input.estimated) });
  revalidatePaths("/settings", "/stats", "/");
  return actionOk();
}

export async function saveGoals(input: {
  kcal: number;
  protein: number;
  goalWeight: number | null;
  mealSplit: MealSplit;
}): Promise<ActionResult> {
  await requireAuth();
  if (!isFiniteNum(input.kcal) || !isFiniteNum(input.protein)) {
    return actionFail("Targets must be numbers");
  }
  if (MEALS.some((m) => !isFiniteNum(input.mealSplit[m]) || input.mealSplit[m] < 0)) {
    return actionFail("Meal split percentages must be non-negative numbers");
  }
  // Tolerance, not strict equality: integer splits sum cleanly, but any
  // non-integer entry can land on 100.00000001 with floating-point.
  if (Math.abs(mealSplitSum(input.mealSplit) - 100) > 0.5) {
    return actionFail("Meal split must sum to 100%");
  }
  await setTargets(input.kcal, input.protein);
  await setGoalWeight(
    input.goalWeight != null && Number.isFinite(input.goalWeight)
      ? input.goalWeight
      : null,
  );
  await setMealSplit(input.mealSplit);
  revalidatePaths("/profile", "/stats", "/");
  return actionOk();
}
