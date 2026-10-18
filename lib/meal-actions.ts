"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods, mealItems, meals } from "@/db/schema";
import { actionFail, actionOk, type ActionResult } from "./action-result";
import { requireAuth } from "./auth";
import { MEALS, type Meal } from "./constants";
import { isValidISO } from "./date";
import { foodLogSnapshot } from "./food-snapshot";
import { revalidatePaths } from "./revalidate";

export type MealItemInput = { foodId: number; quantity: number };

/** Replace a meal's ingredient rows wholesale (positions follow array order). */
async function replaceItems(mealId: number, items: MealItemInput[]): Promise<void> {
  await db.delete(mealItems).where(eq(mealItems.mealId, mealId));
  const rows = items
    .filter((i) => Number.isFinite(i.quantity) && i.quantity > 0)
    .map((i, idx) => ({
      mealId,
      foodId: i.foodId,
      quantity: Number(i.quantity.toFixed(2)),
      position: idx,
    }));
  if (rows.length) await db.insert(mealItems).values(rows);
}

export async function createMeal(name: string, items: MealItemInput[]): Promise<ActionResult> {
  await requireAuth();
  const clean = name.trim();
  if (!clean) return actionFail("Name is required");
  if (items.length === 0) return actionFail("Add at least one ingredient");
  const [m] = await db.insert(meals).values({ name: clean }).returning({ id: meals.id });
  await replaceItems(m.id, items);
  revalidatePaths("/food", "/");
  return actionOk();
}

export async function updateMeal(
  id: number,
  name: string,
  items: MealItemInput[],
): Promise<ActionResult> {
  await requireAuth();
  const clean = name.trim();
  if (!clean) return actionFail("Name is required");
  if (items.length === 0) return actionFail("Add at least one ingredient");
  const existing = await db.select({ id: meals.id }).from(meals).where(eq(meals.id, id)).get();
  if (!existing) return actionFail("Meal not found");
  await db.update(meals).set({ name: clean }).where(eq(meals.id, id));
  await replaceItems(id, items);
  revalidatePaths("/food", "/");
  return actionOk();
}

export async function deleteMeal(id: number): Promise<ActionResult> {
  await requireAuth();
  // Delete items explicitly rather than rely on ON DELETE CASCADE (only fires
  // with SQLite's foreign_keys pragma on).
  await db.delete(mealItems).where(eq(mealItems.mealId, id));
  await db.delete(meals).where(eq(meals.id, id));
  revalidatePaths("/food", "/");
  return actionOk();
}

/**
 * Expand a saved meal onto a day's meal slot: one food_log snapshot per
 * ingredient (at its saved quantity). The rows are independent of the meal —
 * editing or deleting them never touches the saved meal, and vice versa.
 */
export async function addMealToDay(
  date: string,
  meal: Meal,
  mealId: number,
): Promise<ActionResult> {
  await requireAuth();
  if (!isValidISO(date)) return actionFail("Invalid date");
  if (!MEALS.includes(meal)) return actionFail("Invalid meal");
  const items = await db
    .select({ quantity: mealItems.quantity, food: foods })
    .from(mealItems)
    .innerJoin(foods, eq(mealItems.foodId, foods.id))
    .where(eq(mealItems.mealId, mealId))
    .orderBy(mealItems.position)
    .all();
  if (items.length === 0) return actionFail("Meal has no ingredients");
  await db
    .insert(foodLog)
    .values(items.map((it) => foodLogSnapshot(it.food, { date, meal, quantity: it.quantity })));
  revalidatePaths("/", "/stats");
  return actionOk();
}
