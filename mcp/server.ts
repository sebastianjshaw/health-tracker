#!/usr/bin/env node
/**
 * Health Tracker MCP server.
 *
 * A local stdio MCP server that lets Claude Desktop read and update your
 * Health Tracker data by talking directly to the same (Turso) database.
 *
 * Register it in claude_desktop_config.json — see mcp/README.md.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { asc, and, desc, eq, gte, inArray, isNotNull, like, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bloodMarkers,
  bodyMetrics,
  cardioSessions,
  dailyActivity,
  dailyHealthMetrics,
  dayHealth,
  foodLog,
  foods,
  heartRateDaily,
  liftSessions,
  liftSets,
  medicationCheckins,
  medicationDoses,
  recurringFoods,
  settings,
  sleepSessions,
} from "../db/schema";
import {
  APPETITE_LABELS,
  DEFAULT_CONTINGENCY,
  DEFAULT_LIFT_WEIGHTS,
  DEFAULT_TARGETS,
  EXERCISE_LABELS,
  Exercise,
  HEALTH_STATUSES,
  MED_CADENCE_DAYS,
  MED_DRUG_LABELS,
  SEVERITY_LABELS,
  SIDE_EFFECT_LABELS,
  contingencyMultiplier,
  evolutionForSource,
  injectionSiteLabel,
  type Contingency,
  type MedDrug,
  type SideEffect,
} from "../lib/constants";
import { addDays, todayISO } from "../lib/date";
import { inferCategory } from "../lib/food-category";
import { isReusableFoodMatch, normalizeFoodName } from "../lib/food-match";
import { foodLogSnapshot, portionAsSingleServing } from "../lib/food-snapshot";
import { ageFrom, bmi, bmiClass, waistToHeight } from "../lib/health";
import { estimateCardioKcal } from "../lib/cardio-calories";
import { parseSplits } from "../lib/splits";
import { estimateWaterMl, waterSourceOf } from "../lib/hydration";
import { totals as macroTotals } from "../lib/nutrition";
import {
  hideRecurringOnDate,
  materializeRecurringForDates,
  type AppDb,
} from "../lib/recurring-materialize";
import { targetForDate, type TargetEntry } from "../lib/targets";
import { predictWeights } from "../lib/weight-prediction";

// ---- db ----
const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const client = createClient(isRemote ? { url, authToken } : { url });
const db = drizzle(client) as AppDb;

/**
 * Find an existing library food to reuse for a portion, so we don't mint a new
 * row for every wording of the same item. Candidates are narrowed by a kcal
 * window in SQL, then filtered by isReusableFoodMatch (related name AND matching
 * per-serving nutrition — see lib/food-match). Prefers an exact-name match, then
 * the closest calories, then the oldest (lowest-id, most-established) food.
 */
