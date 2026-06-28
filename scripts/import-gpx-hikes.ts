/**
 * Import hikes from a Gaia GPS bulk export (gaiaexport.gpx) as cardio sessions
 * (type='hike', source='gpx'). Dry-run by default — pass --apply to write.
 *
 *   node --env-file=.env.local --import tsx scripts/import-gpx-hikes.ts
 *   node --env-file=.env.local --import tsx scripts/import-gpx-hikes.ts --apply
 *   node --env-file=.env.local --import tsx scripts/import-gpx-hikes.ts "/path/to/export.gpx"
 *
 * Only TIMESTAMPED tracks become sessions (the date is the track's start) — the
 * undated route files (Kungsleden/Etapp/*.gpx planned routes) are skipped. Tracks
 * whose average speed exceeds WALK_MAX_KMH are treated as drives and skipped.
 * Each session carries name, distance, duration, elevation gain (noise-filtered)
 * and the GPS polyline. Idempotent: upserts on (source, externalId = start time).
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { BatchItem } from "drizzle-orm/batch";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { downsample } from "./lib/gpx-parse";
import { encodePolyline } from "./lib/polyline";
import { estimateCardioKcal } from "../lib/cardio-calories";

const { cardioSessions } = schema;
const SOURCE = "gpx";
const WALK_MAX_KMH = 10; // above this it's a drive/ride, not a hike
const ELE_THRESHOLD_M = 10; // hysteresis to suppress GPS elevation noise

const DEFAULT_FILE = "/Users/Sebastian.Shaw/Downloads/gaiaexport.gpx";
const APPLY = process.argv.includes("--apply");
const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? DEFAULT_FILE;

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isRemote = url.startsWith("libsql://") || url.startsWith("http");
const db = drizzle(createClient(isRemote ? { url, authToken } : { url }), { schema });

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
function haversine(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Cumulative climb, ignoring oscillations smaller than the threshold. */
function elevationGain(eles: number[]): number {
  if (eles.length === 0) return 0;
  let gain = 0;
  let ref = eles[0];
  for (const e of eles) {
    if (e - ref >= ELE_THRESHOLD_M) {
      gain += e - ref;
      ref = e;
    } else if (e < ref) {
      ref = e;
    }
  }
  return Math.round(gain);
}

function cleanName(raw: string, date: string): string {
  const n = raw.trim();
  if (!n || n === "0" || /^new track/i.test(n) || /\.gpx$/i.test(n) || /^wpt /i.test(n)) {
    return `Hike ${date}`;
  }
  return n;
}

type Stmt = BatchItem<"sqlite">;

async function nearestWeight(date: string): Promise<number | null> {
  const r = await db
    .select({ w: schema.bodyMetrics.weightKg })
    .from(schema.bodyMetrics)
    .where(sql`${schema.bodyMetrics.weightKg} is not null`)
    .orderBy(sql`abs(julianday(${schema.bodyMetrics.date}) - julianday(${date}))`)
    .limit(1)
    .get();
  return r?.w ?? null;
}

async function main() {
  console.log(`DB:   ${isRemote ? url.replace(/(libsql:\/\/[^.]+).*/, "$1…(remote)") : url}`);
  console.log(`File: ${file}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (read-only)"}\n`);
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const xml = readFileSync(file, "utf8");

  const stmts: Stmt[] = [];
  let skippedUndated = 0;
  let skippedDrive = 0;

  for (const m of xml.matchAll(/<trk>([\s\S]*?)<\/trk>/g)) {
    const body = m[1];
    const pts: Array<[number, number]> = [];
    const eles: number[] = [];
    for (const p of body.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)">([\s\S]*?)<\/trkpt>/g)) {
      pts.push([+p[1], +p[2]]);
      const ele = p[3].match(/<ele>([-\d.]+)<\/ele>/);
      if (ele) eles.push(+ele[1]);
    }
    const times = [...body.matchAll(/<time>([\s\S]*?)<\/time>/g)].map((t) => t[1]);
    if (pts.length < 2 || times.length < 2) {
      skippedUndated += 1; // a route reference with no timestamps — can't date it
      continue;
    }
    const startIso = times[0];
    const date = startIso.slice(0, 10);
    const durationMin = Math.round((Date.parse(times[times.length - 1]) - Date.parse(startIso)) / 60000);
    let meters = 0;
    for (let i = 1; i < pts.length; i++) meters += haversine(pts[i - 1], pts[i]);
    const km = meters / 1000;
    const kmh = durationMin > 0 ? km / (durationMin / 60) : 0;
    if (kmh > WALK_MAX_KMH) {
      skippedDrive += 1;
      continue;
    }
    const name = cleanName(body.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? "", date);
    const track = encodePolyline(downsample(pts.map(([la, lo]) => ({ lat: la, lon: lo }))).map((p) => [p.lat, p.lon]));
    const distanceKm = Math.round(km * 1000) / 1000;
    const elevationGainM = elevationGain(eles);
    // local-naive start (Gaia stores Z; keep the calendar date/time as recorded)
    const startedAt = `${date}T${startIso.slice(11, 16)}`;
    const externalId = `gpx-${startIso}`;
    const kcal = estimateCardioKcal("hike", durationMin, await nearestWeight(date));

    console.log(`${date}  ${String(distanceKm).padStart(7)}km  ${String(durationMin).padStart(4)}min  ↑${String(elevationGainM).padStart(5)}m  ${kcal ?? "—"}kcal  ${name}`);

    stmts.push(
      db
        .insert(cardioSessions)
        .values({
          date,
          type: "hike",
          durationMin,
          distanceKm,
          elevationGainM,
          gpsTrack: track,
          name,
          kcal,
          startedAt,
          source: SOURCE,
          externalId,
        })
        .onConflictDoUpdate({
          target: [cardioSessions.source, cardioSessions.externalId],
          set: { date, type: "hike", durationMin, distanceKm, elevationGainM, gpsTrack: track, name, kcal, startedAt },
        }),
    );
  }

  console.log(`\nImport ${stmts.length} hikes. Skipped ${skippedUndated} undated route(s), ${skippedDrive} drive(s).`);
  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
    return;
  }
  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50);
    if (chunk.length) await db.batch(chunk as [Stmt, ...Stmt[]]);
  }
  console.log(`\nAPPLIED: ${stmts.length} hikes imported.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
