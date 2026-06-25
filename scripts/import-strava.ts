/**
 * Import a Strava bulk export into Baseline as the rich, authoritative record for
 * each session (correct km, avg/max HR, elevation, relative effort, GPS track,
 * and the run notes). Dry-run by default — pass --apply to write.
 *
 *   # preview against prod (read-only)
 *   node --env-file=.env.local --import tsx scripts/import-strava.ts
 *   # apply
 *   node --env-file=.env.local --import tsx scripts/import-strava.ts --apply
 *   # custom export dir (must contain activities.csv and activities/*.gpx)
 *   node --env-file=.env.local --import tsx scripts/import-strava.ts "/path/to/export"
 *
 * Idempotent: strava rows upsert on (source, externalId = Activity ID). On each
 * run it also SUPERSEDES the lower-fidelity copies of the same session — the
 * `mfp` run rows (no notes, distance was miles) and the `google-health` "other"
 * rows (no distance) that match by date + calories + duration — plus any prior
 * `manual` placeholder for the same activity. NOTE: a *full* Google resync
 * re-pulls history from 2015 and can recreate the google-health copies; just
 * re-run this script to re-clean them.
 *
 * Standalone client (no @/ aliases / server-only) so it runs cleanly under tsx.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import { parseStravaActivities, type StravaActivity } from "./lib/strava-parse";
import { parseTrackPoints, downsample } from "./lib/gpx-parse";
import { encodePolyline } from "./lib/polyline";

const { cardioSessions } = schema;
const SOURCE = "strava";
const SUPERSEDES = ["mfp", "google-health", "manual"];

const DEFAULT_DIR = "/Users/Sebastian.Shaw/Downloads/export_41964646";
const APPLY = process.argv.includes("--apply");
const exportDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? DEFAULT_DIR;

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const client = createClient(isRemote ? { url, authToken } : { url });
const db = drizzle(client, { schema });

type Stmt = BatchItem<"sqlite">;
async function runBatched(stmts: Stmt[], size = 50): Promise<void> {
  for (let i = 0; i < stmts.length; i += size) {
    const chunk = stmts.slice(i, i + size);
    if (chunk.length) await db.batch(chunk as [Stmt, ...Stmt[]]);
  }
}

/** Does an existing row look like the same activity as the Strava one? Distance
 * units differ across sources, so match on calories + duration (unit-free). */
function isSameActivity(
  ex: { kcal: number | null; durationMin: number | null },
  a: StravaActivity,
): boolean {
  if (a.kcal != null && ex.kcal != null) {
    const tol = Math.max(20, a.kcal * 0.05);
    if (Math.abs(ex.kcal - a.kcal) > tol) return false;
  }
  if (a.durationMin != null && ex.durationMin != null) {
    if (Math.abs(ex.durationMin - a.durationMin) > 3) return false;
  }
  // Require at least one of the two signals to have actually been compared.
  return (a.kcal != null && ex.kcal != null) || (a.durationMin != null && ex.durationMin != null);
}

function trackFor(a: StravaActivity): string | null {
  if (!a.filename) return null;
  const path = join(exportDir, a.filename);
  if (!existsSync(path)) return null;
  const pts = downsample(parseTrackPoints(readFileSync(path, "utf8")));
  if (pts.length < 2) return null;
  return encodePolyline(pts.map((p) => [p.lat, p.lon] as [number, number]));
}

async function main() {
  console.log(`DB:   ${isRemote ? url.replace(/(libsql:\/\/[^.]+).*/, "$1…(remote)") : url}`);
  console.log(`Dir:  ${exportDir}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (read-only)"}\n`);

  const csvPath = join(exportDir, "activities.csv");
  if (!existsSync(csvPath)) throw new Error(`activities.csv not found in ${exportDir}`);
  const activities = parseStravaActivities(readFileSync(csvPath, "utf8"));
  console.log(`Parsed ${activities.length} activities (${activities[activities.length - 1]?.date} → ${activities[0]?.date}).`);

  const byType = new Map<string, number>();
  let withTrack = 0;
  for (const a of activities) byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
  console.log(`  types: ${[...byType].map(([t, n]) => `${t} ${n}`).join(", ")}`);

  // Existing rows on the same dates that we might supersede.
  const dates = [...new Set(activities.map((a) => a.date))];
  const existing = dates.length
    ? await db
        .select({
          id: cardioSessions.id,
          date: cardioSessions.date,
          type: cardioSessions.type,
          durationMin: cardioSessions.durationMin,
          kcal: cardioSessions.kcal,
          source: cardioSessions.source,
        })
        .from(cardioSessions)
        .where(and(inArray(cardioSessions.date, dates), inArray(cardioSessions.source, SUPERSEDES)))
        .all()
    : [];
  const existingByDate = new Map<string, typeof existing>();
  for (const e of existing) (existingByDate.get(e.date) ?? existingByDate.set(e.date, []).get(e.date)!).push(e);

  const inserts: Stmt[] = [];
  const supersededIds = new Set<number>();
  const supersededBySource = new Map<string, number>();

  for (const a of activities) {
    const track = trackFor(a);
    if (track) withTrack++;
    inserts.push(
      db
        .insert(cardioSessions)
        .values({
          date: a.date,
          type: a.type,
          durationMin: a.durationMin,
          distanceKm: a.distanceKm,
          avgHr: a.avgHr,
          maxHr: a.maxHr,
          elevationGainM: a.elevationGainM,
          relativeEffort: a.relativeEffort,
          gpsTrack: track,
          kcal: a.kcal,
          notes: a.description || a.name || null,
          startedAt: a.startedAt,
          source: SOURCE,
          externalId: a.id,
        })
        .onConflictDoUpdate({
          target: [cardioSessions.source, cardioSessions.externalId],
          set: {
            date: a.date,
            type: a.type,
            durationMin: a.durationMin,
            distanceKm: a.distanceKm,
            avgHr: a.avgHr,
            maxHr: a.maxHr,
            elevationGainM: a.elevationGainM,
            relativeEffort: a.relativeEffort,
            gpsTrack: track,
            kcal: a.kcal,
            notes: a.description || a.name || null,
            startedAt: a.startedAt,
          },
        }),
    );

    for (const e of existingByDate.get(a.date) ?? []) {
      if (supersededIds.has(e.id)) continue;
      if (isSameActivity(e, a)) {
        supersededIds.add(e.id);
        supersededBySource.set(e.source, (supersededBySource.get(e.source) ?? 0) + 1);
      }
    }
  }

  console.log(`  with GPS track: ${withTrack}`);
  console.log(`\nUpsert ${inserts.length} strava rows.`);
  console.log(
    `Supersede ${supersededIds.size} lower-fidelity rows` +
      (supersededIds.size ? ` (${[...supersededBySource].map(([s, n]) => `${s} ${n}`).join(", ")})` : ""),
  );

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
    return;
  }

  if (supersededIds.size) {
    const ids = [...supersededIds];
    for (let i = 0; i < ids.length; i += 100) {
      await db.delete(cardioSessions).where(inArray(cardioSessions.id, ids.slice(i, i + 100)));
    }
  }
  await runBatched(inserts);
  console.log(`\nAPPLIED: ${inserts.length} strava rows, ${supersededIds.size} superseded rows removed.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
