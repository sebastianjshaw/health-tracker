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
import { asc, and, desc, eq, inArray, isNotNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bloodMarkers,
  bodyMetrics,
  cardioSessions,
  foodLog,
  foods,
  heartRateDaily,
  liftSessions,
  liftSets,
  settings,
  sleepSessions,
} from "../db/schema";
import {
  DEFAULT_LIFT_WEIGHTS,
  EXERCISE_LABELS,
  Exercise,
  evolutionForSource,
} from "../lib/constants";
import { todayISO } from "../lib/date";
import { inferCategory } from "../lib/food-category";
import { foodLogSnapshot, portionAsSingleServing } from "../lib/food-snapshot";
import { totals as macroTotals } from "../lib/nutrition";
import {
  hideRecurringOnDate,
  materializeRecurringForDates,
  type AppDb,
} from "../lib/recurring-materialize";

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
}): Promise<number> {
  const name = opts.name.trim();
  const serving = portionAsSingleServing({
    kcal: opts.kcal,
    protein: opts.protein,
    carbs: opts.carbs,
    fat: opts.fat,
  });
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

const server = new McpServer({ name: "health-tracker", version: "1.0.0" });

server.tool(
  "get_day",
  "Get all food entries (logged + recurring defaults) and nutrition totals for a date. Defaults to today.",
  { date: ISO.optional() },
  async ({ date }) => {
    const d = date ?? todayISO();
    await materializeRecurringForDates(db, [d]);
    const logged = await db.select().from(foodLog).where(eq(foodLog.date, d)).all();

    const entries = logged.map((r) => ({
      id: r.id,
      meal: r.meal,
      name: r.name,
      quantity: r.quantity,
      kcal: r.kcal,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      source: r.source,
      recurring: r.recurringId != null,
    }));

    const totals = macroTotals(entries);

    return text(
      JSON.stringify(
        {
          date: d,
          totals: {
            kcal: Math.round(totals.kcal),
            protein: Math.round(totals.protein),
            carbs: Math.round(totals.carbs),
            fat: Math.round(totals.fat),
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
  "Add a free-text food entry to a day's meal. kcal/protein/carbs/fat are the ABSOLUTE TOTALS for the whole portion eaten — already account for the amount, do NOT pass per-unit values or a multiplier.",
  {
    date: ISO.optional(),
    meal: MEAL,
    name: z.string(),
    kcal: z.number(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
  },
  async ({ date, meal, name, kcal, protein, carbs, fat }) => {
    const d = date ?? todayISO();
    const totals = {
      kcal,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fat: fat ?? 0,
    };
    const foodId = await ensureMcpLibraryFood({ name, ...totals });
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
  "Recent body weight measurements, newest first.",
  { limit: z.number().optional() },
  async ({ limit }) => {
    const rows = await db
      .select()
      .from(bodyMetrics)
      .where(isNotNull(bodyMetrics.weightKg))
      .orderBy(desc(bodyMetrics.date))
      .limit(limit ?? 30)
      .all();
    return text(
      JSON.stringify(
        rows.map((r) => ({ date: r.date, weightKg: r.weightKg, bodyFatPct: r.bodyFatPct })),
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
  "Get daily goals: calorie & protein targets, goal weight, and meal calorie split.",
  {},
  async () => {
    const targets = await getSetting("targets", { kcal: 2200, protein: 150 });
    const goalWeight = await getSetting<number | null>("goalWeight", null);
    const mealSplit = await getSetting("mealSplit", {
      breakfast: 25,
      lunch: 30,
      dinner: 35,
      snacks: 10,
    });
    return text(JSON.stringify({ targets, goalWeight, mealSplit }, null, 2));
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
