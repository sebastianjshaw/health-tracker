"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bodyMetrics } from "@/db/schema";
import { isValidISO } from "./date";
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

export async function logBody(input: BodyInput): Promise<void> {
  if (!isValidISO(input.date)) return;
  await db.insert(bodyMetrics).values({
    date: input.date,
    weightKg: input.weightKg ?? null,
    bodyFatPct: input.bodyFatPct ?? null,
    waistCm: input.waistCm ?? null,
    chestCm: input.chestCm ?? null,
    hipsCm: input.hipsCm ?? null,
    restingHr: input.restingHr ?? null,
    notes: input.notes ?? null,
  });
  revalidatePath("/stats");
}

export async function deleteBody(id: number): Promise<void> {
  await db.delete(bodyMetrics).where(eq(bodyMetrics.id, id));
  revalidatePath("/stats");
}

export async function saveGoals(input: {
  kcal: number;
  protein: number;
  goalWeight: number | null;
  mealSplit: MealSplit;
}): Promise<void> {
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
  revalidatePath("/stats");
  revalidatePath("/");
}
