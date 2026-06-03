import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods, recurringFoods, recurringRemovals } from "@/db/schema";
import { Meal, Schedule } from "./constants";
import { schedulesFor } from "./date";

export type DayEntry = {
  key: string;
  kind: "logged" | "recurring";
  logId?: number;
  recurringId?: number;
  foodId: number | null;
  meal: Meal;
  name: string;
  quantity: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: number;
  servingUnit: string;
  source: string;
};

export type RecurringWithFood = {
  id: number;
  foodId: number;
  meal: Meal;
  schedule: Schedule;
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

export async function getFoods() {
  return db.select().from(foods).orderBy(desc(foods.createdAt)).all();
}

export async function getFood(id: number) {
  return db.select().from(foods).where(eq(foods.id, id)).get();
}

export async function getFoodByBarcode(barcode: string) {
  return db.select().from(foods).where(eq(foods.barcode, barcode)).get();
}

export async function getRecurring(): Promise<RecurringWithFood[]> {
  const rows = await db
    .select({
      id: recurringFoods.id,
      foodId: recurringFoods.foodId,
      meal: recurringFoods.meal,
      schedule: recurringFoods.schedule,
      quantity: recurringFoods.quantity,
      name: foods.name,
      brand: foods.brand,
      kcal: foods.kcal,
      protein: foods.protein,
      carbs: foods.carbs,
      fat: foods.fat,
      servingSize: foods.servingSize,
      servingUnit: foods.servingUnit,
    })
    .from(recurringFoods)
    .innerJoin(foods, eq(recurringFoods.foodId, foods.id))
    .all();
  return rows as RecurringWithFood[];
}

/** Merged entries for a day: logged rows + applicable recurring defaults − removals. */
export async function getDayEntries(date: string): Promise<DayEntry[]> {
  const schedules = schedulesFor(date);

  const [logged, removalRows, recurringRows] = await Promise.all([
    db.select().from(foodLog).where(eq(foodLog.date, date)).all(),
    db
      .select()
      .from(recurringRemovals)
      .where(eq(recurringRemovals.date, date))
      .all(),
    db
      .select({
        id: recurringFoods.id,
        foodId: recurringFoods.foodId,
        meal: recurringFoods.meal,
        quantity: recurringFoods.quantity,
        name: foods.name,
        kcal: foods.kcal,
        protein: foods.protein,
        carbs: foods.carbs,
        fat: foods.fat,
        servingSize: foods.servingSize,
        servingUnit: foods.servingUnit,
      })
      .from(recurringFoods)
      .innerJoin(foods, eq(recurringFoods.foodId, foods.id))
      .where(inArray(recurringFoods.schedule, schedules))
      .all(),
  ]);

  const removed = new Set(removalRows.map((r) => r.recurringId));

  const loggedEntries: DayEntry[] = logged.map((r) => ({
    key: `log-${r.id}`,
    kind: "logged",
    logId: r.id,
    foodId: r.foodId,
    meal: r.meal as Meal,
    name: r.name,
    quantity: r.quantity,
    kcal: r.kcal,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    servingSize: r.servingSize,
    servingUnit: r.servingUnit,
    source: r.source,
  }));

  const recurringEntries: DayEntry[] = recurringRows
    .filter((r) => !removed.has(r.id))
    .map((r) => ({
      key: `rec-${r.id}`,
      kind: "recurring",
      recurringId: r.id,
      foodId: r.foodId,
      meal: r.meal as Meal,
      name: r.name,
      quantity: r.quantity,
      kcal: r.kcal,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      servingSize: r.servingSize,
      servingUnit: r.servingUnit,
      source: "recurring",
    }));

  return [...recurringEntries, ...loggedEntries];
}

export async function isRecurring(foodId: number, meal: Meal, schedule: Schedule) {
  const row = await db
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
  return !!row;
}
