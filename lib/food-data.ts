import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods, recurringFoods } from "@/db/schema";
import { Meal, Schedule } from "./constants";
import { materializeRecurringForDates } from "./recurring-materialize";

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
  evolution: string;
};

export type RecurringWithFood = {
  id: number;
  foodId: number;
  meal: Meal;
  schedule: Schedule;
  quantity: number;
  startDate: string;
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
      startDate: recurringFoods.startDate,
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

/** Food entries for a day (recurring defaults materialised into food_log with snapshots). */
export async function getDayEntries(date: string): Promise<DayEntry[]> {
  await materializeRecurringForDates(db, [date]);

  const logged = await db.select().from(foodLog).where(eq(foodLog.date, date)).all();

  return logged.map((r) => ({
    key: `log-${r.id}`,
    kind: r.recurringId != null ? ("recurring" as const) : ("logged" as const),
    logId: r.id,
    recurringId: r.recurringId ?? undefined,
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
    evolution: r.evolution,
  }));
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
