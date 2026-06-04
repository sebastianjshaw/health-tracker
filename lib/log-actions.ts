"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods, recurringRemovals } from "@/db/schema";
import { Meal } from "./constants";
import { isValidISO } from "./date";
import { revalidatePaths } from "./revalidate";

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

  revalidatePaths("/", "/stats");
}

export async function setLogQuantity(logId: number, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await db.delete(foodLog).where(eq(foodLog.id, logId));
  } else {
    await db.update(foodLog).set({ quantity }).where(eq(foodLog.id, logId));
  }
  revalidatePaths("/", "/stats");
}

export async function deleteLogEntry(logId: number): Promise<void> {
  await db.delete(foodLog).where(eq(foodLog.id, logId));
  revalidatePaths("/", "/stats");
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
  revalidatePaths("/", "/stats");
}
