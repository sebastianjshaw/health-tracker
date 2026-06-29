/**
 * One-off backfill: populate fiber where it's missing, and flag AI-estimated
 * values via foods/food_log.fiberEstimated.
 *
 *   A. barcoded library foods (null fiber)      → re-fetch from OpenFoodFacts (measured)
 *   B. remaining library foods (null fiber)      → AI estimate (flagged)
 *   C. log rows linked to a now-filled food      → copy the food's fiber snapshot
 *   D. free-text log rows (no usable food fiber) → AI estimate per distinct name (flagged)
 *
 * Idempotent — only ever fills rows whose fiber IS NULL. Pass --dry to preview
 * counts without writing.
 *
 *   Local:  npx tsx db/backfill-fiber.ts [--dry]
 *   Turso:  DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npx tsx db/backfill-fiber.ts
 *
 * Needs ANTHROPIC_API_KEY (steps B & D). OpenFoodFacts (step A) needs no key.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config(); // .env, without overriding .env.local

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, isNull } from "drizzle-orm";
import { foodLog, foods } from "./schema";
import { lookupBarcode } from "@/lib/openfoodfacts";
import { estimateFiberGrams } from "@/lib/fiber-estimate";

const DRY = process.argv.includes("--dry");
const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const db = drizzle(createClient(isRemote ? { url, authToken } : { url }));

async function main() {
  console.log(`Backfilling fiber on ${isRemote ? "remote" : "local"} db${DRY ? " (dry run)" : ""}…\n`);

  // ---- A. barcoded library foods → OpenFoodFacts ----
  const barcoded = (await db.select().from(foods).where(isNull(foods.fiber)).all()).filter(
    (f) => f.barcode,
  );
  let offFilled = 0;
  for (const f of barcoded) {
    const product = await lookupBarcode(f.barcode!);
    if (product?.fiber == null) continue;
    offFilled++;
    if (!DRY) {
      await db
        .update(foods)
        .set({ fiber: product.fiber, fiberEstimated: false })
        .where(eq(foods.id, f.id));
    }
  }
  console.log(`A. OpenFoodFacts: filled ${offFilled}/${barcoded.length} barcoded foods`);

  // ---- B. remaining library foods → AI estimate ----
  const needEstimate = await db.select().from(foods).where(isNull(foods.fiber)).all();
  const estimates = needEstimate.length
    ? await estimateFiberGrams(needEstimate.map((f) => ({ name: f.name, carbs: f.carbs })))
    : [];
  let foodEst = 0;
  for (let i = 0; i < needEstimate.length; i++) {
    const fiber = estimates[i];
    if (fiber == null) continue;
    foodEst++;
    if (!DRY) {
      await db
        .update(foods)
        .set({ fiber, fiberEstimated: true })
        .where(eq(foods.id, needEstimate[i].id));
    }
  }
  console.log(`B. AI estimate: filled ${foodEst}/${needEstimate.length} non-barcoded foods`);

  // ---- C. log rows → copy snapshot from a now-filled linked food ----
  const fiberById = new Map(
    (await db.select().from(foods).all())
      .filter((f) => f.fiber != null)
      .map((f) => [f.id, { fiber: f.fiber!, estimated: !!f.fiberEstimated }]),
  );
  const linkedLogs = (await db.select().from(foodLog).where(isNull(foodLog.fiber)).all()).filter(
    (r) => r.foodId != null && fiberById.has(r.foodId),
  );
  let copied = 0;
  for (const r of linkedLogs) {
    const src = fiberById.get(r.foodId!)!;
    copied++;
    if (!DRY) {
      await db
        .update(foodLog)
        .set({ fiber: src.fiber, fiberEstimated: src.estimated })
        .where(eq(foodLog.id, r.id));
    }
  }
  console.log(`C. Snapshot copy: filled ${copied} log rows from linked foods`);

  // ---- D. free-text log rows → AI estimate per distinct name ----
  const freeLogs = await db.select().from(foodLog).where(isNull(foodLog.fiber)).all();
  // Dedupe by name (case-insensitive); keep one representative carbs value.
  const byName = new Map<string, { name: string; carbs: number }>();
  for (const r of freeLogs) {
    const key = r.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, { name: r.name, carbs: r.carbs });
  }
  const distinct = [...byName.values()];
  const logEstimates = distinct.length ? await estimateFiberGrams(distinct) : [];
  const fiberByName = new Map<string, number>();
  distinct.forEach((d, i) => {
    if (logEstimates[i] != null) fiberByName.set(d.name.trim().toLowerCase(), logEstimates[i]!);
  });
  let logEst = 0;
  for (const r of freeLogs) {
    const fiber = fiberByName.get(r.name.trim().toLowerCase());
    if (fiber == null) continue;
    logEst++;
    if (!DRY) {
      await db
        .update(foodLog)
        .set({ fiber, fiberEstimated: true })
        .where(eq(foodLog.id, r.id));
    }
  }
  console.log(
    `D. AI estimate: filled ${logEst}/${freeLogs.length} free-text log rows ` +
      `(${distinct.length} distinct names)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
