"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods, recurringRemovals } from "@/db/schema";
import { Meal } from "./constants";
import { isValidISO } from "./date";

/** Add a library food to a day's meal, snapshotting its nutrition. */
export async function addLogEntry(
  date: string,
  meal: Meal,
  foodId: number,
  quantity = 1,
): Promise<void> {
  if (!isValidISO(date)) return;
  const food = await db.select().from(foods).where(eq(foods.id, foodId)).get();
  if (!food) return;

  await db.insert(foodLog).values({
    date,
    meal,
    foodId: food.id,
    name: food.name,
    quantity,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    source: food.source,
  });

  revalidatePath("/");
}

export type QuickEntry = {
  name: string;
  quantity: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize?: number;
  servingUnit?: string;
  source?: string;
};

/** Add an ad-hoc entry not tied to the library (e.g. from AI parsing). */
export async function addQuickEntry(
  date: string,
  meal: Meal,
  entry: QuickEntry,
): Promise<void> {
  if (!isValidISO(date)) return;
  await db.insert(foodLog).values({
    date,
    meal,
    foodId: null,
    name: entry.name,
    quantity: entry.quantity || 1,
    kcal: entry.kcal || 0,
    protein: entry.protein || 0,
    carbs: entry.carbs || 0,
    fat: entry.fat || 0,
    servingSize: entry.servingSize ?? 1,
    servingUnit: entry.servingUnit ?? "serving",
    source: entry.source ?? "manual",
  });
  revalidatePath("/");
}

export async function setLogQuantity(logId: number, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await db.delete(foodLog).where(eq(foodLog.id, logId));
  } else {
    await db.update(foodLog).set({ quantity }).where(eq(foodLog.id, logId));
  }
  revalidatePath("/");
}

export async function deleteLogEntry(logId: number): Promise<void> {
  await db.delete(foodLog).where(eq(foodLog.id, logId));
  revalidatePath("/");
}

/** Hide a recurring default from one specific day (template is unchanged). */
export async function removeRecurringFromDay(
  date: string,
  recurringId: number,
): Promise<void> {
  if (!isValidISO(date)) return;
  const existing = await db
    .select()
    .from(recurringRemovals)
    .where(
      and(
        eq(recurringRemovals.date, date),
        eq(recurringRemovals.recurringId, recurringId),
      ),
    )
    .get();
  if (!existing) {
    await db.insert(recurringRemovals).values({ date, recurringId });
  }
  revalidatePath("/");
}
