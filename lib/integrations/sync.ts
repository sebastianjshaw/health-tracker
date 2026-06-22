import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { bodyMetrics, cardioSessions, dailyActivity, heartRateDaily, sleepSessions } from "@/db/schema";
import { CardioType } from "@/lib/constants";
import { estimateCardioKcal } from "@/lib/cardio-calories";
import { dedupeSessions, type DedupSession } from "@/lib/cardio-dedup";
import { addDays, todayISO } from "@/lib/date";
import {
  DATA_TYPES,
  type DataPoint,
  fetchDailyTotals,
  getAccessToken,
  getCursor,
  listDataPoints,
  listDataPointsSince,
  setCursor,
} from "./google-health";

const SOURCE = "google-health";
const MIN_EXERCISE_MIN = 10; // below this, with no distance, treat as auto-detected noise
const LOOKBACK_DAYS = 7; // re-check the last week each sync to catch late-arriving data

// ---- small parse helpers (the API mixes numbers and int64-as-string) ----
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Protobuf Duration like "1830s" → minutes. */
const durationToMin = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const s = parseFloat(v);
  return Number.isFinite(s) ? Math.round(s / 60) : null;
};
const dateOf = (iso: unknown): string | null =>
  typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : null;

// ---- scale measurement helpers (weight, body fat) ----
type SampleTime = {
  physicalTime?: string;
  civilTime?: { date?: { year?: number; month?: number; day?: number } };
};
type MeasureNode = { sampleTime?: SampleTime } & Record<string, unknown>;

/** Local calendar day of a sample (civilTime preferred, else the UTC slice). */
function sampleDate(st?: SampleTime): string | null {
  const d = st?.civilTime?.date;
  if (d?.year && d?.month && d?.day) {
    return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  }
  return dateOf(st?.physicalTime);
}

/**
 * Latest SCALE-sourced reading per local day for a measurement data type, from
 * `since` onward. Non-scale points (legacy provider weight history) are ignored
 * so we never re-import over manual entries; within a day the most recent
 * sampleTime wins.
 */
function scaleLatestPerDay(
  points: { dataSource?: unknown; [k: string]: unknown }[],
  field: string,
  since: string,
  valueOf: (node: MeasureNode) => number | null,
): Map<string, number> {
  const byDate = new Map<string, { at: string; value: number }>();
  for (const dp of points) {
    const ds = dp.dataSource as { device?: { formFactor?: string } } | undefined;
    if (ds?.device?.formFactor !== "SCALE") continue;
    const node = dp[field] as MeasureNode | undefined;
    if (!node) continue;
    const date = sampleDate(node.sampleTime);
    if (!date || date < since) continue;
    const value = valueOf(node);
    if (value == null) continue;
    const at = node.sampleTime?.physicalTime ?? "";
    const cur = byDate.get(date);
    if (!cur || at > cur.at) byDate.set(date, { at, value });
  }
  const out = new Map<string, number>();
  for (const [date, v] of byDate) out.set(date, v.value);
  return out;
}

function exerciseToCardio(exerciseType?: string): CardioType {
  switch ((exerciseType ?? "").toUpperCase()) {
    case "RUNNING":
    case "TRAIL_RUNNING":
    case "TREADMILL_RUNNING":
      return "run";
    case "WALKING":
    case "HIKING":
      return "walk";
    case "BIKING":
    case "CYCLING":
    case "MOUNTAIN_BIKING":
      return "bike";
    case "ROWING":
      return "row";
    case "SWIMMING":
      return "swim";
    default:
      return "other";
  }
}

type Interval = { startTime?: string; endTime?: string };

export type SyncSummary = {
  from: string;
  to: string;
  exercise: number;
  sleep: number;
  restingHr: number;
  activeDays: number;
  body: number;
};

type SqliteBatchItem = BatchItem<"sqlite">;

/** Run upserts in chunked batches (one round-trip per chunk) instead of one
 * network round-trip per row — the difference between a full sync finishing
 * inside the function timeout and timing out before the cursor is saved. */
async function runBatched(stmts: SqliteBatchItem[], size = 100): Promise<void> {
  for (let i = 0; i < stmts.length; i += size) {
    const chunk = stmts.slice(i, i + size);
    if (chunk.length > 0) {
      await db.batch(chunk as [SqliteBatchItem, ...SqliteBatchItem[]]);
    }
  }
}

