import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { foods, mealItems, meals } from "@/db/schema";

/** One ingredient of a saved meal — the library food plus how many servings. */
export type MealIngredient = {
  foodId: number;
  quantity: number;
  name: string;
  brand: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: number;
  servingUnit: string;
};

export type MealWithItems = {
  id: number;
  name: string;
  items: MealIngredient[];
  /** Totals = Σ per-serving × quantity, rounded (for list summaries). */
  totalKcal: number;
  totalProtein: number;
};

/** All saved meals with their ingredients (joined to the library). Ingredients
 *  whose food was deleted are dropped (inner join). */
export async function getMeals(): Promise<MealWithItems[]> {
  const rows = await db.select().from(meals).orderBy(asc(meals.name)).all();
  if (rows.length === 0) return [];

  const items = await db
    .select({
      mealId: mealItems.mealId,
      quantity: mealItems.quantity,
      foodId: foods.id,
      name: foods.name,
      brand: foods.brand,
      kcal: foods.kcal,
      protein: foods.protein,
      carbs: foods.carbs,
      fat: foods.fat,
      servingSize: foods.servingSize,
      servingUnit: foods.servingUnit,
    })
    .from(mealItems)
    .innerJoin(foods, eq(mealItems.foodId, foods.id))
    .where(inArray(mealItems.mealId, rows.map((m) => m.id)))
    .orderBy(asc(mealItems.position), asc(mealItems.id))
    .all();

  const byMeal = new Map<number, MealIngredient[]>();
  for (const it of items) {
    const arr = byMeal.get(it.mealId) ?? [];
    arr.push({
      foodId: it.foodId,
      quantity: it.quantity,
      name: it.name,
      brand: it.brand,
      kcal: it.kcal,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      servingSize: it.servingSize,
      servingUnit: it.servingUnit,
    });
    byMeal.set(it.mealId, arr);
  }

  return rows.map((m) => {
    const its = byMeal.get(m.id) ?? [];
    return {
      id: m.id,
      name: m.name,
      items: its,
      totalKcal: Math.round(its.reduce((s, i) => s + i.kcal * i.quantity, 0)),
      totalProtein: Math.round(its.reduce((s, i) => s + i.protein * i.quantity, 0)),
    };
  });
}
