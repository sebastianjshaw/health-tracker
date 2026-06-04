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
import { asc, desc, eq, inArray, isNotNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bloodMarkers,
  bodyMetrics,
  foodLog,
  foods,
  recurringFoods,
  recurringRemovals,
  settings,
} from "../db/schema";

// ---- db ----
const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const client = createClient(isRemote ? { url, authToken } : { url });
const db = drizzle(client);

/**
 * Ensure a food exists in the library (case-insensitive by name) and return its
 * id. Used so that ad-hoc foods logged via the MCP server still show up in the
 * Food library, not just the daily log.
 */
async function ensureLibraryFood(opts: {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  servingSize?: number;
  servingUnit?: string;
}): Promise<number> {
  const name = opts.name.trim();
  const existing = await db
    .select({ id: foods.id })
    .from(foods)
    .where(sql`lower(${foods.name}) = ${name.toLowerCase()}`)
    .get();
  if (existing) return existing.id;
  const [row] = await db
    .insert(foods)
    .values({
      name,
      servingSize: opts.servingSize ?? 1,
      servingUnit: opts.servingUnit ?? "serving",
      kcal: opts.kcal,
      protein: opts.protein,
      carbs: opts.carbs,
      fat: opts.fat,
      source: opts.source,
    })
    .returning({ id: foods.id });
  return row.id;
}

// ---- date helpers (local time) ----
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isWeekend(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}
function schedulesFor(date: string): string[] {
  return isWeekend(date) ? ["everyday", "weekend"] : ["everyday", "weekday"];
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
    const logged = await db.select().from(foodLog).where(eq(foodLog.date, d)).all();
    const removals = await db
      .select()
      .from(recurringRemovals)
      .where(eq(recurringRemovals.date, d))
      .all();
    const removed = new Set(removals.map((r) => r.recurringId));
    const recurring = await db
      .select({
        id: recurringFoods.id,
        meal: recurringFoods.meal,
        quantity: recurringFoods.quantity,
        name: foods.name,
        kcal: foods.kcal,
        protein: foods.protein,
        carbs: foods.carbs,
        fat: foods.fat,
      })
      .from(recurringFoods)
      .innerJoin(foods, eq(recurringFoods.foodId, foods.id))
      .where(inArray(recurringFoods.schedule, schedulesFor(d)))
      .all();

    const entries = [
      ...recurring
        .filter((r) => !removed.has(r.id))
        .map((r) => ({
          id: null as number | null, // recurring defaults aren't deletable by entry id
          meal: r.meal,
          name: r.name,
          quantity: r.quantity,
          kcal: r.kcal,
          protein: r.protein,
          carbs: r.carbs,
          fat: r.fat,
          source: "recurring",
        })),
      ...logged.map((r) => ({
        id: r.id, // pass to delete_food_entry to remove this entry
        meal: r.meal,
        name: r.name,
        quantity: r.quantity,
        kcal: r.kcal,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        source: r.source,
      })),
    ];

    const totals = entries.reduce(
      (a, e) => ({
        kcal: a.kcal + e.kcal * e.quantity,
        protein: a.protein + e.protein * e.quantity,
        carbs: a.carbs + e.carbs * e.quantity,
        fat: a.fat + e.fat * e.quantity,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );

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
    // Also make sure the food exists in the library so it's reusable later.
    const foodId = await ensureLibraryFood({
      name,
      kcal,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fat: fat ?? 0,
      source: "mcp",
    });
    await db.insert(foodLog).values({
      date: d,
      meal,
      foodId,
      name,
      quantity: 1, // nutrition values are absolute totals, so the multiplier is always 1
      kcal,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fat: fat ?? 0,
      servingSize: 1,
      servingUnit: "serving",
      source: "mcp",
    });
    return text(`Logged "${name}" to ${meal} on ${d} (${Math.round(kcal)} kcal).`);
  },
);

server.tool(
  "delete_food_entry",
  "Delete a logged food entry by its id (from get_day). Only removes logged entries, not recurring defaults.",
  { id: z.number() },
  async ({ id }) => {
    const row = await db.select().from(foodLog).where(eq(foodLog.id, id)).get();
    if (!row) return text(`No food entry with id ${id}.`);
    await db.delete(foodLog).where(eq(foodLog.id, id));
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
    await db.insert(foodLog).values({
      date: d,
      meal,
      foodId: food.id,
      name: food.name,
      quantity: quantity ?? 1,
      kcal: food.kcal,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      source: food.source,
    });
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