async function findReusableFoodId(
  name: string,
  portion: { kcal: number; protein: number; carbs: number; fat: number },
): Promise<number | null> {
  const kcalTol = Math.max(8, portion.kcal * 0.05);
  const candidates = await db
    .select()
    .from(foods)
    .where(and(gte(foods.kcal, portion.kcal - kcalTol), lte(foods.kcal, portion.kcal + kcalTol)))
    .all();
  const target = normalizeFoodName(name);
  let bestId: number | null = null;
  let bestScore = Infinity;
  for (const f of candidates) {
    if (
      !isReusableFoodMatch(
        { name, ...portion },
        { name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
      )
    ) {
      continue;
    }
    const exactPenalty = normalizeFoodName(f.name) === target ? 0 : 1000;
    const score = exactPenalty + Math.abs(f.kcal - portion.kcal) + f.id / 1e9;
    if (score < bestScore) {
      bestScore = score;
      bestId = f.id;
    }
  }
  return bestId;
}

/** Ensure an MCP-logged food exists in the library (one serving = the portion
 *  eaten), reusing an existing matching library food where one exists. */
async function ensureMcpLibraryFood(opts: {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  saturatedFat?: number | null;
}): Promise<number> {
  const name = opts.name.trim();
  const serving = {
    ...portionAsSingleServing({
      kcal: opts.kcal,
      protein: opts.protein,
      carbs: opts.carbs,
      fat: opts.fat,
    }),
    fiber: opts.fiber ?? null,
    saturatedFat: opts.saturatedFat ?? null,
  };
  // Reuse a matching existing food (any source) rather than creating a duplicate.
  const reuseId = await findReusableFoodId(name, serving);
  if (reuseId != null) return reuseId;

  const [row] = await db
    .insert(foods)
    .values({
      name,
      ...serving,
      source: "mcp",
      category: inferCategory(serving.servingUnit, name),
      evolution: evolutionForSource("mcp"),
    })
    .returning({ id: foods.id });
  return row.id;
}

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const MEAL = z.enum(["breakfast", "lunch", "dinner", "snacks"]);

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

async function loadContingency(): Promise<Contingency> {
  const stored = await getSetting<Partial<Contingency>>("contingency", {});
  return { ...DEFAULT_CONTINGENCY, ...stored };
}

/** Effective-dated target history, ascending; seeded from the current target. */
async function loadTargetHistory(): Promise<TargetEntry[]> {
  const hist = await getSetting<TargetEntry[] | null>("targetHistory", null);
  if (hist && hist.length) return [...hist].sort((a, b) => a.from.localeCompare(b.from));
  const cur = await getSetting("targets", DEFAULT_TARGETS);
  return [{ from: "2000-01-01", kcal: cur.kcal, protein: cur.protein }];
}

type DayNutrition = {
  date: string;
  kcal: number; // contingency-adjusted, matching the app's displayed figure
  loggedKcal: number; // raw logged
  protein: number;
  fiber: number;
  satFat: number;
  water: number;
  waterWater: number;
  waterDrink: number;
  waterFood: number;
  targetKcal: number;
  targetProtein: number;
};

/** Per-day nutrition + hydration totals across an inclusive range (mirrors the
 * app's calorieSeriesRange, re-implemented here since that module is server-only). */
async function nutritionForRange(start: string, end: string): Promise<DayNutrition[]> {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  // Recurring defaults only apply from their startDate (recent); materialising
  // the whole range would build a huge IN(...) for dates that can't have one.
  const recStart = (
    await db.select({ d: sql<string>`min(${recurringFoods.startDate})` }).from(recurringFoods).get()
  )?.d;
  const matDates = recStart ? dates.filter((d) => d >= recStart) : [];
  if (matDates.length) await materializeRecurringForDates(db, matDates);
  const contingency = await loadContingency();
  const history = await loadTargetHistory();

  const rows = await db
    .select({
      date: foodLog.date,
      name: foodLog.name,
      quantity: foodLog.quantity,
      kcal: foodLog.kcal,
      protein: foodLog.protein,
      carbs: foodLog.carbs,
      fat: foodLog.fat,
      fiber: foodLog.fiber,
      saturatedFat: foodLog.saturatedFat,
      servingSize: foodLog.servingSize,
      servingUnit: foodLog.servingUnit,
      evolution: foodLog.evolution,
      category: foods.category,
    })
    .from(foodLog)
    .leftJoin(foods, eq(foodLog.foodId, foods.id))
    .where(and(gte(foodLog.date, start), lte(foodLog.date, end)))
    .all();

  type Acc = Omit<DayNutrition, "date" | "targetKcal" | "targetProtein">;
  const byDate = new Map<string, Acc>();
  for (const r of rows) {
    const a =
      byDate.get(r.date) ??
      {
        kcal: 0,
        loggedKcal: 0,
        protein: 0,
        fiber: 0,
        satFat: 0,
        water: 0,
        waterWater: 0,
        waterDrink: 0,
        waterFood: 0,
      };
    a.loggedKcal += r.kcal * r.quantity;
    a.kcal += r.kcal * r.quantity * contingencyMultiplier(r.evolution, contingency);
    a.protein += r.protein * r.quantity;
    a.fiber += (r.fiber ?? 0) * r.quantity;
    a.satFat += (r.saturatedFat ?? 0) * r.quantity;
    const we = {
      servingSize: r.servingSize,
      servingUnit: r.servingUnit,
      quantity: r.quantity,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      category: r.category,
      name: r.name,
    };
    const ml = estimateWaterMl(we);
    const src = waterSourceOf(we);
    a.water += ml;
    if (src === "water") a.waterWater += ml;
    else if (src === "drink") a.waterDrink += ml;
    else a.waterFood += ml;
    byDate.set(r.date, a);
  }

  return dates.map((date) => {
    const a = byDate.get(date);
    const t = targetForDate(history, date);
    return {
      date,
      kcal: Math.round(a?.kcal ?? 0),
      loggedKcal: Math.round(a?.loggedKcal ?? 0),
      protein: Math.round(a?.protein ?? 0),
      fiber: Math.round(a?.fiber ?? 0),
      satFat: Math.round(a?.satFat ?? 0),
      water: Math.round(a?.water ?? 0),
      waterWater: Math.round(a?.waterWater ?? 0),
      waterDrink: Math.round(a?.waterDrink ?? 0),
      waterFood: Math.round(a?.waterFood ?? 0),
      targetKcal: t.kcal,
      targetProtein: t.protein,
    };
  });
}

const server = new McpServer({ name: "health-tracker", version: "1.0.0" });

server.tool(
  "get_day",
  "Full picture for a date (default today): food entries plus nutrition totals (calories — both raw-logged and the contingency-adjusted figure the app judges you on — protein, carbs, fat, fiber, saturated fat), estimated hydration split by source (water / other drinks / food), passive activity (background-counted steps & distance, separate from logged cardio sessions; null when none synced), that day's effective calorie & protein target, the logged health status (healthy/unwell/injured/vacation), and any body measurements taken that day (weight, body-fat %, waist/chest/hips/neck cm, resting HR). Each food entry's kcal/protein/carbs/fat/fiber/saturatedFat are the ACTUAL amounts eaten for that entry (the per-serving value already multiplied by its quantity), so entries sum to totals — do NOT multiply them by quantity again.",
  { date: ISO.optional() },
  async ({ date }) => {
    const d = date ?? todayISO();
    const [day] = await nutritionForRange(d, d); // materialises recurring + aggregates
    const logged = await db.select().from(foodLog).where(eq(foodLog.date, d)).all();
    const healthRow = await db.select().from(dayHealth).where(eq(dayHealth.date, d)).get();
    const activityRow = await db
      .select()
      .from(dailyActivity)
      .where(eq(dailyActivity.date, d))
      .get();
    const bodyRow = await db
      .select()
      .from(bodyMetrics)
      .where(eq(bodyMetrics.date, d))
      .orderBy(desc(bodyMetrics.id))
      .get();

    // Totals sum each row's per-serving macros × its quantity.
    const macros = macroTotals(logged);

    // Per-entry macros are the ACTUAL amount eaten for that entry — i.e. the
    // stored per-serving figure already multiplied by `quantity` — so they sum
    // to `totals` and never need scaling by the reader. `quantity`/`servingSize`
    // are kept for context only.
    const g1 = (n: number) => Math.round(n * 10) / 10;
    const entries = logged.map((r) => ({
      id: r.id,
      meal: r.meal,
      name: r.name,
      quantity: r.quantity,
      kcal: Math.round(r.kcal * r.quantity),
      protein: g1(r.protein * r.quantity),
      carbs: g1(r.carbs * r.quantity),
      fat: g1(r.fat * r.quantity),
      fiber: r.fiber == null ? undefined : g1(r.fiber * r.quantity),
      saturatedFat: r.saturatedFat == null ? undefined : g1(r.saturatedFat * r.quantity),
      source: r.source,
      recurring: r.recurringId != null,
    }));

    return text(
      JSON.stringify(
        {
          date: d,
          healthStatus: healthRow?.status ?? "healthy",
          target: { kcal: day.targetKcal, protein: day.targetProtein },
          totals: {
            kcal: day.kcal, // contingency-adjusted (what the app shows)
            loggedKcal: day.loggedKcal, // raw logged, before the uplift
            protein: Math.round(macros.protein),
            carbs: Math.round(macros.carbs),
            fat: Math.round(macros.fat),
            fiber: day.fiber,
            saturatedFat: day.satFat,
          },
          hydrationMl: {
            total: day.water,
            water: day.waterWater,
            otherDrinks: day.waterDrink,
            fromFood: day.waterFood,
          },
          activity: activityRow
            ? { steps: activityRow.steps ?? 0, distanceKm: activityRow.distanceKm ?? 0 }
            : null, // passive steps/distance (background-counted); null = none synced
          // Body weight / composition / tape measurements logged that day; null = none.
          measurements: bodyRow
            ? {
                weightKg: bodyRow.weightKg ?? undefined,
                bodyFatPct: bodyRow.bodyFatPct ?? undefined,
                waistCm: bodyRow.waistCm ?? undefined,
                chestCm: bodyRow.chestCm ?? undefined,
                hipsCm: bodyRow.hipsCm ?? undefined,
                neckCm: bodyRow.neckCm ?? undefined,
                restingHr: bodyRow.restingHr ?? undefined,
              }
            : null,
          entries,
        },
        null,
        2,
      ),
    );
  },
);

server.tool(
  "search_foods",
  "Search the food library by name or brand. Returns matching foods with their per-serving nutrition and id.",
  { query: z.string().optional() },
  async ({ query }) => {
    const rows = query
      ? await db
          .select()
          .from(foods)
          .where(like(foods.name, `%${query}%`))
          .limit(25)
          .all()
      : await db.select().from(foods).orderBy(desc(foods.createdAt)).limit(25).all();
    return text(
      JSON.stringify(
        rows.map((f) => ({
          id: f.id,
          name: f.name,
          brand: f.brand,
          servingSize: f.servingSize,
          servingUnit: f.servingUnit,
          kcal: f.kcal,
          protein: f.protein,
          carbs: f.carbs,
          fat: f.fat,
        })),
        null,
        2,
      ),
    );
  },
);

server.tool(
  "log_food",
  "Add a free-text food entry to a day's meal. kcal/protein/carbs/fat (and optional fiber/saturatedFat) are the ABSOLUTE TOTALS in grams for the whole portion eaten — already account for the amount, do NOT pass per-unit values or a multiplier. Include fiber and saturatedFat when known so the daily fiber/sat-fat trends are accurate.",
  {
    date: ISO.optional(),
    meal: MEAL,
    name: z.string(),
    kcal: z.number(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
    fiber: z.number().optional(),
    saturatedFat: z.number().optional(),
  },
  async ({ date, meal, name, kcal, protein, carbs, fat, fiber, saturatedFat }) => {
    const d = date ?? todayISO();
    const foodId = await ensureMcpLibraryFood({
      name,
      kcal,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fat: fat ?? 0,
      fiber: fiber ?? null,
      saturatedFat: saturatedFat ?? null,
    });
    const food = await db.select().from(foods).where(eq(foods.id, foodId)).get();
    if (!food) return text(`Failed to save "${name}".`);
    await db.insert(foodLog).values(foodLogSnapshot(food, { date: d, meal, quantity: 1 }));
    // When an existing library food was reused, its name/nutrition win — report
    // that so the difference from the requested wording is transparent.
    const reused = food.name.trim().toLowerCase() !== name.trim().toLowerCase();
    return text(
      reused
        ? `Logged "${food.name}" to ${meal} on ${d} (${Math.round(food.kcal)} kcal) — matched an existing library food for "${name}".`
        : `Logged "${food.name}" to ${meal} on ${d} (${Math.round(food.kcal)} kcal).`,
    );
  },
);

server.tool(
  "delete_food_entry",
  "Delete a food entry by its id (from get_day). Recurring defaults are hidden for that day.",
  { id: z.number() },
  async ({ id }) => {
    const row = await db.select().from(foodLog).where(eq(foodLog.id, id)).get();
    if (!row) return text(`No food entry with id ${id}.`);
    if (row.recurringId != null) {
      await hideRecurringOnDate(db, row.date, row.recurringId);
    } else {
      await db.delete(foodLog).where(eq(foodLog.id, id));
    }
    return text(`Deleted "${row.name}" from ${row.meal} on ${row.date}.`);
  },
);

server.tool(
  "update_food_entry",
  "Edit fields on an already-logged food entry by its id (from get_day) — e.g. backfill fiber/saturatedFat on an older entry, or correct a macro. Only the fields you pass change. Values are the per-serving figures stored on the entry; for free-text entries (quantity 1) that's the whole portion. Works on recurring-default entries too (edits just that day's instance).",
  {
    id: z.number(),
    meal: MEAL.optional(),
    name: z.string().optional(),
    quantity: z.number().optional(),
    kcal: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
    fiber: z.number().optional(),
    saturatedFat: z.number().optional(),
  },
  async ({ id, meal, name, quantity, kcal, protein, carbs, fat, fiber, saturatedFat }) => {
    const row = await db.select().from(foodLog).where(eq(foodLog.id, id)).get();
    if (!row) return text(`No food entry with id ${id}.`);

    const set: Partial<typeof foodLog.$inferInsert> = {};
    if (meal !== undefined) set.meal = meal;
    if (name !== undefined) set.name = name;
    if (quantity !== undefined) set.quantity = quantity;
    if (kcal !== undefined) set.kcal = kcal;
    if (protein !== undefined) set.protein = protein;
    if (carbs !== undefined) set.carbs = carbs;
    if (fat !== undefined) set.fat = fat;
    if (fiber !== undefined) set.fiber = fiber;
    if (saturatedFat !== undefined) set.saturatedFat = saturatedFat;

    const fields = Object.keys(set);
    if (fields.length === 0) return text("Nothing to update — pass at least one field to change.");

    await db.update(foodLog).set(set).where(eq(foodLog.id, id));
    return text(`Updated "${row.name}" on ${row.date}: ${fields.join(", ")}.`);
  },
);

server.tool(
  "add_food_from_library",
  "Add an existing library food (by id from search_foods) to a day's meal.",
  { date: ISO.optional(), meal: MEAL, foodId: z.number(), quantity: z.number().optional() },
  async ({ date, meal, foodId, quantity }) => {
    const d = date ?? todayISO();
    const food = await db.select().from(foods).where(eq(foods.id, foodId)).get();
    if (!food) return text(`No food with id ${foodId}.`);
    await db
      .insert(foodLog)
      .values(foodLogSnapshot(food, { date: d, meal, quantity: quantity ?? 1 }));
    return text(`Added ${quantity ?? 1}× ${food.name} to ${meal} on ${d}.`);
  },
);

server.tool(
  "create_library_food",
  "Create a reusable food in the library WITHOUT logging it to any day (use add_food_from_library to log it later, or log_food to create-and-log in one step). Unlike log_food, all nutrition values are PER SERVING — i.e. for one serving of `servingSize` `servingUnit` (default 100 g) — not the whole portion eaten. If a matching food already exists it is reused rather than duplicated. Returns the food id.",
  {
    name: z.string(),
    brand: z.string().optional(),
    barcode: z.string().optional(),
    servingSize: z.number().optional(),
    servingUnit: z.string().optional(),
    kcal: z.number(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
    fiber: z.number().optional(),
    saturatedFat: z.number().optional(),
    sugar: z.number().optional(),
    salt: z.number().optional(),
    sodium: z.number().optional(),
    category: z.enum(["food", "drink", "other"]).optional(),
    evolution: z.enum(["commodity", "product", "measured", "estimated"]).optional(),
  },
  async ({
    name,
    brand,
    barcode,
    servingSize,
    servingUnit,
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    saturatedFat,
    sugar,
    salt,
    sodium,
    category,
    evolution,
  }) => {
    const cleanName = name.trim();
    if (!cleanName) return text("Name is required.");
    const portion = { kcal, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };

    // Don't duplicate a food already in the library (same name + matching macros).
    const reuseId = await findReusableFoodId(cleanName, portion);
    if (reuseId != null) {
      const existing = await db.select().from(foods).where(eq(foods.id, reuseId)).get();
      return text(
        `"${cleanName}" already matches library food #${reuseId} ("${existing?.name}") — reusing it instead of adding a duplicate.`,
      );
    }

    const unit = servingUnit?.trim() || "g";
    const [row] = await db
      .insert(foods)
      .values({
        name: cleanName,
        brand: brand?.trim() || null,
        barcode: barcode?.trim() || null,
        servingSize: servingSize ?? 100,
        servingUnit: unit,
        ...portion,
        fiber: fiber ?? null,
        // An explicitly-passed fiber value is treated as measured, not AI-estimated.
        fiberEstimated: fiber != null ? false : null,
        saturatedFat: saturatedFat ?? null,
        sugar: sugar ?? null,
        salt: salt ?? null,
        sodium: sodium ?? null,
        source: "mcp",
        category: category ?? inferCategory(unit, cleanName),
        evolution: evolution ?? evolutionForSource("mcp"),
      })
      .returning({ id: foods.id });
    return text(
      `Added "${cleanName}" to the library as food #${row.id} (${Math.round(kcal)} kcal per ${servingSize ?? 100} ${unit}). Use add_food_from_library with foodId ${row.id} to log it to a day.`,
    );
  },
);

server.tool(
  "log_weight",
  "Record a body weight / vitals / tape measurement (weight, body-fat %, resting HR, and waist/chest/hips/neck circumference in cm). Merges into the day's existing row — one row per date — so weight and circumferences can be logged in separate calls without creating duplicates; only the fields you pass change. Defaults to today.",
  {
    date: ISO.optional(),
    weightKg: z.number().optional(),
    bodyFatPct: z.number().optional(),
    waistCm: z.number().optional(),
    chestCm: z.number().optional(),
    hipsCm: z.number().optional(),
    neckCm: z.number().optional(),
    restingHr: z.number().optional(),
    notes: z.string().optional(),
  },
  async ({ date, weightKg, bodyFatPct, waistCm, chestCm, hipsCm, neckCm, restingHr, notes }) => {
    const d = date ?? todayISO();
    const existing = await db
      .select()
      .from(bodyMetrics)
      .where(eq(bodyMetrics.date, d))
      .orderBy(desc(bodyMetrics.id))
      .get();
    if (existing) {
      // Coalesce: keep the prior value where this call doesn't supply one (mirrors the app's logBody).
      await db
        .update(bodyMetrics)
        .set({
          weightKg: weightKg ?? existing.weightKg,
          bodyFatPct: bodyFatPct ?? existing.bodyFatPct,
          waistCm: waistCm ?? existing.waistCm,
          chestCm: chestCm ?? existing.chestCm,
          hipsCm: hipsCm ?? existing.hipsCm,
          neckCm: neckCm ?? existing.neckCm,
          restingHr: restingHr ?? existing.restingHr,
          notes: notes ?? existing.notes,
        })
        .where(eq(bodyMetrics.id, existing.id));
    } else {
      await db.insert(bodyMetrics).values({
        date: d,
        weightKg: weightKg ?? null,
        bodyFatPct: bodyFatPct ?? null,
        waistCm: waistCm ?? null,
        chestCm: chestCm ?? null,
        hipsCm: hipsCm ?? null,
        neckCm: neckCm ?? null,
        restingHr: restingHr ?? null,
        notes: notes ?? null,
      });
    }
    const parts = [
      weightKg != null && `${weightKg} kg`,
      bodyFatPct != null && `${bodyFatPct}% bf`,
      waistCm != null && `waist ${waistCm}cm`,
      chestCm != null && `chest ${chestCm}cm`,
      hipsCm != null && `hips ${hipsCm}cm`,
      neckCm != null && `neck ${neckCm}cm`,
    ].filter(Boolean);
    return text(`Logged measurement on ${d}${parts.length ? ` (${parts.join(", ")})` : ""}.`);
  },
);

server.tool(
  "get_weight_trend",
  "Body weight (newest first) plus goal distance and an energy-balance PREDICTION per weigh-in: what weight the logged food (contingency-adjusted) and exercise imply, vs the actual measured weight. A persistent gap means logging/contingency is off — predicted above actual = losing faster than logs suggest (under-reported intake); below = the reverse. Returns the most recent `limit` weigh-ins by default; the `coverage` field reports the TRUE full span (history can go back many years), and pass `from` (YYYY-MM-DD) to pull everything since a date for older analysis. Each weigh-in also carries any tape measurements taken that day (waist/chest/hips/neck cm) — useful for tracking recomposition when scale weight is flat.",
  { limit: z.number().optional(), from: ISO.optional() },
  async ({ limit, from }) => {
    // True extent of the data, independent of the returned slice, so callers
    // never mistake the oldest returned row for the start of history.
    const cov = await db
      .select({
        earliest: sql<string>`min(${bodyMetrics.date})`,
        latest: sql<string>`max(${bodyMetrics.date})`,
        count: sql<number>`count(*)`,
      })
      .from(bodyMetrics)
      .where(isNotNull(bodyMetrics.weightKg))
      .get();
    const coverage = { earliest: cov?.earliest ?? null, latest: cov?.latest ?? null, count: cov?.count ?? 0 };

    const where = from
      ? and(isNotNull(bodyMetrics.weightKg), gte(bodyMetrics.date, from))
      : isNotNull(bodyMetrics.weightKg);
    const base = db.select().from(bodyMetrics).where(where).orderBy(desc(bodyMetrics.date));
    const rows = await (from ? base : base.limit(limit ?? 30)).all();

    const goalWeight = await getSetting<number | null>("goalWeight", null);
    const heightCm = (await getSetting<{ heightCm: number | null }>("profile", { heightCm: null })).heightCm;
    const latest = rows[0]?.weightKg ?? null;

    // Predict over the span of the returned weigh-ins (oldest → newest).
    const weighIns = [...rows]
      .reverse()
      .map((r) => ({ date: r.date, weight: r.weightKg as number }));
    let predictions: ReturnType<typeof predictWeights> = [];
    // Predictions need a per-day nutrition+cardio scan over the span; skip it for
    // very long pulls (e.g. a multi-year `from`) where it'd be heavy and isn't
    // the point — the raw weigh-ins + coverage are what matter there.
    const spanDays =
      weighIns.length >= 2
        ? (Date.parse(weighIns[weighIns.length - 1].date) - Date.parse(weighIns[0].date)) / 864e5
        : 0;
    if (weighIns.length >= 2 && spanDays <= 400) {
      const start = weighIns[0].date;
      const end = weighIns[weighIns.length - 1].date;
      const nut = await nutritionForRange(start, end);
      const intakeByDate = new Map(nut.map((n) => [n.date, n.kcal]));
      const cardioRows = await db
        .select({ date: cardioSessions.date, kcal: cardioSessions.kcal })
        .from(cardioSessions)
        .where(and(gte(cardioSessions.date, start), lte(cardioSessions.date, end)))
        .all();
      const cardioByDate = new Map<string, number>();
      for (const c of cardioRows) {
        if (c.kcal == null) continue;
        cardioByDate.set(c.date, (cardioByDate.get(c.date) ?? 0) + c.kcal);
      }
      const profile = await getSetting<{ heightCm: number | null; dob: string; sex: string }>(
        "profile",
        { heightCm: null, dob: "", sex: "" },
      );
      predictions = predictWeights({
        weighIns,
        intakeByDate,
        cardioByDate,
        heightCm: profile.heightCm,
        age: profile.dob ? ageFrom(profile.dob) : null,
        sex: profile.sex,
      });
    }

    return text(
      JSON.stringify(
        {
          // Full extent of the weight history (NOT just the returned slice). If
          // `returned` < coverage.count, older weigh-ins exist — pass `from` to fetch them.
          coverage,
          returned: rows.length,
          goalWeight,
          toGoalKg:
            latest != null && goalWeight != null
              ? Math.round((latest - goalWeight) * 10) / 10
              : null,
          weights: rows.map((r) => ({
            id: r.id,
            date: r.date,
            weightKg: r.weightKg,
            bodyFatPct: r.bodyFatPct,
            // Derived: BMI (weight+height) and waist-to-height ratio (healthy < 0.5).
            bmi: r.weightKg != null ? bmi(r.weightKg, heightCm) : null,
            waistToHeight: waistToHeight(r.waistCm ?? null, heightCm) ?? undefined,
            // Tape measurements (cm); omitted when not recorded that day.
            waistCm: r.waistCm ?? undefined,
            chestCm: r.chestCm ?? undefined,
            hipsCm: r.hipsCm ?? undefined,
            neckCm: r.neckCm ?? undefined,
            // Scale-measured composition (Withings); null on manual/legacy days.
            leanMassKg: r.leanMassKg,
            muscleMassKg: r.muscleMassKg,
            boneMassKg: r.boneMassKg,
          })),
          predictions,
        },
        null,
        2,
      ),
    );
  },
);

server.tool(
  "get_activity_trend",
  "Passive daily movement (background-counted steps & distance, separate from logged cardio sessions) over the last N days (default 30), newest first, with averages and the count of days actually synced. Use for walking/step-count trends; for a single day use get_day, and for deliberate workouts use get_cardio.",
  { days: z.number().optional() },
  async ({ days }) => {
    const n = days ?? 30;
    const start = addDays(todayISO(), -(n - 1));
    const rows = await db
      .select()
      .from(dailyActivity)
      .where(gte(dailyActivity.date, start))
      .orderBy(desc(dailyActivity.date))
      .all();

    const daysWithData = rows.filter((r) => (r.steps ?? 0) > 0).length;
    const totalSteps = rows.reduce((s, r) => s + (r.steps ?? 0), 0);
    const totalKm = rows.reduce((s, r) => s + (r.distanceKm ?? 0), 0);

    return text(
      JSON.stringify(
        {
          days: rows.map((r) => ({
            date: r.date,
            steps: r.steps ?? 0,
            distanceKm: r.distanceKm ?? 0,
          })),
          daysSynced: daysWithData,
          avgSteps: daysWithData ? Math.round(totalSteps / daysWithData) : 0,
          avgDistanceKm: daysWithData ? Math.round((totalKm / daysWithData) * 10) / 10 : 0,
        },
        null,
        2,
      ),
    );
  },
);

server.tool(
  "log_bloodwork",
  "Record a dated set of blood/lab biomarker results.",
  {
    date: ISO,
    clinic: z.string().optional(),
    markers: z
      .array(
        z.object({
          marker: z.string(),
          value: z.number(),
          unit: z.string().optional(),
          refLow: z.number().optional(),
          refHigh: z.number().optional(),
          category: z.string().optional(),
        }),
      )
      .min(1),
  },
  async ({ date, clinic, markers }) => {
    await db.insert(bloodMarkers).values(
      markers.map((m) => ({
        date,
        marker: m.marker,
        value: m.value,
        unit: m.unit ?? "",
        refLow: m.refLow ?? null,
        refHigh: m.refHigh ?? null,
        category: m.category ?? null,
        clinic: clinic ?? null,
      })),
    );
    return text(`Saved ${markers.length} marker(s) for ${date}.`);
  },
);

server.tool(
  "get_bloodwork",
  "Get all recorded blood/lab results, newest first.",
  {},
  async () => {
    const rows = await db
      .select()
      .from(bloodMarkers)
      .orderBy(desc(bloodMarkers.date), asc(bloodMarkers.category))
      .all();
    return text(JSON.stringify(rows, null, 2));
  },
);

/** Load lift sets for a set of session ids, grouped by session. */
async function liftSetsBySession(
  sessionIds: number[],
): Promise<Map<number, (typeof liftSets.$inferSelect)[]>> {
  const bySession = new Map<number, (typeof liftSets.$inferSelect)[]>();
  if (sessionIds.length === 0) return bySession;
  const sets = await db
    .select()
    .from(liftSets)
    .where(inArray(liftSets.sessionId, sessionIds))
    .all();
  for (const st of sets) {
    const arr = bySession.get(st.sessionId);
    if (arr) arr.push(st);
    else bySession.set(st.sessionId, [st]);
  }
  return bySession;
}

server.tool(
  "get_workouts",
  "Recent Seblifts 5x5 strength workouts, newest first. Each session lists its exercises with the working weight (kg) and the reps logged per set (5 = hit target, 0 = not done). Defaults to the last 20 sessions.",
  { limit: z.number().optional() },
  async ({ limit }) => {
    const sessions = await db
      .select()
      .from(liftSessions)
      .orderBy(desc(liftSessions.date), desc(liftSessions.id))
      .limit(limit ?? 20)
      .all();
    const bySession = await liftSetsBySession(sessions.map((s) => s.id));

    const out = sessions.map((s) => {
      const sets = (bySession.get(s.id) ?? []).slice().sort((a, b) => a.setNumber - b.setNumber);
      const byExercise = new Map<string, { weightKg: number; reps: (number | null)[] }>();
      for (const st of sets) {
        const e = byExercise.get(st.exercise) ?? { weightKg: st.targetWeightKg, reps: [] };
        e.weightKg = st.targetWeightKg;
        e.reps.push(st.repsDone);
        byExercise.set(st.exercise, e);
      }
      return {
        date: s.date,
        workout: s.workout,
        notes: s.notes ?? undefined,
        exercises: [...byExercise.entries()].map(([exercise, v]) => ({
          exercise,
          label: EXERCISE_LABELS[exercise as Exercise] ?? exercise,
          weightKg: v.weightKg,
          reps: v.reps,
        })),
      };
    });
    return text(JSON.stringify(out, null, 2));
  },
);

server.tool(
  "get_lift_progression",
  "Per-exercise strength progression: the top working weight (kg) at each session over time (oldest first), plus the current working weights used for the next workout.",
  {},
  async () => {
    const sessions = await db
      .select()
      .from(liftSessions)
      .orderBy(asc(liftSessions.date), asc(liftSessions.id))
      .all();
    const bySession = await liftSetsBySession(sessions.map((s) => s.id));

    const progression: Record<string, { date: string; weightKg: number }[]> = {};
    for (const s of sessions) {
      const top = new Map<string, number>();
      for (const st of bySession.get(s.id) ?? []) {
        top.set(st.exercise, Math.max(top.get(st.exercise) ?? 0, st.targetWeightKg));
      }
      for (const [exercise, weightKg] of top) {
        (progression[exercise] ??= []).push({ date: s.date, weightKg });
      }
    }

    const current = await getSetting("liftWeights", DEFAULT_LIFT_WEIGHTS);
    return text(JSON.stringify({ current, progression }, null, 2));
  },
);

server.tool(
  "get_cardio",
  "Cardio sessions (run/bike/row/walk/swim/other), newest first. Returns the most recent `limit` (default 30); `coverage` reports the TRUE full span (history can go back years), and pass `from` (YYYY-MM-DD) to fetch everything since a date.",
  { limit: z.number().optional(), from: ISO.optional() },
  async ({ limit, from }) => {
    const cov = await db
      .select({
        earliest: sql<string>`min(${cardioSessions.date})`,
        latest: sql<string>`max(${cardioSessions.date})`,
        count: sql<number>`count(*)`,
      })
      .from(cardioSessions)
      .get();
    const coverage = { earliest: cov?.earliest ?? null, latest: cov?.latest ?? null, count: cov?.count ?? 0 };

    const base = db
      .select()
      .from(cardioSessions)
      .where(from ? gte(cardioSessions.date, from) : undefined)
      .orderBy(desc(cardioSessions.date), desc(cardioSessions.id));
    const rows = await (from ? base : base.limit(limit ?? 30)).all();
    return text(
      JSON.stringify(
        {
          coverage,
          returned: rows.length,
          sessions: rows.map((r) => ({
            id: r.id,
            date: r.date,
            startedAt: r.startedAt ?? undefined,
            type: r.type,
            name: r.name ?? undefined,
            durationMin: r.durationMin,
            distanceKm: r.distanceKm,
            avgHr: r.avgHr,
            maxHr: r.maxHr ?? undefined,
            elevationGainM: r.elevationGainM ?? undefined,
            relativeEffort: r.relativeEffort ?? undefined,
            kcal: r.kcal,
            source: r.source,
            notes: r.notes ?? undefined,
            splits: r.splits ? parseSplits(r.splits) : undefined,
            hasGpsTrack: r.gpsTrack ? true : undefined,
          })),
        },
        null,
        2,
      ),
    );
  },
);

server.tool(
  "get_sleep",
  "Recent nightly sleep sessions (duration + stage minutes), newest first. Defaults to the last 30.",
  { limit: z.number().optional() },
  async ({ limit }) => {
    const rows = await db
      .select()
      .from(sleepSessions)
      .orderBy(desc(sleepSessions.date), desc(sleepSessions.id))
      .limit(limit ?? 30)
      .all();
    return text(
      JSON.stringify(
        rows.map((r) => ({
          date: r.date,
          durationMin: r.durationMin,
          deepMin: r.deepMin,
          remMin: r.remMin,
          lightMin: r.lightMin,
          awakeMin: r.awakeMin,
          source: r.source,
        })),
        null,
        2,
      ),
    );
  },
);

server.tool(
  "get_heart_rate",
  "Recent daily heart-rate summary (resting/min/max bpm), newest first. Defaults to the last 30 days.",
  { limit: z.number().optional() },
  async ({ limit }) => {
    const rows = await db
      .select()
      .from(heartRateDaily)
      .orderBy(desc(heartRateDaily.date), desc(heartRateDaily.id))
      .limit(limit ?? 30)
      .all();
    return text(
      JSON.stringify(
        rows.map((r) => ({
          date: r.date,
          restingBpm: r.restingBpm,
          minBpm: r.minBpm,
          maxBpm: r.maxBpm,
          source: r.source,
        })),
        null,
        2,
      ),
    );
  },
);

server.tool(
  "get_goals",
  "Get daily goals: current calorie & protein targets, goal weight, meal calorie split, and the effective-dated target history (targets are versioned, so a past day was judged against the target valid then — not the current one).",
  {},
  async () => {
    const targets = await getSetting("targets", DEFAULT_TARGETS);
    const goalWeight = await getSetting<number | null>("goalWeight", null);
    const mealSplit = await getSetting("mealSplit", {
      breakfast: 25,
      lunch: 30,
      dinner: 35,
      snacks: 10,
    });
    const targetHistory = await loadTargetHistory();
    return text(JSON.stringify({ targets, goalWeight, mealSplit, targetHistory }, null, 2));
  },
);

server.tool(
  "get_nutrition_trend",
  "Daily nutrition & hydration over a period: per day the contingency-adjusted calories vs that day's effective target, protein, fiber, saturated fat, and estimated water (split by source), with averages and adherence counts. Defaults to the last N days (default 30, max 365); pass `from` (YYYY-MM-DD) to analyse older history instead — the `coverage` field reports the TRUE span (logging can go back years). Use for weekly/period coaching, not single-day questions (use get_day).",
  { days: z.number().optional(), from: ISO.optional() },
  async ({ days, from }) => {
    const today = todayISO();
    // True extent of logged food, so callers know history beyond the slice exists.
    const cov = await db
      .select({
        earliest: sql<string>`min(${foodLog.date})`,
        latest: sql<string>`max(${foodLog.date})`,
        daysLogged: sql<number>`count(distinct ${foodLog.date})`,
      })
      .from(foodLog)
      .get();
    const coverage = { earliest: cov?.earliest ?? null, latest: cov?.latest ?? null, daysLogged: cov?.daysLogged ?? 0 };

    const start = from ?? addDays(today, -(Math.max(1, Math.min(days ?? 30, 365)) - 1));
    const full = await nutritionForRange(start, today);
    // For long historical pulls, return only logged days to keep the payload sane.
    const longPull = !!from && (Date.parse(today) - Date.parse(start)) / 864e5 > 400;
    const series = longPull ? full.filter((s) => s.loggedKcal > 0) : full;
    const logged = full.filter((s) => s.loggedKcal > 0);
    const avg = (sel: (s: DayNutrition) => number) =>
      logged.length ? Math.round(logged.reduce((a, s) => a + sel(s), 0) / logged.length) : 0;
    const summary = {
      daysLogged: logged.length,
      avgKcal: avg((s) => s.kcal),
      avgProtein: avg((s) => s.protein),
      avgFiber: avg((s) => s.fiber),
      avgSatFat: avg((s) => s.satFat),
      avgWaterMl: avg((s) => s.water),
      daysAtOrUnderKcalTarget: logged.filter((s) => s.kcal <= s.targetKcal).length,
      daysHitProteinTarget: logged.filter((s) => s.protein >= s.targetProtein).length,
    };
    return text(JSON.stringify({ coverage, range: { from: start, to: today }, summary, series }, null, 2));
  },
);

server.tool(
  "get_health_status",
  "Days flagged unwell, injured or on vacation over the last N days (default 30) — context for dips (or changes) in training, appetite or weight. Healthy days are omitted.",
  { days: z.number().optional() },
  async ({ days }) => {
    const n = Math.max(1, Math.min(days ?? 30, 365));
    const today = todayISO();
    const start = addDays(today, -(n - 1));
    const rows = await db
      .select()
      .from(dayHealth)
      .where(and(gte(dayHealth.date, start), lte(dayHealth.date, today)))
      .orderBy(desc(dayHealth.date))
      .all();
    const flagged = rows.filter((r) => r.status && r.status !== "healthy");
    return text(
      JSON.stringify(
        {
          rangeDays: n,
          unwellDays: flagged.filter((r) => r.status === "unwell").length,
          injuredDays: flagged.filter((r) => r.status === "injured").length,
          vacationDays: flagged.filter((r) => r.status === "vacation").length,
          days: flagged.map((r) => ({ date: r.date, status: r.status })),
        },
        null,
        2,
      ),
    );
  },
);

server.tool(
  "get_medication",
  "GLP-1 medication (Mounjaro/tirzepatide, Ozempic/semaglutide) history — essential context for assessing weight, appetite, calorie intake and side effects, since the drug is a major driver of all of them. Returns: current drug + dose, weeks on therapy, the full dose-escalation (titration) schedule, when the next weekly injection is due, and recent daily check-ins (appetite 1–5 and side-effect severities). `checkinDays` bounds the check-in window (default 90).",
  { checkinDays: z.number().optional() },
  async ({ checkinDays }) => {
    const today = todayISO();
    const doses = await db.select().from(medicationDoses).orderBy(desc(medicationDoses.date), desc(medicationDoses.id)).all();
    const drugLabel = (d: string) => MED_DRUG_LABELS[d as MedDrug] ?? d;

    if (doses.length === 0) {
      return text(JSON.stringify({ onTherapy: false, note: "No GLP-1 injections logged." }, null, 2));
    }

    const latest = doses[0];
    const first = doses[doses.length - 1];
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
    const dueDate = addDays(latest.date, MED_CADENCE_DAYS);
    const until = dayDiff(today, dueDate);
    const nextDoseStatus = until === 0 ? "due today" : until > 0 ? `due in ${until} day(s)` : `overdue by ${-until} day(s)`;

    const n = Math.max(1, Math.min(checkinDays ?? 90, 365));
    const checkinRows = await db
      .select()
      .from(medicationCheckins)
      .where(and(gte(medicationCheckins.date, addDays(today, -(n - 1))), lte(medicationCheckins.date, today)))
      .orderBy(desc(medicationCheckins.date))
      .all();
    const parseSideEffects = (json: string | null) => {
      if (!json) return [] as { effect: string; severity: string }[];
      try {
        const arr = JSON.parse(json) as { type: string; severity: number }[];
        return (Array.isArray(arr) ? arr : []).map((s) => ({
          effect: SIDE_EFFECT_LABELS[s.type as SideEffect] ?? s.type,
          severity: SEVERITY_LABELS[s.severity] ?? String(s.severity),
        }));
      } catch {
        return [];
      }
    };

    return text(
      JSON.stringify(
        {
          onTherapy: true,
          currentDrug: drugLabel(latest.drug),
          currentDoseMg: latest.doseMg,
          firstDose: first.date,
          weeksOnTherapy: Math.max(1, Math.round(dayDiff(first.date, today) / 7)),
          totalDoses: doses.length,
          lastDose: { date: latest.date, doseMg: latest.doseMg, site: injectionSiteLabel(latest.site) },
          nextDoseDue: dueDate,
          nextDoseStatus,
          // Titration history (oldest → newest) so dose escalation can be tracked against response.
          doseHistory: [...doses]
            .reverse()
            .map((d) => ({ id: d.id, date: d.date, drug: drugLabel(d.drug), doseMg: d.doseMg, site: injectionSiteLabel(d.site) })),
          recentCheckins: checkinRows.map((c) => ({
            date: c.date,
            appetite: c.appetite != null ? `${APPETITE_LABELS[c.appetite] ?? c.appetite} (${c.appetite}/5)` : null,
            sideEffects: parseSideEffects(c.sideEffects),
            notes: c.notes || undefined,
          })),
        },
        null,
        2,
      ),
    );
  },
);

server.tool(
  "set_day_status",
  "Set a day's health status (healthy | unwell | injured | vacation). Defaults to today but accepts ANY date, including future ones — so you can mark a vacation or planned time off / injury in advance. 'healthy' is the default and clears any flag for that day.",
  {
    status: z.enum(HEALTH_STATUSES),
    date: ISO.optional(),
    // Convenience for ranges (e.g. a holiday week): apply to date..endDate inclusive.
    endDate: ISO.optional(),
  },
  async ({ status, date, endDate }) => {
    const start = date ?? todayISO();
    const end = endDate && endDate >= start ? endDate : start;
    const dates: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

    if (status === "healthy") {
      await db.delete(dayHealth).where(inArray(dayHealth.date, dates));
    } else {
      for (const d of dates) {
        await db
          .insert(dayHealth)
          .values({ date: d, status })
          .onConflictDoUpdate({ target: dayHealth.date, set: { status } });
      }
    }
    const span = dates.length > 1 ? `${start} → ${end} (${dates.length} days)` : start;
    return text(
      status === "healthy" ? `Cleared status (set healthy) for ${span}.` : `Marked ${status} for ${span}.`,
    );
  },
);

server.tool(
  "log_cardio",
  "Log a cardio session (run/bike/row/walk/hike/swim/other). Defaults to today. If calories aren't given, they're estimated from the type, duration and your latest bodyweight.",
  {
    date: ISO.optional(),
    type: z.enum(["run", "bike", "row", "walk", "hike", "swim", "other"]),
    durationMin: z.number().optional(),
    distanceKm: z.number().optional(),
    avgHr: z.number().optional(),
    kcal: z.number().optional(),
    notes: z.string().optional(),
  },
  async ({ date, type, durationMin, distanceKm, avgHr, kcal, notes }) => {
    const d = date ?? todayISO();
    let cal = kcal ?? null;
    if (cal == null) {
      const w = await db
        .select({ weight: bodyMetrics.weightKg })
        .from(bodyMetrics)
        .where(isNotNull(bodyMetrics.weightKg))
        .orderBy(desc(bodyMetrics.date))
        .limit(1)
        .get();
      cal = estimateCardioKcal(type, durationMin ?? null, w?.weight ?? null);
    }
    await db.insert(cardioSessions).values({
      date: d,
      type,
      durationMin: durationMin ?? null,
      distanceKm: distanceKm ?? null,
      avgHr: avgHr ?? null,
      kcal: cal,
      notes: notes ?? null,
      source: "manual",
    });
    return text(
      `Logged ${type} on ${d}${durationMin ? ` (${durationMin} min)` : ""}${
        cal ? ` ~${Math.round(cal)} kcal` : ""
      }.`,
    );
  },
);

server.tool(
  "get_sync_freshness",
  "Freshness of each synced Google Health / scale feed: the most recent date per source and how many days stale it is. Use this before trusting recent trends — a feed that stopped updating (e.g. a device went offline) makes 'latest weight/HR/sleep' misleading. staleDays counts whole days since the latest record; stale=true when that exceeds the threshold (default 3).",
  { staleAfterDays: z.number().optional() },
  async ({ staleAfterDays }) => {
    const threshold = staleAfterDays ?? 3;
    const today = todayISO();
    const daysSince = (date: string | null) =>
      date == null
        ? null
        : Math.round(
            (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000,
          );

    const latestOf = async (
      table: typeof cardioSessions | typeof sleepSessions | typeof heartRateDaily | typeof dailyActivity | typeof bodyMetrics,
    ): Promise<string | null> => {
      const row = await db
        .select({ date: table.date })
        .from(table)
        .orderBy(desc(table.date))
        .limit(1)
        .get();
      return row?.date ?? null;
    };

    const feeds = {
      activities: await latestOf(cardioSessions),
      passiveActivity: await latestOf(dailyActivity),
      sleep: await latestOf(sleepSessions),
      restingHeartRate: await latestOf(heartRateDaily),
      bodyComposition: await latestOf(bodyMetrics),
    } as const;

    const out = Object.fromEntries(
      Object.entries(feeds).map(([name, latest]) => {
        const staleDays = daysSince(latest);
        return [name, { latest, staleDays, stale: staleDays == null || staleDays > threshold }];
      }),
    );

    return text(JSON.stringify({ today, staleAfterDays: threshold, feeds: out }, null, 2));
  },
);

// ---- Medication logging ----

server.tool(
  "log_medication_dose",
  "Record a GLP-1 injection (Mounjaro/tirzepatide, Ozempic/semaglutide). Defaults to today; drug defaults to tirzepatide. site: abdomen | left_thigh | right_thigh | upper_arm.",
  {
    date: ISO.optional(),
    time: z.string().optional(),
    drug: z.string().optional(),
    doseMg: z.number().optional(),
    site: z.string().optional(),
    notes: z.string().optional(),
  },
  async ({ date, time, drug, doseMg, site, notes }) => {
    const d = date ?? todayISO();
    const drg = drug ?? "tirzepatide";
    await db.insert(medicationDoses).values({
      date: d,
      time: time ?? null,
      drug: drg,
      doseMg: doseMg ?? null,
      site: site ?? null,
      notes: notes ?? null,
    });
    const label = MED_DRUG_LABELS[drg as MedDrug] ?? drg;
    return text(
      `Logged ${label}${doseMg != null ? ` ${doseMg} mg` : ""} on ${d}${site ? ` (${injectionSiteLabel(site)})` : ""}.`,
    );
  },
);

server.tool(
  "log_medication_checkin",
  "Record the daily GLP-1 check-in — appetite (1 none … 5 ravenous) and/or side effects. Upserts one row per date, keeping fields you don't pass. sideEffects is an array of { type, severity 1-3 }, type ∈ nausea|reflux|constipation|diarrhea|fatigue|headache|injection_site.",
  {
    date: ISO.optional(),
    appetite: z.number().min(1).max(5).optional(),
    sideEffects: z.array(z.object({ type: z.string(), severity: z.number().min(1).max(3) })).optional(),
    notes: z.string().optional(),
  },
  async ({ date, appetite, sideEffects, notes }) => {
    const d = date ?? todayISO();
    const existing = await db.select().from(medicationCheckins).where(eq(medicationCheckins.date, d)).get();
    const set = {
      appetite: appetite ?? existing?.appetite ?? null,
      sideEffects: sideEffects != null ? JSON.stringify(sideEffects) : existing?.sideEffects ?? null,
      notes: notes ?? existing?.notes ?? null,
    };
    await db
      .insert(medicationCheckins)
      .values({ date: d, ...set })
      .onConflictDoUpdate({ target: medicationCheckins.date, set });
    return text(`Saved medication check-in for ${d}.`);
  },
);

// ---- Profile / derived body ratios ----

server.tool(
  "get_profile",
  "Physical profile + goals: height, age (from DOB), sex, medications/conditions, goal weight, plus the current BMI and waist-to-height ratio (central-adiposity signal — healthy < 0.5, 0.5–0.6 increased risk, > 0.6 high risk). Height is what unlocks BMI/FFMI/waist-ratio, so pull this for any body-composition assessment.",
  {},
  async () => {
    const profile = await getSetting<{
      name?: string;
      dob?: string;
      sex?: string;
      heightCm?: number | null;
      medications?: string;
      conditions?: string;
    }>("profile", {});
    const goalWeight = await getSetting<number | null>("goalWeight", null);
    const latest = await db
      .select()
      .from(bodyMetrics)
      .where(isNotNull(bodyMetrics.weightKg))
      .orderBy(desc(bodyMetrics.date), desc(bodyMetrics.id))
      .get();
    const waistRow = await db
      .select({ waistCm: bodyMetrics.waistCm })
      .from(bodyMetrics)
      .where(isNotNull(bodyMetrics.waistCm))
      .orderBy(desc(bodyMetrics.date))
      .get();
    const h = profile.heightCm ?? null;
    const w = latest?.weightKg ?? null;
    const bmiVal = w != null ? bmi(w, h) : null;
    return text(
      JSON.stringify(
        {
          name: profile.name || undefined,
          heightCm: h,
          age: profile.dob ? ageFrom(profile.dob) : null,
          sex: profile.sex || undefined,
          medications: profile.medications || undefined,
          conditions: profile.conditions || undefined,
          goalWeightKg: goalWeight,
          currentWeightKg: w,
          bmi: bmiVal,
          bmiClass: bmiClass(bmiVal),
          waistCm: waistRow?.waistCm ?? undefined,
          waistToHeight: waistToHeight(waistRow?.waistCm ?? null, h),
        },
        null,
        2,
      ),
    );
  },
);

// ---- Recovery (HRV / SpO2) ----

server.tool(
  "get_recovery",
  "Daily recovery signals from the wearable, newest first (default last 30 days): HRV (RMSSD, ms — higher is better), blood-oxygen SpO2 (% mean + min), and resting HR. A sustained drop in HRV or SpO2 vs baseline can flag illness, poor sleep or overtraining — useful context for dips in training or appetite.",
  { days: z.number().optional() },
  async ({ days }) => {
    const n = Math.max(1, Math.min(days ?? 30, 365));
    const today = todayISO();
    const start = addDays(today, -(n - 1));
    const [metrics, hr] = await Promise.all([
      db
        .select()
        .from(dailyHealthMetrics)
        .where(and(gte(dailyHealthMetrics.date, start), lte(dailyHealthMetrics.date, today)))
        .orderBy(desc(dailyHealthMetrics.date))
        .all(),
      db
        .select({ date: heartRateDaily.date, bpm: heartRateDaily.restingBpm })
        .from(heartRateDaily)
        .where(and(gte(heartRateDaily.date, start), lte(heartRateDaily.date, today), isNotNull(heartRateDaily.restingBpm)))
        .all(),
    ]);
    const hrByDate = new Map(hr.map((r) => [r.date, r.bpm]));
    return text(
      JSON.stringify(
        {
          rangeDays: n,
          days: metrics.map((m) => ({
            date: m.date,
            hrvMs: m.hrvMs,
            spo2: m.spo2,
            spo2Min: m.spo2Min,
            restingBpm: hrByDate.get(m.date) ?? null,
          })),
        },
        null,
        2,
      ),
    );
  },
);

// ---- Corrections: delete a mis-logged row ----

server.tool(
  "delete_measurement",
  "Delete a body-measurement / weigh-in row by its id (from get_weight_trend or get_profile).",
  { id: z.number() },
  async ({ id }) => {
    const row = await db.select().from(bodyMetrics).where(eq(bodyMetrics.id, id)).get();
    if (!row) return text(`No measurement with id ${id}.`);
    await db.delete(bodyMetrics).where(eq(bodyMetrics.id, id));
    return text(`Deleted measurement #${id} (${row.date}).`);
  },
);

server.tool(
  "delete_cardio",
  "Delete a cardio session by its id (from get_cardio).",
  { id: z.number() },
  async ({ id }) => {
    const row = await db.select().from(cardioSessions).where(eq(cardioSessions.id, id)).get();
    if (!row) return text(`No cardio session with id ${id}.`);
    await db.delete(cardioSessions).where(eq(cardioSessions.id, id));
    return text(`Deleted ${row.type} on ${row.date} (#${id}).`);
  },
);

server.tool(
  "delete_medication_dose",
  "Delete a logged injection by its id (from get_medication).",
  { id: z.number() },
  async ({ id }) => {
    const row = await db.select().from(medicationDoses).where(eq(medicationDoses.id, id)).get();
    if (!row) return text(`No medication dose with id ${id}.`);
    await db.delete(medicationDoses).where(eq(medicationDoses.id, id));
    return text(`Deleted dose #${id} (${row.date}).`);
  },
);

// ---- Hydration logging ----

server.tool(
  "log_water",
  "Log plain water intake in millilitres for a day — counts toward the daily hydration estimate. Defaults to today.",
  { date: ISO.optional(), ml: z.number(), meal: MEAL.optional() },
  async ({ date, ml, meal }) => {
    const d = date ?? todayISO();
    // Reuse a canonical zero-calorie "Water" drink food so the entry buckets as
    // plain water (category=drink + name matches). serving 1 ml → quantity = ml.
    let water = await db
      .select()
      .from(foods)
      .where(and(sql`lower(${foods.name}) = 'water'`, eq(foods.category, "drink"), eq(foods.servingUnit, "ml")))
      .get();
    if (!water) {
      const [row] = await db
        .insert(foods)
        .values({
          name: "Water",
          category: "drink",
          servingSize: 1,
          servingUnit: "ml",
          kcal: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          source: "manual",
          evolution: evolutionForSource("manual"),
        })
        .returning();
      water = row;
    }
    await db.insert(foodLog).values(foodLogSnapshot(water, { date: d, meal: meal ?? "snacks", quantity: ml }));
    return text(`Logged ${ml} ml of water on ${d}.`);
  },
);

// ---- One-call health snapshot ----

server.tool(
  "get_health_summary",
  "One-call snapshot for a holistic assessment: latest weight + BMI + body-fat % + waist-to-height + distance to goal, current calorie/protein targets, logging streak, GLP-1 medication status (drug/dose/next injection/latest appetite), and the most recent bloodwork panel's out-of-range markers. Use as a starting point, then drill in with the specific tools.",
  {},
  async () => {
    const today = todayISO();
    const profile = await getSetting<{ heightCm: number | null; dob: string; sex: string }>("profile", {
      heightCm: null,
      dob: "",
      sex: "",
    });
    const goalWeight = await getSetting<number | null>("goalWeight", null);
    const targets = await getSetting("targets", DEFAULT_TARGETS);

    const latest = await db
      .select()
      .from(bodyMetrics)
      .where(isNotNull(bodyMetrics.weightKg))
      .orderBy(desc(bodyMetrics.date), desc(bodyMetrics.id))
      .get();
    const waistRow = await db
      .select({ waistCm: bodyMetrics.waistCm })
      .from(bodyMetrics)
      .where(isNotNull(bodyMetrics.waistCm))
      .orderBy(desc(bodyMetrics.date))
      .get();
    const w = latest?.weightKg ?? null;
    const bmiVal = w != null ? bmi(w, profile.heightCm) : null;

    const latestDose = await db.select().from(medicationDoses).orderBy(desc(medicationDoses.date), desc(medicationDoses.id)).get();
    const latestCheckin = await db.select().from(medicationCheckins).orderBy(desc(medicationCheckins.date)).get();
    let medication: Record<string, unknown> = { onTherapy: false };
    if (latestDose) {
      const due = addDays(latestDose.date, MED_CADENCE_DAYS);
      const until = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
      medication = {
        onTherapy: true,
        drug: MED_DRUG_LABELS[latestDose.drug as MedDrug] ?? latestDose.drug,
        doseMg: latestDose.doseMg,
        lastDose: latestDose.date,
        nextDoseDue: due,
        nextDoseStatus: until === 0 ? "due today" : until > 0 ? `due in ${until} day(s)` : `overdue by ${-until} day(s)`,
        latestAppetite:
          latestCheckin?.appetite != null ? `${APPETITE_LABELS[latestCheckin.appetite] ?? latestCheckin.appetite} (${latestCheckin.appetite}/5)` : undefined,
      };
    }

    const lastPanel = await db.select({ date: bloodMarkers.date }).from(bloodMarkers).orderBy(desc(bloodMarkers.date)).get();
    let bloodwork: Record<string, unknown> | null = null;
    if (lastPanel) {
      const markers = await db.select().from(bloodMarkers).where(eq(bloodMarkers.date, lastPanel.date)).all();
      bloodwork = {
        date: lastPanel.date,
        outOfRange: markers
          .filter((m) => (m.refLow != null && m.value < m.refLow) || (m.refHigh != null && m.value > m.refHigh))
          .map((m) => ({
            marker: m.marker,
            value: m.value,
            unit: m.unit,
            flag: m.refLow != null && m.value < m.refLow ? "low" : "high",
          })),
      };
    }

    // Logging streak: consecutive days back from today that have any food logged.
    const loggedDates = new Set(
      (await db.select({ date: foodLog.date }).from(foodLog).where(gte(foodLog.date, addDays(today, -90))).groupBy(foodLog.date).all()).map(
        (r) => r.date,
      ),
    );
    let streak = 0;
    for (let d = today; loggedDates.has(d); d = addDays(d, -1)) streak++;

    return text(
      JSON.stringify(
        {
          date: today,
          weight: latest
            ? {
                kg: w,
                asOf: latest.date,
                bmi: bmiVal,
                bmiClass: bmiClass(bmiVal),
                bodyFatPct: latest.bodyFatPct ?? undefined,
                waistToHeight: waistToHeight(waistRow?.waistCm ?? null, profile.heightCm) ?? undefined,
                toGoalKg: w != null && goalWeight != null ? Math.round((w - goalWeight) * 10) / 10 : undefined,
              }
            : null,
          targets: { kcal: targets.kcal, protein: targets.protein },
          loggingStreakDays: streak,
          medication,
          bloodwork,
        },
        null,
        2,
      ),
    );
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
