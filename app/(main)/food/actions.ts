"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { foods, recurringFoods } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import {
  EVOLUTIONS,
  Evolution,
  evolutionForSource,
  MEALS,
  Meal,
  SCHEDULES,
  Schedule,
} from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { asCategory, inferCategory } from "@/lib/food-category";
import { num, nullableNum } from "@/lib/format";
import { estimateFiberOne } from "@/lib/fiber-estimate";
import { revalidatePaths } from "@/lib/revalidate";

export type FoodFormState = { error: string | null; ok?: boolean };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

/**
 * Resolve a food's fiber: keep an explicit value as measured, otherwise
 * AI-estimate it (flagged as estimated). Never throws — a failed estimate just
 * leaves fiber blank, so saving a food never depends on the AI call.
 */
async function resolveFiber(
  name: string,
  carbs: number,
  fiber: number | null,
): Promise<{ fiber: number | null; fiberEstimated: boolean }> {
  if (fiber != null) return { fiber, fiberEstimated: false };
  try {
    const est = await estimateFiberOne(name, carbs);
    if (est != null) return { fiber: est, fiberEstimated: true };
  } catch (e) {
    console.error("fiber estimate failed:", e);
  }
  return { fiber: null, fiberEstimated: false };
}

function asEvolution(v: string, fallback: Evolution): Evolution {
  return EVOLUTIONS.includes(v as Evolution) ? (v as Evolution) : fallback;
}

/** Optional extended nutrition fields shared by create/update. */
function extendedFields(fd: FormData) {
  return {
    fiber: nullableNum(fd.get("fiber")),
    sugar: nullableNum(fd.get("sugar")),
    saturatedFat: nullableNum(fd.get("saturatedFat")),
    salt: nullableNum(fd.get("salt")),
    sodium: nullableNum(fd.get("sodium")),
    extras: str(fd.get("extras")) || null,
  };
}

export async function createFood(
  _prev: FoodFormState,
  formData: FormData,
): Promise<FoodFormState> {
  await requireAuth();
  const name = str(formData.get("name"));
  if (!name) return { error: "Name is required" };

  const barcode = str(formData.get("barcode"));
  const brand = str(formData.get("brand"));
  const servingUnit = str(formData.get("servingUnit")) || "g";
  const rawCategory = str(formData.get("category"));
  const source = str(formData.get("source")) || "manual";
  const rawEvolution = str(formData.get("evolution"));

  const carbs = num(formData.get("carbs"));
  const fiber = await resolveFiber(name, carbs, nullableNum(formData.get("fiber")));

  await db.insert(foods).values({
    name,
    brand: brand || null,
    barcode: barcode || null,
    servingSize: num(formData.get("servingSize"), 100),
    servingUnit,
    kcal: num(formData.get("kcal")),
    protein: num(formData.get("protein")),
    carbs,
    fat: num(formData.get("fat")),
    ...extendedFields(formData),
    fiber: fiber.fiber,
    fiberEstimated: fiber.fiberEstimated,
    category: rawCategory ? asCategory(rawCategory) : inferCategory(servingUnit, name),
    source,
    evolution: asEvolution(rawEvolution, evolutionForSource(source)),
  });

  revalidatePaths("/", "/food", "/stats");
  return { error: null, ok: true };
}

export async function updateFood(
  _prev: FoodFormState,
  formData: FormData,
): Promise<FoodFormState> {
  await requireAuth();
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
      ...extendedFields(formData),
      // a manually-entered fiber value is measured; clear the estimated flag.
      fiberEstimated: nullableNum(formData.get("fiber")) == null ? null : false,
      category: asCategory(str(formData.get("category"))),
      evolution: asEvolution(str(formData.get("evolution")), "commodity"),
    })
    .where(eq(foods.id, id));

  revalidatePaths("/", "/food", "/stats");
  return { error: null, ok: true };
}

export async function deleteFood(id: number): Promise<void> {
  await requireAuth();
  await db.delete(foods).where(eq(foods.id, id));
  revalidatePaths("/", "/food", "/stats");
}

export async function addRecurring(
  foodId: number,
  meal: Meal,
  schedule: Schedule,
  quantity = 1,
): Promise<void> {
  await requireAuth();
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

  await db
    .insert(recurringFoods)
    .values({ foodId, meal, schedule, quantity, startDate: todayISO() });
  revalidatePaths("/", "/food", "/stats");
}

export async function removeRecurringById(id: number): Promise<void> {
  await requireAuth();
  await db.delete(recurringFoods).where(eq(recurringFoods.id, id));
  revalidatePaths("/", "/food", "/stats");
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
  sugar?: number | null;
  saturatedFat?: number | null;
  salt?: number | null;
  sodium?: number | null;
  extras?: string | null;
  source: string;
  category?: string;
  evolution?: string;
};

/** Save a scanned/looked-up product to the library, reusing an existing row
 * with the same barcode. Returns the food id. */
export async function upsertScannedFood(input: ScannedFoodInput): Promise<number> {
  await requireAuth();
  if (input.barcode) {
    const existing = await db
      .select()
      .from(foods)
      .where(eq(foods.barcode, input.barcode))
      .get();
    if (existing) return existing.id;
  }

  const fiber = await resolveFiber(input.name, input.carbs, input.fiber);

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
      fiber: fiber.fiber,
      fiberEstimated: fiber.fiberEstimated,
      sugar: input.sugar ?? null,
      saturatedFat: input.saturatedFat ?? null,
      salt: input.salt ?? null,
      sodium: input.sodium ?? null,
      extras: input.extras ?? null,
      source: input.source || "openfoodfacts",
      category: input.category
        ? asCategory(input.category)
        : inferCategory(input.servingUnit, input.name),
      evolution: asEvolution(
        input.evolution ?? "",
        evolutionForSource(input.source || "openfoodfacts"),
      ),
    })
    .returning();

  revalidatePaths("/", "/food", "/stats");
  return row.id;
}
