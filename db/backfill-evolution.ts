/**
 * One-off backfill: set foods.evolution (and food_log.evolution snapshots) for
 * existing rows. Foods are classified from their source via evolutionForSource;
 * log rows inherit their linked food's evolution (falling back to source).
 * Idempotent — only writes rows whose value would change.
 *
 *   Local:  npx tsx db/backfill-evolution.ts
 *   Turso:  DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npx tsx db/backfill-evolution.ts
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { foodLog, foods } from "./schema";
import { evolutionForSource } from "@/lib/constants";

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const db = drizzle(createClient(isRemote ? { url, authToken } : { url }));

async function main() {
  console.log(`Backfilling evolution on ${isRemote ? "remote" : "local"} db…`);

  const allFoods = await db.select().from(foods).all();
  const evoByFoodId = new Map<number, string>();
  let foodUpdates = 0;
  for (const f of allFoods) {
    const evo = evolutionForSource(f.source);
    evoByFoodId.set(f.id, evo);
    if (f.evolution !== evo) {
      await db.update(foods).set({ evolution: evo }).where(eq(foods.id, f.id));
      foodUpdates++;
    }
  }

  const logs = await db.select().from(foodLog).all();
  let logUpdates = 0;
  for (const r of logs) {
    const evo =
      (r.foodId != null ? evoByFoodId.get(r.foodId) : undefined) ??
      evolutionForSource(r.source);
    if (r.evolution !== evo) {
      await db.update(foodLog).set({ evolution: evo }).where(eq(foodLog.id, r.id));
      logUpdates++;
    }
  }

  console.log(`Foods updated: ${foodUpdates}/${allFoods.length}`);
  console.log(`Log rows updated: ${logUpdates}/${logs.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
