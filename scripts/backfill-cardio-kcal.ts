/**
 * One-time backfill: estimate `kcal` for existing google-health cardio rows
 * that were imported without a calories figure (which otherwise read as zero
 * burn and skew the weight prediction).
 *
 * Dry-run by default — pass --apply to write. Targets whatever DATABASE_URL the
 * environment points at, so choose the env file deliberately:
 *
 *   # preview against prod
 *   node --env-file=.env.local --import tsx scripts/backfill-cardio-kcal.ts
 *   # apply
 *   node --env-file=.env.local --import tsx scripts/backfill-cardio-kcal.ts --apply
 *
 * Standalone client (no @/ aliases / server-only) so it runs cleanly under tsx.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, desc, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import * as schema from "../db/schema";
import { estimateCardioKcal } from "../lib/cardio-calories";
import type { CardioType } from "../lib/constants";

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const client = createClient(isRemote ? { url, authToken } : { url });
const db = drizzle(client, { schema });
const { cardioSessions, bodyMetrics } = schema;

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(
    `DB: ${isRemote ? url.replace(/(libsql:\/\/[^.]+).*/, "$1…(remote)") : url}`,
  );

  const latest = await db
    .select({ weight: bodyMetrics.weightKg })
    .from(bodyMetrics)
    .where(isNotNull(bodyMetrics.weightKg))
    .orderBy(desc(bodyMetrics.date))
    .limit(1)
    .get();
  const weightKg = latest?.weight ?? null;

  // "Missing" = null OR ≤0 (Google reports 0 for many walks).
  const rows = await db
    .select()
    .from(cardioSessions)
    .where(
      and(
        eq(cardioSessions.source, "google-health"),
        or(isNull(cardioSessions.kcal), lte(cardioSessions.kcal, 0)),
      ),
    )
    .all();

  console.log(
    `Found ${rows.length} google-health cardio rows with no usable kcal. Latest weigh-in: ${
      weightKg ?? "—"
    } kg.\n`,
  );

  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const est = estimateCardioKcal(r.type as CardioType, r.durationMin, weightKg);
    if (est == null) {
      skipped++;
      console.log(`  skip  ${r.date} ${r.type} (no duration)`);
      continue;
    }
    console.log(
      `  ${APPLY ? "set " : "would"} ${r.date} ${r.type} ${
        r.durationMin ?? "?"
      }min → ${est} kcal`,
    );
    if (APPLY) {
      await db
        .update(cardioSessions)
        .set({ kcal: est })
        .where(eq(cardioSessions.id, r.id));
    }
    updated++;
  }

  console.log(
    `\n${APPLY ? "Updated" : "Would update"} ${updated} row(s); skipped ${skipped} (no duration).`,
  );
  if (!APPLY && updated > 0) console.log("Re-run with --apply to write.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
