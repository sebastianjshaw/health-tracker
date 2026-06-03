"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { foods, recurringFoods } from "@/db/schema";
import { MEALS, Meal, SCHEDULES, Schedule } from "@/lib/constants";

export type FoodFormState = { error: string | null; ok?: boolean };

function num(v: FormDataEntryValue | null, fallback = 0): number {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export async function createFood(
  _prev: FoodFormState,
  formData: FormData,
): Promise<FoodFormState> {
  const name = str(formData.get("name"));
  if (!name) return { error: "Name is required" };

  const barcode = str(formData.get("barcode"));
  const brand = str(formData.get("brand"));

  await db.insert(foods).values({
    name,
    brand: brand || null,
    barcode: barcode || null,
    servingSize: num(formData.get("servingSize"), 100),
    servingUnit: str(formData.get("servingUnit")) || "g",
    kcal: num(formData.get("kcal")),
    protein: num(formData.get("protein")),
    carbs: num(formData.get("carbs")),
    fat: num(formData.get("fat")),
    fiber: formData.get("fiber") ? num(formData.get("fiber")) : null,
    source: str(formData.get("source")) || "manual",
  });

  revalidatePath("/food");
  revalidatePath("/");
  return { error: null, ok: true };
}

export async function updateFood(
  _prev: FoodFormState,
  formData: FormData,
): Promise<FoodFormState> {
  const id = num(formData.get("id"));
  const name = str(formData.get("name"));
  if (!id) return { error: "Missing id" };
  if (!name) return { error: "Name is required" };

  await db
    .update(foods)
    .set({
      name,
      brand: str(formData.get("brand")) || null,
      barcode: str(formData.get("barcode")) || null,
      servingSize: num(formData.get("servingSize"), 100),
      servingUnit: str(formData.get("servingUnit")) || "g",
      kcal: num(formData.get("kcal")),
      protein: num(formData.get("protein")),
      carbs: num(formData.get("carbs")),
      fat: num(formData.get("fat")),
      fiber: formData.get("fiber") ? num(formData.get("fiber")) : null,
    })
    .where(eq(foods.id, id));

  revalidatePath("/food");
  revalidatePath("/");
  return { error: null, ok: true };
}

export async function deleteFood(id: number): Promise<void> {
  await db.delete(foods).where(eq(foods.id, id));
  revalidatePath("/food");
  revalidatePath("/");
}

export async function addRecurring(
  foodId: number,
  meal: Meal,
  schedule: Schedule,
  quantity = 1,
): Promise<void> {
  if (!MEALS.includes(meal) || !SCHEDULES.includes(schedule)) return;

  const existing = await db
    .select()
    .from(recurringFoods)
    .where(
      and(
        eq(recurringFoods.foodId, foodId),
        eq(recurringFoods.meal, meal),
        eq(recurringFoods.schedule, schedule),
      ),
    )
    .get();
  if (existing) return;

  await db.insert(recurringFoods).values({ foodId, meal, schedule, quantity });
  revalidatePath("/food");
  revalidatePath("/");
}

export async function removeRecurringById(id: number): Promise<void> {
  await db.delete(recurringFoods).where(eq(recurringFoods.id, id));
  revalidatePath("/food");
  revalidatePath("/");
}

export type ScannedFoodInput = {
  name: string;
  brand: string | null;
  barcode: string;
  servingSize: number;
  servingUnit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  source: string;
};

/** Save a scanned/looked-up product to the library, reusing an existing row
 * with the same barcode. Returns the food id. */
export async function upsertScannedFood(input: ScannedFoodInput): Promise<number> {
  if (input.barcode) {
    const existing = await db
      .select()
      .from(foods)
      .where(eq(foods.barcode, input.barcode))
      .get();
    if (existing) return existing.id;
  }

  const [row] = await db
    .insert(foods)
    .values({
      name: input.name,
      brand: input.brand,
      barcode: input.barcode || null,
      servingSize: input.servingSize,
      servingUnit: input.servingUnit,
      kcal: input.kcal,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      fiber: input.fiber,
      source: input.source || "openfoodfacts",
    })
    .returning();

  revalidatePath("/food");
  revalidatePath("/");
  return row.id;
}
