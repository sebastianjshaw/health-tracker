"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bodyMetrics } from "@/db/schema";
import { actionFail, actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { isValidISO } from "./date";
import { revalidatePaths } from "./revalidate";
import { MealSplit, setGoalWeight, setMealSplit, setSetting } from "./settings";

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

  revalidatePaths("/stats");
  return actionOk();
}

export async function deleteBody(id: number): Promise<ActionResult> {
  await requireAuth();
  await db.delete(bodyMetrics).where(eq(bodyMetrics.id, id));
  revalidatePaths("/stats");
  return actionOk();
}

export async function saveGoals(input: {
  kcal: number;
  protein: number;
  goalWeight: number | null;
  mealSplit: MealSplit;
}): Promise<ActionResult> {
  await requireAuth();
  await setSetting("targets", {
    kcal: Math.max(0, Math.round(input.kcal)),
    protein: Math.max(0, Math.round(input.protein)),
  });
  await setGoalWeight(
    input.goalWeight != null && Number.isFinite(input.goalWeight)
      ? input.goalWeight
      : null,
  );
  await setMealSplit(input.mealSplit);
  revalidatePaths("/stats", "/");
  return actionOk();
}
