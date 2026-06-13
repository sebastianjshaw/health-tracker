import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import { foodLog, foods, recurringFoods, recurringRemovals } from "../db/schema";
import { Schedule } from "./constants";
import { addDays, schedulesFor } from "./date";
import { foodLogSnapshot } from "./food-snapshot";

/** The app's libSQL/drizzle database. Defined structurally (not `typeof db`)
 * so this module never imports the server-only db client — that keeps it
 * loadable by the standalone MCP process, which passes in its own client. */
export type AppDb = LibSQLDatabase<typeof schema>;

type RecurringRow = {
  id: number;
  foodId: number;
  meal: string;
  schedule: string;
  quantity: number;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  saturatedFat: number | null;
  servingSize: number;
  servingUnit: string;
  source: string;
  evolution: string;
  startDate: string;
};

async function loadRecurringTemplates(db: AppDb): Promise<RecurringRow[]> {
  return db
    .select({
      id: recurringFoods.id,
      foodId: recurringFoods.foodId,
      meal: recurringFoods.meal,
      schedule: recurringFoods.schedule,
      quantity: recurringFoods.quantity,
      name: foods.name,
      kcal: foods.kcal,
      protein: foods.protein,
      carbs: foods.carbs,
      fat: foods.fat,
      fiber: foods.fiber,
      saturatedFat: foods.saturatedFat,
      servingSize: foods.servingSize,
      servingUnit: foods.servingUnit,
      source: foods.source,
      evolution: foods.evolution,
      startDate: recurringFoods.startDate,
    })
    .from(recurringFoods)
    .innerJoin(foods, eq(recurringFoods.foodId, foods.id))
    .all();
}

/** Persist applicable recurring defaults as food_log rows, snapshotting nutrition once. */
export async function materializeRecurringForDates(db: AppDb, dates: string[]): Promise<void> {
  if (dates.length === 0) return;

  const [templates, removalRows, existingRows] = await Promise.all([
    loadRecurringTemplates(db),
    db
      .select()
      .from(recurringRemovals)
      .where(inArray(recurringRemovals.date, dates))
      .all(),
    db
      .select({ date: foodLog.date, recurringId: foodLog.recurringId })
      .from(foodLog)
      .where(and(inArray(foodLog.date, dates), isNotNull(foodLog.recurringId)))
      .all(),
  ]);

  const removedByDate = new Map<string, Set<number>>();
  for (const r of removalRows) {
    const set = removedByDate.get(r.date) ?? new Set<number>();
    set.add(r.recurringId);
    removedByDate.set(r.date, set);
  }

  const materialized = new Set(
    existingRows
      .filter((r) => r.recurringId != null)
      .map((r) => `${r.date}:${r.recurringId}`),
  );

  const inserts: (typeof foodLog.$inferInsert)[] = [];

  for (const date of dates) {
    const schedules = schedulesFor(date);
    const removed = removedByDate.get(date);

    for (const rec of templates) {
      if (date < rec.startDate) continue; // default not active yet on this day
      if (!schedules.includes(rec.schedule as Schedule)) continue;
      if (removed?.has(rec.id)) continue;
      if (materialized.has(`${date}:${rec.id}`)) continue;

      inserts.push(
        foodLogSnapshot(
          {
            id: rec.foodId,
            name: rec.name,
            kcal: rec.kcal,
            protein: rec.protein,
            carbs: rec.carbs,
            fat: rec.fat,
            fiber: rec.fiber,
            saturatedFat: rec.saturatedFat,
            servingSize: rec.servingSize,
            servingUnit: rec.servingUnit,
            source: "recurring",
            evolution: rec.evolution,
          },
          {
            date,
            meal: rec.meal,
            quantity: rec.quantity,
            recurringId: rec.id,
          },
        ),
      );
      materialized.add(`${date}:${rec.id}`);
    }
  }

  if (inserts.length > 0) await db.insert(foodLog).values(inserts);
}

/** Hide a recurring default on one day and remove any materialised log row. */
export async function hideRecurringOnDate(
  db: AppDb,
  date: string,
  recurringId: number,
): Promise<void> {
  await db
    .delete(foodLog)
    .where(and(eq(foodLog.date, date), eq(foodLog.recurringId, recurringId)));

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
}

/** Materialize every date in an inclusive [start, end] range. */
export async function materializeRecurringRange(
  db: AppDb,
  start: string,
  end: string,
): Promise<void> {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  await materializeRecurringForDates(db, dates);
}