export async function syncGoogleHealth(opts?: { full?: boolean }): Promise<SyncSummary> {
  const full = opts?.full ?? false;
  const token = await getAccessToken();
  if (!token) throw new Error("Google Health is not connected.");

  const today = todayISO();
  // First sync (no cursor) imports full history; then we go incremental — but
  // with a lookback so data that lands in Google Health late (Fit/Health Connect
  // sync with a delay) isn't skipped forever once the cursor moves past its date.
  // Re-importing recent days is safe: rows upsert on (source, externalId).
  // A full resync ignores the cursor and re-pulls the entire history.
  const cursor = full ? null : await getCursor();
  const start = cursor ? addDays(cursor, -LOOKBACK_DAYS) : "2015-01-01";
  // Granular measurement types (passive steps/distance, scale weight/body-fat)
  // are bounded to ~90 days on a normal sync so we don't page years of points;
  // a full resync lifts the bound.
  const boundedSince = full || start >= addDays(today, -90) ? start : addDays(today, -90);
  const summary: SyncSummary = {
    from: start,
    to: today,
    exercise: 0,
    sleep: 0,
    restingHr: 0,
    activeDays: 0,
    body: 0,
  };

  // ---- Exercise → cardioSessions ----
  // Latest weigh-in feeds the MET-based calorie estimate for sessions the
  // provider imports without a measured figure.
  const latestWeight = await db
    .select({ weight: bodyMetrics.weightKg })
    .from(bodyMetrics)
    .where(isNotNull(bodyMetrics.weightKg))
    .orderBy(desc(bodyMetrics.date))
    .limit(1)
    .get();
  const weightKg = latestWeight?.weight ?? null;

  // exercise is a session type — it rejects time filters, so fetch all and
  // window client-side by start date.
  const exPoints = await listDataPoints(token, DATA_TYPES.exercise);

  // Two apps (Google Fit + Withings) both write the same session into Health
  // Connect, so the feed double-counts. Build candidates across ALL history,
  // dedupe overlapping ones, then keep the winners (and drop the redundant
  // copies — including ones imported by older syncs, anywhere in time).
  type ExCandidate = DedupSession & {
    date: string;
    row: typeof cardioSessions.$inferInsert;
  };
  const candidates: ExCandidate[] = [];
  for (const dp of exPoints) {
    const ex = dp.exercise as
      | {
          interval?: Interval;
          exerciseType?: string;
          activeDuration?: string;
          metricsSummary?: {
            caloriesKcal?: number;
            distanceMillimeters?: number;
            averageHeartRateBeatsPerMinute?: string | number;
          };
        }
      | undefined;
    const date = dateOf(ex?.interval?.startTime);
    const externalId = typeof dp.name === "string" ? dp.name : null;
    if (!ex || !date || !externalId) continue;

    const m = ex.metricsSummary ?? {};
    const durationMin = durationToMin(ex.activeDuration);
    const distanceKm = m.distanceMillimeters != null ? m.distanceMillimeters / 1_000_000 : null;

    // Skip Google Fit's auto-detected micro-activities: short blips with no
    // distance (e.g. 1–5 min "OTHER"). Keep anything with a distance or ≥10 min.
    if ((distanceKm == null || distanceKm === 0) && (durationMin == null || durationMin < MIN_EXERCISE_MIN)) {
      continue;
    }

    const type = exerciseToCardio(ex.exerciseType);
    const startMs = Date.parse(ex.interval?.startTime ?? "");
    const endMs = Date.parse(ex.interval?.endTime ?? "");
    candidates.push({
      externalId,
      startMs: Number.isFinite(startMs) ? startMs : 0,
      endMs: Number.isFinite(endMs) ? endMs : startMs + (durationMin ?? 0) * 60_000,
      hasDistance: distanceKm != null && distanceKm > 0,
      durationMin: durationMin ?? 0,
      date,
      row: {
        date,
        type,
        startedAt: ex.interval?.startTime ?? null,
        durationMin,
        distanceKm,
        avgHr: num(m.averageHeartRateBeatsPerMinute),
        // Prefer the provider's measured calories; fall back to a MET estimate so
        // synced workouts still count toward energy expenditure (and don't skew
        // the weight prediction by reading as zero burn). Google Health reports 0
        // (not null) for many walk sessions, so treat ≤0 as "not measured" too.
        kcal:
          m.caloriesKcal != null && m.caloriesKcal > 0
            ? Math.round(m.caloriesKcal)
            : estimateCardioKcal(type, durationMin, weightKg),
      },
    });
  }

  const { winners, loserIds } = dedupeSessions(candidates);
  const cardioStmts: SqliteBatchItem[] = [];
  for (const w of winners) {
    if (w.date < start) continue; // outside the window — already imported
    cardioStmts.push(
      db
        .insert(cardioSessions)
        .values({ ...w.row, source: SOURCE, externalId: w.externalId })
        .onConflictDoUpdate({
          target: [cardioSessions.source, cardioSessions.externalId],
          set: w.row,
        }),
    );
    summary.exercise++;
  }
  await runBatched(cardioStmts);

  // Drop the redundant duplicate copies (any date — cleans dupes from older
  // syncs too). Only ever touches synced rows, never manually-logged cardio.
  for (let i = 0; i < loserIds.length; i += 100) {
    const chunk = loserIds.slice(i, i + 100);
    await db
      .delete(cardioSessions)
      .where(and(eq(cardioSessions.source, SOURCE), inArray(cardioSessions.externalId, chunk)));
  }

  // ---- Sleep → sleepSessions ---- (session type: fetch all, window client-side)
  const sleepPoints = await listDataPoints(token, DATA_TYPES.sleep);
  const sleepStmts: SqliteBatchItem[] = [];
  for (const dp of sleepPoints) {
    const sl = dp.sleep as
      | {
          interval?: Interval;
          summary?: {
            stagesSummary?: { type?: string; minutes?: string | number }[];
            minutesAsleep?: string | number;
          };
        }
      | undefined;
    // wake date = end of the interval
    const date = dateOf(sl?.interval?.endTime) ?? dateOf(sl?.interval?.startTime);
    const externalId = typeof dp.name === "string" ? dp.name : null;
    if (!sl || !date || !externalId || date < start) continue;
    const stages = new Map<string, number>();
    for (const s of sl.summary?.stagesSummary ?? []) {
      if (s.type) stages.set(s.type.toUpperCase(), num(s.minutes) ?? 0);
    }
    const stagedAsleep =
      (stages.get("DEEP") ?? 0) + (stages.get("REM") ?? 0) + (stages.get("LIGHT") ?? 0);
    const durationMin = num(sl.summary?.minutesAsleep) ?? stagedAsleep;
    sleepStmts.push(
      db
        .insert(sleepSessions)
        .values({
          date,
          start: sl.interval?.startTime ?? null,
          end: sl.interval?.endTime ?? null,
          durationMin: Math.round(durationMin),
          deepMin: stages.get("DEEP") ?? null,
          remMin: stages.get("REM") ?? null,
          lightMin: stages.get("LIGHT") ?? null,
          awakeMin: stages.get("AWAKE") ?? null,
          source: SOURCE,
          externalId,
        })
        .onConflictDoUpdate({
          target: [sleepSessions.source, sleepSessions.externalId],
          set: {
            date,
            durationMin: Math.round(durationMin),
            deepMin: stages.get("DEEP") ?? null,
            remMin: stages.get("REM") ?? null,
            lightMin: stages.get("LIGHT") ?? null,
            awakeMin: stages.get("AWAKE") ?? null,
          },
        }),
    );
    summary.sleep++;
  }
  await runBatched(sleepStmts);

  // ---- Daily resting heart rate → heartRateDaily ----
  // Daily summary type supports a server-side date filter.
  const hrPoints = await listDataPoints(
    token,
    DATA_TYPES.restingHr,
    `daily_resting_heart_rate.date >= "${start}"`,
  );
  const hrStmts: SqliteBatchItem[] = [];
  for (const dp of hrPoints) {
    const rhr = dp.dailyRestingHeartRate as
      | { date?: { year?: number; month?: number; day?: number }; beatsPerMinute?: string | number }
      | undefined;
    const d = rhr?.date;
    const date =
      d?.year && d?.month && d?.day
        ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
        : null;
    const bpm = num(rhr?.beatsPerMinute);
    const externalId =
      (typeof dp.name === "string" ? dp.name : null) ?? (date ? `gh-rhr-${date}` : null);
    if (!date || bpm == null || !externalId) continue;
    hrStmts.push(
      db
        .insert(heartRateDaily)
        .values({ date, restingBpm: Math.round(bpm), source: SOURCE, externalId })
        .onConflictDoUpdate({
          target: [heartRateDaily.source, heartRateDaily.externalId],
          set: { date, restingBpm: Math.round(bpm) },
        }),
    );
    summary.restingHr++;
  }
  await runBatched(hrStmts);

  // ---- Passive steps & distance → dailyActivity ----
  // Granular measurement types: aggregated per local day, bounded to the recent
  // window (see boundedSince) so we don't page through years of per-minute data.
  const [stepsByDay, distByDay] = await Promise.all([
    fetchDailyTotals(token, DATA_TYPES.steps, (n) => Number(n.count ?? 0), boundedSince),
    fetchDailyTotals(token, DATA_TYPES.distance, (n) => Number(n.millimeters ?? 0), boundedSince),
  ]);
  const activityStmts: SqliteBatchItem[] = [];
  for (const date of new Set([...stepsByDay.keys(), ...distByDay.keys()])) {
    const steps = Math.round(stepsByDay.get(date) ?? 0);
    const distanceKm = Math.round(((distByDay.get(date) ?? 0) / 1_000_000) * 1000) / 1000;
    activityStmts.push(
      db
        .insert(dailyActivity)
        .values({ date, steps, distanceKm, source: SOURCE })
        .onConflictDoUpdate({
          target: dailyActivity.date,
          set: { steps, distanceKm, source: SOURCE },
        }),
    );
    summary.activeDays++;
  }
  await runBatched(activityStmts);

  // ---- Body composition (weight, body fat) from a smart scale → bodyMetrics ----
  // Withings/Health-Connect scales report weight & body-fat as instantaneous
  // measurements. We ONLY ingest SCALE-sourced points (the same endpoints also
  // carry years of legacy provider weight we must not re-import over manual
  // history), keep the latest reading per local day, and fold it into that day's
  // single bodyMetrics row — so it merges with manual measurements rather than
  // duplicating them. The scale's spot heart-rate is deliberately skipped: it's
  // a standing pulse, not resting HR, and would corrupt the resting-HR series.
  const measureDate = (field: string) => (dp: DataPoint) =>
    sampleDate((dp[field] as MeasureNode | undefined)?.sampleTime);
  const [weightPts, bodyFatPts] = await Promise.all([
    listDataPointsSince(token, DATA_TYPES.weight, boundedSince, measureDate("weight")),
    listDataPointsSince(token, DATA_TYPES.bodyFat, boundedSince, measureDate("bodyFat")),
  ]);
  const weightByDay = scaleLatestPerDay(weightPts, "weight", boundedSince, (n) => {
    const g = num(n.weightGrams);
    return g != null ? Math.round((g / 1000) * 10) / 10 : null;
  });
  const bodyFatByDay = scaleLatestPerDay(bodyFatPts, "bodyFat", boundedSince, (n) => {
    const p = num(n.percentage);
    return p != null ? Math.round(p * 10) / 10 : null;
  });

  const bodyDates = [...new Set([...weightByDay.keys(), ...bodyFatByDay.keys()])];
  if (bodyDates.length) {
    const existing = await db
      .select()
      .from(bodyMetrics)
      .where(inArray(bodyMetrics.date, bodyDates))
      .all();
    // One row per date (newest id wins) — mirrors logBody's merge semantics.
    const rowByDate = new Map<string, (typeof existing)[number]>();
    for (const r of existing) {
      const prev = rowByDate.get(r.date);
      if (!prev || r.id > prev.id) rowByDate.set(r.date, r);
    }

    const bodyStmts: SqliteBatchItem[] = [];
    for (const date of bodyDates) {
      const w = weightByDay.get(date) ?? null;
      const bf = bodyFatByDay.get(date) ?? null;
      const ex = rowByDate.get(date);
      if (ex) {
        // The scale is the measuring device, so it wins where it has a reading;
        // other fields (waist, notes, resting HR) are preserved untouched.
        bodyStmts.push(
          db
            .update(bodyMetrics)
            .set({ weightKg: w ?? ex.weightKg, bodyFatPct: bf ?? ex.bodyFatPct })
            .where(eq(bodyMetrics.id, ex.id)),
        );
      } else {
        bodyStmts.push(db.insert(bodyMetrics).values({ date, weightKg: w, bodyFatPct: bf }));
      }
      summary.body++;
    }
    await runBatched(bodyStmts);
  }

  await setCursor(today);
  return summary;
}
