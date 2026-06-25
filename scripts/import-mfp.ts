/**
 * One-time import of a MyFitnessPal "Data Access Request" export into Baseline.
 *
 * Dry-run by default — pass --apply to write. Targets whatever DATABASE_URL the
 * environment points at, so choose the env file deliberately:
 *
 *   # preview against prod (read-only)
 *   node --env-file=.env.local --import tsx scripts/import-mfp.ts
 *   # apply
 *   node --env-file=.env.local --import tsx scripts/import-mfp.ts --apply
 *   # custom file path
 *   node --env-file=.env.local --import tsx scripts/import-mfp.ts "/path/to/export.xlsx"
 *
 * What it imports (see the plan):
 *  - Weight       → body_metrics  (per-day merge; never overwrites an existing weight)
 *  - Food diary   → food_log      (foodId=null, source='mfp', no contingency uplift)
 *  - Cardio       → cardio_sessions (source='mfp'; distance treated as km)
 *  - Strength     → freeform_lifts (source='mfp')
 * Daily Nutrition Totals / Steps / Water / User* are intentionally skipped.
 *
 * Idempotent: source-tagged tables are delete-then-insert; weight is a no-op on
 * re-run (only fills dates with no existing weight). The library (`foods`) is
 * never touched.
 *
 * Standalone client (no @/ aliases / server-only) so it runs cleanly under tsx.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { BatchItem } from "drizzle-orm/batch";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { mapCardioType, mapMeal, num, parseWorkbook, type MfpRecord } from "./lib/mfp-parse";

const { foodLog, bodyMetrics, cardioSessions, freeformLifts } = schema;

const DEFAULT_XLSX = "/Users/Sebastian.Shaw/Downloads/sebastianjshaw Data Access Request.xlsx";
const SOURCE = "mfp";

const APPLY = process.argv.includes("--apply");
const xlsxPath = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? DEFAULT_XLSX;

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const client = createClient(isRemote ? { url, authToken } : { url });
const db = drizzle(client, { schema });

type Stmt = BatchItem<"sqlite">;
async function runBatched(stmts: Stmt[], size = 100): Promise<void> {
  for (let i = 0; i < stmts.length; i += size) {
    const chunk = stmts.slice(i, i + size);
    if (chunk.length) await db.batch(chunk as [Stmt, ...Stmt[]]);
  }
}

function unzipMember(path: string, member: string): string {
  return execFileSync("unzip", ["-p", path, member], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function parseJson(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Drop physically-impossible macros from corrupt MFP rows (e.g. a 596 kcal
 * "Baguette" logged with 3445 g fat / 7155 g sat-fat). A macro can't imply far
 * more energy than the entry's calories: fat ~9 kcal/g, carbs/protein ~4. Values
 * past that ceiling (plus slack) are data-entry errors → null/zero them; the kcal
 * column itself is reliable and kept. sat-fat ≤ fat, fiber ≤ carbs.
 */
function sanitizeMacros(
  kcal: number,
  raw: { fat: number; satFat: number | null; carbs: number; protein: number; fiber: number | null },
) {
  const ceil = kcal + 50; // allow logging slack / rounding
  const ok = (g: number, perGram: number) => g * perGram <= ceil;
  const fat = ok(raw.fat, 9) ? raw.fat : 0;
  const carbs = ok(raw.carbs, 4) ? raw.carbs : 0;
  const protein = ok(raw.protein, 4) ? raw.protein : 0;
  // sat-fat is a subset of fat: invalid if it implies too much energy or exceeds total fat.
  const satFat =
    raw.satFat == null ? null : !ok(raw.satFat, 9) || raw.satFat > fat ? (fat > 0 ? fat : null) : raw.satFat;
  // fiber is a subset of carbs.
  const fiber =
    raw.fiber == null ? null : !ok(raw.fiber, 4) || raw.fiber > carbs ? (carbs > 0 ? carbs : null) : raw.fiber;
  return { fat, carbs, protein, satFat, fiber };
}

