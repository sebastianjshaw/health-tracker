/**
 * One-off backfill: set foods.category for existing rows using the same
 * heuristic used at create/import time. Idempotent — only writes rows whose
 * inferred category differs from what's stored.
 *
 *   Local:  npx tsx db/backfill-category.ts
 *   Turso:  DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npx tsx db/backfill-category.ts
 *
 * Builds its own libsql client (rather than importing db/index) to avoid the
 * Next.js-only "server-only" module that db/index pulls in.
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { foods } from "./schema";
import { inferCategory } from "@/lib/food-category";

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const db = drizzle(createClient(isRemote ? { url, authToken } : { url }));

async function main() {
  console.log(`Backfilling categories on ${isRemote ? "remote" : "local"} db…`);
  const all = await db.select().from(foods).all();
  let updated = 0;
  for (const f of all) {
    const cat = inferCategory(f.servingUnit, f.name);
    if (f.category !== cat) {
      await db.update(foods).set({ category: cat }).where(eq(foods.id, f.id));
      console.log(`  ${f.name} (${f.servingUnit}) → ${cat}`);
      updated++;
    }
  }
  console.log(`Backfilled ${updated} of ${all.length} foods.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
