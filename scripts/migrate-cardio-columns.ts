/**
 * Additive, idempotent migration: add the richer Strava columns to
 * cardio_sessions (max_hr, elevation_gain_m, relative_effort, gps_track).
 * Nullable, so existing rows are untouched. Safe to re-run — it skips columns
 * that already exist (checked via PRAGMA table_info).
 *
 *   # preview against prod (read-only)
 *   node --env-file=.env.local --import tsx scripts/migrate-cardio-columns.ts
 *   # apply
 *   node --env-file=.env.local --import tsx scripts/migrate-cardio-columns.ts --apply
 */
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const client = createClient(isRemote ? { url, authToken } : { url });

const COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "max_hr", ddl: "ALTER TABLE cardio_sessions ADD COLUMN max_hr integer" },
  { name: "elevation_gain_m", ddl: "ALTER TABLE cardio_sessions ADD COLUMN elevation_gain_m real" },
  { name: "relative_effort", ddl: "ALTER TABLE cardio_sessions ADD COLUMN relative_effort integer" },
  { name: "gps_track", ddl: "ALTER TABLE cardio_sessions ADD COLUMN gps_track text" },
];

async function main() {
  console.log(`DB:   ${isRemote ? url.replace(/(libsql:\/\/[^.]+).*/, "$1…(remote)") : url}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (read-only)"}\n`);

  const info = await client.execute("PRAGMA table_info(cardio_sessions)");
  const existing = new Set(info.rows.map((r) => String(r.name)));

  const todo = COLUMNS.filter((c) => !existing.has(c.name));
  if (todo.length === 0) {
    console.log("All columns already present — nothing to do.");
    return;
  }
  for (const c of todo) console.log(`  + ${c.name}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to add the columns.");
    return;
  }
  for (const c of todo) await client.execute(c.ddl);
  console.log(`\nAPPLIED: added ${todo.length} column(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
