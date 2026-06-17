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
  dayHealth,
  foodLog,
  foods,
  heartRateDaily,
  liftSessions,
  liftSets,
  settings,
  sleepSessions,
} from "../db/schema";
import {
  DEFAULT_CONTINGENCY,
  DEFAULT_LIFT_WEIGHTS,
  DEFAULT_TARGETS,
  EXERCISE_LABELS,
  Exercise,
  contingencyMultiplier,
  evolutionForSource,
  type Contingency,
} from "../lib/constants";
import { addDays, todayISO } from "../lib/date";
import { inferCategory } from "../lib/food-category";
import { foodLogSnapshot, portionAsSingleServing } from "../lib/food-snapshot";
import { ageFrom } from "../lib/health";
import { estimateCardioKcal } from "../lib/cardio-calories";
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

/** Ensure an MCP-logged food exists in the library (one serving = the portion eaten). */
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
  const existing = await db
    .select()
    .from(foods)
    .where(and(sql`lower(${foods.name}) = ${name.toLowerCase()}`, eq(foods.source, "mcp")))
    .get();
  if (existing) {
    await db.update(foods).set(serving).where(eq(foods.id, existing.id));
    return existing.id;
  }
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
  await materializeRecurringForDates(db, dates);
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
  "Full picture for a date (default today): food entries plus nutrition totals (calories — both raw-logged and the contingency-adjusted figure the app judges you on — protein, carbs, fat, fiber, saturated fat), estimated hydration split by source (water / other drinks / food), that day's effective calorie & protein target, and the logged health status (healthy/unwell/injured).",
  { date: ISO.optional() },
  async ({ date }) => {
    const d = date ?? todayISO();
    const [day] = await nutritionForRange(d, d); // materialises recurring + aggregates
    const logged = await db.select().from(foodLog).where(eq(foodLog.date, d)).all();
    const healthRow = await db.select().from(dayHealth).where(eq(dayHealth.date, d)).get();

    const entries = logged.map((r) => ({
      id: r.id,
      meal: r.meal,
      name: r.name,
      quantity: r.quantity,
      kcal: r.kcal,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      fiber: r.fiber ?? undefined,
      saturatedFat: r.saturatedFat ?? undefined,
      source: r.source,
      recurring: r.recurringId != null,
    }));
    const macros = macroTotals(entries);

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
    return text(`Logged "${name}" to ${meal} on ${d} (${Math.round(kcal)} kcal).`);
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
  "log_weight",
  "Record a body weight / vitals measurement. Defaults to today.",
  {
    date: ISO.optional(),
    weightKg: z.number().optional(),
    bodyFatPct: z.number().optional(),
    waistCm: z.number().optional(),
    restingHr: z.number().optional(),
    notes: z.string().optional(),
  },
  async ({ date, weightKg, bodyFatPct, waistCm, restingHr, notes }) => {
    const d = date ?? todayISO();
    await db.insert(bodyMetrics).values({
      date: d,
      weightKg: weightKg ?? null,
      bodyFatPct: bodyFatPct ?? null,
      waistCm: waistCm ?? null,
      restingHr: restingHr ?? null,
      notes: notes ?? null,
    });
    return text(`Logged measurement on ${d}${weightKg != null ? ` (${weightKg} kg)` : ""}.`);
  },
);

server.tool(
  "get_weight_trend",
  "Recent body weight (newest first) plus goal distance and an energy-balance PREDICTION per weigh-in: what weight the logged food (contingency-adjusted) and exercise imply, vs the actual measured weight. A persistent gap means logging/contingency is off — predicted above actual = losing faster than logs suggest (under-reported intake); below = the reverse.",
  { limit: z.number().optional() },
  async ({ limit }) => {
    const rows = await db
      .select()
      .from(bodyMetrics)
      .where(isNotNull(bodyMetrics.weightKg))
      .orderBy(desc(bodyMetrics.date))
      .limit(limit ?? 30)
      .all();

    const goalWeight = await getSetting<number | null>("goalWeight", null);
    const latest = rows[0]?.weightKg ?? null;

    // Predict over the span of the returned weigh-ins (oldest → newest).
    const weighIns = [...rows]
      .reverse()
      .map((r) => ({ date: r.date, weight: r.weightKg as number }));
    let predictions: ReturnType<typeof predictWeights> = [];
    if (weighIns.length >= 2) {
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
          goalWeight,
          toGoalKg:
            latest != null && goalWeight != null
              ? Math.round((latest - goalWeight) * 10) / 10
              : null,
          weights: rows.map((r) => ({
            date: r.date,
            weightKg: r.weightKg,
            bodyFatPct: r.bodyFatPct,
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
  "Recent cardio sessions (run/bike/row/walk/swim/other), newest first. Defaults to the last 30.",
  { limit: z.number().optional() },
  async ({ limit }) => {
    const rows = await db
      .select()
      .from(cardioSessions)
      .orderBy(desc(cardioSessions.date), desc(cardioSessions.id))
      .limit(limit ?? 30)
      .all();
    return text(
      JSON.stringify(
        rows.map((r) => ({
          date: r.date,
          startedAt: r.startedAt ?? undefined,
          type: r.type,
          durationMin: r.durationMin,
          distanceKm: r.distanceKm,
          avgHr: r.avgHr,
          kcal: r.kcal,
          source: r.source,
          notes: r.notes ?? undefined,
        })),
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
  "Daily nutrition & hydration over the last N days (default 30): per day the contingency-adjusted calories vs that day's effective target, protein, fiber, saturated fat, and estimated water (split by source). Includes averages and adherence counts — use this for weekly/period coaching, not single-day questions (use get_day for those).",
  { days: z.number().optional() },
  async ({ days }) => {
    const n = Math.max(1, Math.min(days ?? 30, 365));
    const today = todayISO();
    const series = await nutritionForRange(addDays(today, -(n - 1)), today);
    const logged = series.filter((s) => s.loggedKcal > 0);
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
    return text(JSON.stringify({ rangeDays: n, summary, series }, null, 2));
  },
);

server.tool(
  "get_health_status",
  "Days flagged unwell or injured over the last N days (default 30) — context for dips in training, appetite or weight. Healthy days are omitted.",
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
          days: flagged.map((r) => ({ date: r.date, status: r.status })),
        },
        null,
        2,
      ),
    );
  },
);

server.tool(
  "log_cardio",
  "Log a cardio session (run/bike/row/walk/swim/other). Defaults to today. If calories aren't given, they're estimated from the type, duration and your latest bodyweight.",
  {
    date: ISO.optional(),
    type: z.enum(["run", "bike", "row", "walk", "swim", "other"]),
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
