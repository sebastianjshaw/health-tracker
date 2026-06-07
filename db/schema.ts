import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/**
 * Nutrition convention: kcal/protein/carbs/fat are stored **per serving**, where
 * one serving = `servingSize` `servingUnit` (e.g. 100 g). A logged entry's
 * `quantity` is the number of servings, so totals = quantity * per-serving value.
 */
export const foods = sqliteTable("foods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  brand: text("brand"),
  barcode: text("barcode"),
  servingSize: real("serving_size").notNull().default(100),
  servingUnit: text("serving_unit").notNull().default("g"),
  kcal: real("kcal").notNull().default(0),
  protein: real("protein").notNull().default(0),
  carbs: real("carbs").notNull().default(0),
  fat: real("fat").notNull().default(0),
  fiber: real("fiber"),
  // extended per-serving nutrition (optional; mostly from barcode import)
  sugar: real("sugar"),
  saturatedFat: real("saturated_fat"),
  salt: real("salt"),
  sodium: real("sodium"),
  // arbitrary extra nutrients (vitamins/minerals): JSON [{label,value,unit}]
  extras: text("extras"),
  // 'manual' | 'openfoodfacts' | 'ai'
  source: text("source").notNull().default("manual"),
  // 'food' | 'drink' | 'other' — for filtering the library
  category: text("category").notNull().default("food"),
  createdAt: createdAt(),
});

/** "Daily food" / "weekend food" defaults that auto-appear on matching days. */
export const recurringFoods = sqliteTable("recurring_foods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  foodId: integer("food_id")
    .notNull()
    .references(() => foods.id, { onDelete: "cascade" }),
  // 'breakfast' | 'lunch' | 'dinner' | 'snacks'
  meal: text("meal").notNull(),
  // 'weekday' (Mon-Fri) | 'weekend' (Sat-Sun) | 'everyday'
  schedule: text("schedule").notNull(),
  quantity: real("quantity").notNull().default(1),
  createdAt: createdAt(),
});

/** Concrete food entries for a given day. */
export const foodLog = sqliteTable("food_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD (local)
  meal: text("meal").notNull(),
  foodId: integer("food_id").references(() => foods.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  quantity: real("quantity").notNull().default(1),
  // per-serving snapshot, so edits to the library don't rewrite history
  kcal: real("kcal").notNull().default(0),
  protein: real("protein").notNull().default(0),
  carbs: real("carbs").notNull().default(0),
  fat: real("fat").notNull().default(0),
  servingSize: real("serving_size").notNull().default(100),
  servingUnit: text("serving_unit").notNull().default("g"),
  source: text("source").notNull().default("manual"),
  // set when this row was materialised from a recurring template
  recurringId: integer("recurring_id"),
  createdAt: createdAt(),
}, (t) => [
  index("food_log_date_idx").on(t.date),
  uniqueIndex("food_log_date_recurring_uidx").on(t.date, t.recurringId),
]);

/** Records that a recurring default was removed from one specific day. */
export const recurringRemovals = sqliteTable("recurring_removals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  recurringId: integer("recurring_id").notNull(),
}, (t) => [index("recurring_removals_date_idx").on(t.date)]);

export const bodyMetrics = sqliteTable("body_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  weightKg: real("weight_kg"),
  bodyFatPct: real("body_fat_pct"),
  waistCm: real("waist_cm"),
  chestCm: real("chest_cm"),
  hipsCm: real("hips_cm"),
  restingHr: integer("resting_hr"),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [index("body_metrics_date_idx").on(t.date)]);

export const cardioSessions = sqliteTable("cardio_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  // 'run' | 'bike' | 'row' | 'walk' | 'swim' | 'other'
  type: text("type").notNull().default("run"),
  durationMin: real("duration_min"),
  distanceKm: real("distance_km"),
  avgHr: integer("avg_hr"),
  kcal: real("kcal"),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [index("cardio_sessions_date_idx").on(t.date)]);

export const liftSessions = sqliteTable("lift_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  workout: text("workout").notNull(), // 'A' | 'B'
  notes: text("notes"),
  createdAt: createdAt(),
});

export const liftSets = sqliteTable("lift_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => liftSessions.id, { onDelete: "cascade" }),
  // 'squat' | 'bench' | 'row' | 'ohp' | 'deadlift'
  exercise: text("exercise").notNull(),
  targetWeightKg: real("target_weight_kg").notNull(),
  setNumber: integer("set_number").notNull(),
  repsDone: integer("reps_done"), // null until logged
}, (t) => [index("lift_sets_session_idx").on(t.sessionId)]);

/** Blood / lab biomarker readings — one row per marker per dated test. */
export const bloodMarkers = sqliteTable("blood_markers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD of the test
  marker: text("marker").notNull(), // e.g. "Total cholesterol", "HbA1c"
  value: real("value").notNull(),
  unit: text("unit").notNull().default(""),
  refLow: real("ref_low"),
  refHigh: real("ref_high"),
  category: text("category"), // e.g. "Lipids", "Liver", "Thyroid"
  clinic: text("clinic"),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [index("blood_markers_date_idx").on(t.date)]);

/** Single-row-per-key store for app settings (targets, lift weights, etc.). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-encoded
});

export type Food = typeof foods.$inferSelect;
export type RecurringFood = typeof recurringFoods.$inferSelect;
export type FoodLogRow = typeof foodLog.$inferSelect;
export type BodyMetric = typeof bodyMetrics.$inferSelect;
export type CardioSession = typeof cardioSessions.$inferSelect;
export type LiftSession = typeof liftSessions.$inferSelect;
export type LiftSet = typeof liftSets.$inferSelect;
export type BloodMarker = typeof bloodMarkers.$inferSelect;
