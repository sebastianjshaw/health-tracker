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
  // true when `fiber` was AI-estimated (food logged without fiber data) rather
  // than measured/imported — lets the stats charts distinguish the two.
  fiberEstimated: integer("fiber_estimated", { mode: "boolean" }),
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
  // Wardley evolution: 'commodity' | 'product' | 'measured' | 'estimated'
  // (default calorie-confidence classification; drives the contingency uplift)
  evolution: text("evolution").notNull().default("commodity"),
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
  // the default only applies from this date onward; existing rows backfilled to
  // 2026-06-02, new ones to the day they were added.
  startDate: text("start_date").notNull().default("2026-06-02"),
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
  // per-serving snapshots of the secondary macros the library carries, so the
  // stats trends can be computed without re-joining (and stay history-stable)
  fiber: real("fiber"),
  // snapshot of foods.fiberEstimated — see that column
  fiberEstimated: integer("fiber_estimated", { mode: "boolean" }),
  saturatedFat: real("saturated_fat"),
  servingSize: real("serving_size").notNull().default(100),
  servingUnit: text("serving_unit").notNull().default("g"),
  source: text("source").notNull().default("manual"),
  // Wardley evolution snapshot — drives the per-entry contingency uplift
  evolution: text("evolution").notNull().default("commodity"),
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
  // Measured body composition from a Withings scale (null when only weight/
  // body-fat were recorded, or for manual/legacy entries). Lean mass here is the
  // scale's measured fat-free mass — preferred over the derived estimate.
  leanMassKg: real("lean_mass_kg"),
  muscleMassKg: real("muscle_mass_kg"),
  boneMassKg: real("bone_mass_kg"),
  hydrationKg: real("hydration_kg"),
  waistCm: real("waist_cm"),
  chestCm: real("chest_cm"),
  hipsCm: real("hips_cm"),
  restingHr: integer("resting_hr"),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [index("body_metrics_date_idx").on(t.date)]);

/** Per-day health status (healthy/unwell/injured/vacation). One row per date; only
 * non-default ('unwell'/'injured'/'vacation') days are stored, so the table stays sparse. */
export const dayHealth = sqliteTable("day_health", {
  date: text("date").primaryKey(),
  status: text("status").notNull().default("healthy"),
  createdAt: createdAt(),
});

export const cardioSessions = sqliteTable("cardio_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  // 'run' | 'bike' | 'row' | 'walk' | 'swim' | 'other'
  type: text("type").notNull().default("run"),
  durationMin: real("duration_min"),
  distanceKm: real("distance_km"),
  avgHr: integer("avg_hr"),
  // Richer per-session metrics, currently populated by the Strava import.
  maxHr: integer("max_hr"),
  elevationGainM: real("elevation_gain_m"),
  relativeEffort: integer("relative_effort"),
  // Google-encoded polyline (precision 5) of the GPS track, when one exists.
  // Stored for later map/elevation views — no renderer consumes it yet.
  gpsTrack: text("gps_track"),
  // Short title (e.g. the Strava activity name or a race name); `notes` is the
  // longer free-text description. Lets the UI show a heading + detail separately.
  name: text("name"),
  // JSON-encoded race/interval splits: { unit, rows: [{ label, cumulativeSec,
  // splitSec, paceSecPerKm, kmh }] }. Populated for races (official timing mats).
  splits: text("splits"),
  kcal: real("kcal"),
  notes: text("notes"),
  // ISO start time of the session (from the provider's interval, or set when
  // logged manually); drives the time-of-day shown in the activity list.
  startedAt: text("started_at"),
  // 'manual' | 'google-health' | 'fitbit' — and a provider id for import dedup
  source: text("source").notNull().default("manual"),
  externalId: text("external_id"),
  createdAt: createdAt(),
}, (t) => [
  index("cardio_sessions_date_idx").on(t.date),
  uniqueIndex("cardio_sessions_external_uidx").on(t.source, t.externalId),
]);

/** Passive daily movement (steps, distance) from the provider — separate from
 * deliberate cardio sessions. One row per local day; a full record we can use
 * for trends and (netted against logged sessions) energy expenditure. */
export const dailyActivity = sqliteTable("daily_activity", {
  date: text("date").primaryKey(), // local YYYY-MM-DD
  steps: integer("steps"),
  distanceKm: real("distance_km"),
  source: text("source").notNull().default("google-health"),
  createdAt: createdAt(),
});

/** Imported nightly sleep (one row per night), keyed to wake date. */
export const sleepSessions = sqliteTable("sleep_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD of wake
  start: text("start"), // ISO datetime
  end: text("end"), // ISO datetime
  durationMin: integer("duration_min").notNull(),
  deepMin: integer("deep_min"),
  remMin: integer("rem_min"),
  lightMin: integer("light_min"),
  awakeMin: integer("awake_min"),
  source: text("source").notNull().default("manual"),
  externalId: text("external_id"),
  createdAt: createdAt(),
}, (t) => [
  index("sleep_sessions_date_idx").on(t.date),
  uniqueIndex("sleep_sessions_external_uidx").on(t.source, t.externalId),
]);

/** Imported daily heart-rate summary (resting / min / max), one row per day. */
export const heartRateDaily = sqliteTable("heart_rate_daily", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  restingBpm: integer("resting_bpm"),
  minBpm: integer("min_bpm"),
  maxBpm: integer("max_bpm"),
  source: text("source").notNull().default("manual"),
  externalId: text("external_id"),
  createdAt: createdAt(),
}, (t) => [
  index("heart_rate_daily_date_idx").on(t.date),
  uniqueIndex("heart_rate_daily_external_uidx").on(t.source, t.externalId),
]);

/** Imported daily recovery metrics from a wearable (Fitbit → Google Health):
 * overnight HRV (RMSSD) and blood-oxygen (SpO₂). One row per local day. */
export const dailyHealthMetrics = sqliteTable("daily_health_metrics", {
  date: text("date").primaryKey(), // local YYYY-MM-DD
  hrvMs: real("hrv_ms"), // RMSSD, daily mean (ms)
  spo2: real("spo2"), // blood-oxygen, daily mean (%)
  spo2Min: real("spo2_min"), // daily minimum (%)
  source: text("source").notNull().default("google-health"),
  createdAt: createdAt(),
});

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

/** Free-form / historical strength entries that don't fit the 5×5 program
 * (arbitrary movements with aggregated sets/reps/weight) — kept separate from
 * lift_sets so program PRs/progression stay clean. Mostly the MyFitnessPal
 * import (source='mfp'); read-only "Past lifts" history. */
export const freeformLifts = sqliteTable("freeform_lifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD (local)
  exercise: text("exercise").notNull(),
  sets: integer("sets"),
  repsPerSet: integer("reps_per_set"),
  weightKg: real("weight_kg"),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [index("freeform_lifts_date_idx").on(t.date)]);

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
export type DayHealthRow = typeof dayHealth.$inferSelect;
export type CardioSession = typeof cardioSessions.$inferSelect;
export type SleepSession = typeof sleepSessions.$inferSelect;
export type HeartRateDay = typeof heartRateDaily.$inferSelect;
export type DailyHealthMetric = typeof dailyHealthMetrics.$inferSelect;
export type LiftSession = typeof liftSessions.$inferSelect;
export type LiftSet = typeof liftSets.$inferSelect;
export type BloodMarker = typeof bloodMarkers.$inferSelect;