const milesToKm = (mi: number | null): number | null =>
  mi == null ? null : Math.round(mi * 1.609344 * 1000) / 1000;

const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const range = (ds: string[]) => (ds.length ? `${ds.reduce((a, b) => (a < b ? a : b))} → ${ds.reduce((a, b) => (a > b ? a : b))}` : "—");

async function main() {
  console.log(`DB:   ${isRemote ? url.replace(/(libsql:\/\/[^.]+).*/, "$1…(remote)") : url}`);
  console.log(`File: ${xlsxPath}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (read-only)"}\n`);
  if (!existsSync(xlsxPath)) throw new Error(`File not found: ${xlsxPath}`);

  const shared = unzipMember(xlsxPath, "xl/sharedStrings.xml");
  const sheet = unzipMember(xlsxPath, "xl/worksheets/sheet1.xml");
  const { records } = parseWorkbook(shared, sheet);
  console.log(`Parsed ${records.length} data rows.\n`);

  const byType = new Map<string, MfpRecord[]>();
  for (const r of records) {
    const t = r["item_type"] || "(blank)";
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(r);
  }
  console.log("item_type breakdown:");
  for (const [t, rows] of [...byType].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${t}: ${rows.length}`);
  }
  console.log("");

  // ---- 1. Weight → body_metrics (per-day merge) ----
  const weightRows = (byType.get("Measurement") ?? []).filter(
    (r) => (r["description"] || "").toLowerCase() === "weight" && isDate(r["date"]) && num(r["value"]) != null,
  );
  const weightByDate = new Map<string, number>();
  for (const r of weightRows) weightByDate.set(r["date"], num(r["value"]) as number); // last per day wins
  const existing = await db.select({ date: bodyMetrics.date, weightKg: bodyMetrics.weightKg, id: bodyMetrics.id }).from(bodyMetrics).all();
  const existingByDate = new Map(existing.map((e) => [e.date, e]));
  let wInsert = 0, wFill = 0, wSkip = 0;
  const weightStmts: Stmt[] = [];
  for (const [date, kg] of weightByDate) {
    const ex = existingByDate.get(date);
    if (!ex) {
      wInsert++;
      weightStmts.push(db.insert(bodyMetrics).values({ date, weightKg: kg }));
    } else if (ex.weightKg == null) {
      wFill++;
      weightStmts.push(db.update(bodyMetrics).set({ weightKg: kg }).where(eq(bodyMetrics.id, ex.id)));
    } else {
      wSkip++; // already has a weight (Withings/manual) — never overwrite
    }
  }
  console.log(`WEIGHT  ${weightByDate.size} dated weigh-ins  (${range([...weightByDate.keys()])})`);
  console.log(`        → insert ${wInsert} new days, fill ${wFill} empty, skip ${wSkip} already-weighed\n`);

  // ---- 2. Food diary → food_log ----
  const foods = (byType.get("Foods") ?? []).filter((r) => isDate(r["date"]));
  const mealTally = new Map<string, number>();
  const foodStmts: Stmt[] = [];
  let scrubbed = 0;
  for (const r of foods) {
    const meal = mapMeal((parseJson(r["details_json"])["meal"] as string) || "");
    mealTally.set(meal, (mealTally.get(meal) ?? 0) + 1);
    const kcal = num(r["calories"]) ?? 0;
    const macro = sanitizeMacros(kcal, {
      fat: num(r["fat_g"]) ?? 0,
      satFat: num(r["saturated_fat_g"]),
      carbs: num(r["carbs_g"]) ?? 0,
      protein: num(r["protein_g"]) ?? 0,
      fiber: num(r["fiber_g"]),
    });
    if ((num(r["fat_g"]) ?? 0) !== macro.fat || (num(r["carbs_g"]) ?? 0) !== macro.carbs) scrubbed++;
    foodStmts.push(
      db.insert(foodLog).values({
        date: r["date"],
        meal,
        foodId: null,
        name: r["description"] || "(unnamed)",
        // MFP's nutrition columns are the ENTRY TOTAL (the serving `value` is
        // already applied), but our model computes day totals as kcal×quantity.
        // So store the totals as the snapshot and pin quantity=1 — otherwise a
        // "2500 ml beer" row (kcal already 787) would be multiplied by 2500.
        quantity: 1,
        kcal,
        protein: macro.protein,
        carbs: macro.carbs,
        fat: macro.fat,
        fiber: macro.fiber,
        saturatedFat: macro.satFat,
        servingSize: 100,
        servingUnit: r["unit"] || "serving",
        source: SOURCE,
        evolution: "commodity", // no contingency uplift — preserve MFP's logged totals
        recurringId: null,
      }),
    );
  }
  console.log(`FOOD    ${foods.length} entries  (${range(foods.map((r) => r["date"]))})`);
  console.log(`        meals: ${[...mealTally].map(([m, n]) => `${m} ${n}`).join(", ")}`);
  console.log(`        scrubbed implausible macros on ${scrubbed} row(s)\n`);

  // ---- 3. Cardio → cardio_sessions ----
  const exercise = byType.get("Exercise") ?? [];
  const cardio = exercise.filter((r) => (parseJson(r["details_json"])["type"] || "") === "cardio" && isDate(r["date"]));
  const cardioStmts: Stmt[] = [];
  cardio.forEach((r, i) => {
    const j = parseJson(r["details_json"]);
    cardioStmts.push(
      db.insert(cardioSessions).values({
        date: r["date"],
        type: mapCardioType(r["description"] || ""),
        durationMin: num(String(j["minutes"] ?? "")),
        // MFP exports this distance in MILES (verified against the same runs in
        // the Strava export: mfp×1.609 == strava km). Convert to km on import.
        distanceKm: milesToKm(num(String(j["distance"] ?? ""))),
        kcal: num(r["value"]),
        startedAt: typeof j["start_time"] === "string" ? (j["start_time"] as string) : null,
        source: SOURCE,
        externalId: `mfp-cardio-${r["date"]}-${i}`,
      }),
    );
  });
  console.log(`CARDIO  ${cardio.length} sessions  (${range(cardio.map((r) => r["date"]))})\n`);

  // ---- 4. Strength → freeform_lifts ----
  const strength = exercise.filter((r) => (parseJson(r["details_json"])["type"] || "") === "strength" && isDate(r["date"]));
  const liftStmts: Stmt[] = [];
  for (const r of strength) {
    const j = parseJson(r["details_json"]);
    liftStmts.push(
      db.insert(freeformLifts).values({
        date: r["date"],
        exercise: r["description"] || "(unnamed)",
        sets: num(String(j["sets"] ?? "")),
        repsPerSet: num(String(j["reps_per_set"] ?? "")),
        weightKg: num(String(j["weight"] ?? "")),
        source: SOURCE,
      }),
    );
  }
  console.log(`LIFTS   ${strength.length} free-form strength entries  (${range(strength.map((r) => r["date"]))})`);
  if (strength[0]) {
    const j = parseJson(strength[0]["details_json"]);
    console.log(`        e.g. ${strength[0]["date"]} ${strength[0]["description"]} — ${j["sets"]}×${j["reps_per_set"]} @ ${j["weight"]}kg\n`);
  }

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to write.");
    return;
  }

  // delete-then-insert for source-tagged tables (idempotent)
  await db.delete(foodLog).where(eq(foodLog.source, SOURCE));
  await db.delete(cardioSessions).where(eq(cardioSessions.source, SOURCE));
  await db.delete(freeformLifts).where(eq(freeformLifts.source, SOURCE));

  await runBatched(weightStmts);
  await runBatched(foodStmts);
  await runBatched(cardioStmts);
  await runBatched(liftStmts);

  console.log(
    `APPLIED: weight ${wInsert + wFill}, food ${foodStmts.length}, cardio ${cardioStmts.length}, lifts ${liftStmts.length}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
