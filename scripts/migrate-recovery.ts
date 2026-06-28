/**
 * Create the daily_health_metrics table (HRV + SpO₂ recovery metrics).
 * Idempotent (CREATE TABLE IF NOT EXISTS). Dry-run by default.
 *
 *   prod:  node --env-file=.env.local --import tsx scripts/migrate-recovery.ts --apply
 *   local: node --import tsx scripts/migrate-recovery.ts --apply
 */
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const client = createClient(isRemote ? { url, authToken } : { url });

const DDL = `CREATE TABLE IF NOT EXISTS daily_health_metrics (
  date text PRIMARY KEY NOT NULL,
  hrv_ms real,
  spo2 real,
  spo2_min real,
  source text NOT NULL DEFAULT 'google-health',
  created_at integer
)`;

async function main() {
  console.log(`DB:   ${isRemote ? url.replace(/(libsql:\/\/[^.]+).*/, "$1…(remote)") : url}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (read-only)"}\n`);
  const exists = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='daily_health_metrics'",
  );
  if (exists.rows.length) {
    console.log("daily_health_metrics already exists — nothing to do.");
    return;
  }
  console.log("Will create table daily_health_metrics.");
  if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to create it.");
    return;
  }
  await client.execute(DDL);
  console.log("\nAPPLIED: created daily_health_metrics.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
