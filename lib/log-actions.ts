"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods } from "@/db/schema";
import { requireAuth } from "./auth";
import { Meal } from "./constants";
import { isValidISO } from "./date";
import { foodLogSnapshot } from "./food-snapshot";
import { hideRecurringOnDate } from "./recurring-materialize";
import { revalidatePaths } from "./revalidate";

/** Add a library food to a day's meal, snapshotting its nutrition. */
export async function addLogEntry(
  date: string,
  meal: Meal,
  foodId: number,
  quantity = 1,
): Promise<void> {
  await requireAuth();
  if (!isValidISO(date)) return;
  const food = await db.select().from(foods).where(eq(foods.id, foodId)).get();
  if (!food) return;

  await db.insert(foodLog).values(
    foodLogSnapshot(food, { date, meal, quantity }),
  );

  revalidatePaths("/", "/stats");
}

export async function setLogQuantity(logId: number, quantity: number): Promise<void> {
  await requireAuth();
  if (quantity <= 0) {
    await db.delete(foodLog).where(eq(foodLog.id, logId));
  } else {
    await db.update(foodLog).set({ quantity }).where(eq(foodLog.id, logId));
  }
  revalidatePaths("/", "/stats");
}

export async function deleteLogEntry(logId: number): Promise<void> {
  await requireAuth();
  await db.delete(foodLog).where(eq(foodLog.id, logId));
  revalidatePaths("/", "/stats");
}

/** Hide a recurring default from one specific day (template is unchanged). */
export async function removeRecurringFromDay(
  date: string,
  recurringId: number,
): Promise<void> {
  await requireAuth();
  if (!isValidISO(date)) return;
  await hideRecurringOnDate(db, date, recurringId);
  revalidatePaths("/", "/stats");
}
