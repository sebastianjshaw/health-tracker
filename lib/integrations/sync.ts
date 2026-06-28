import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { bodyMetrics, cardioSessions, dailyActivity, dailyHealthMetrics, heartRateDaily, sleepSessions } from "@/db/schema";
import { CardioType } from "@/lib/constants";
import { estimateCardioKcal } from "@/lib/cardio-calories";
import { dedupeSessions, type DedupSession } from "@/lib/cardio-dedup";
import { maybeUpdateProteinTarget } from "@/lib/protein-target";
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
import {
  getAccessToken as getWithingsToken,
  getCursor as getWithingsCursor,
  getMeasures,
  setCursor as setWithingsCursor,
} from "./withings";

const SOURCE = "google-health";
const MIN_EXERCISE_MIN = 10; // below this, with no distance, treat as auto-detected noise
const MAX_EXERCISE_MIN = 300; // above ~5h, treat as a stuck timer / GPS artifact, not a session
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

function exerciseToCardio(exerciseType?: string): CardioType {
  switch ((exerciseType ?? "").toUpperCase()) {
    case "RUNNING":
    case "TRAIL_RUNNING":
    case "TREADMILL_RUNNING":
      return "run";
    case "WALKING":
      return "walk";
    case "HIKING":
      return "hike";
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
  recoveryDays: number;
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
    recoveryDays: 0,
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

  // Exercise is a session type — it rejects server-side time filters, but comes
  // back newest-first, so we page only back to the recent window (boundedSince)
  // and stop, instead of pulling the whole history every run.
  const exDateOf = (dp: DataPoint) =>
    dateOf((dp.exercise as { interval?: Interval } | undefined)?.interval?.startTime);
  const exPoints = await listDataPointsSince(token, DATA_TYPES.exercise, boundedSince, exDateOf);

  // Two apps (Google Fit + Withings) both write the same session into Health
  // Connect, so the feed double-counts. Build candidates from the fetched window,
  // dedupe overlapping ones, keep the winners, and drop the redundant copies.
  // (Historical dupes outside the window were already cleaned; a full resync
  // re-fetches everything and re-dedupes the lot.)
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
    // Drop implausibly long sessions (a stuck timer / GPS left running): e.g. a
    // 14 h "run" of 0.7 km. Real deliberate cardio here is well under 5 h.
    if (durationMin != null && durationMin > MAX_EXERCISE_MIN) {
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

  // Drop the redundant duplicate copies found in this window. Only ever touches
  // synced rows, never manually-logged cardio.
  for (let i = 0; i < loserIds.length; i += 100) {
    const chunk = loserIds.slice(i, i + 100);
    await db
      .delete(cardioSessions)
      .where(and(eq(cardioSessions.source, SOURCE), inArray(cardioSessions.externalId, chunk)));
  }

  // ---- Sleep → sleepSessions ---- (session type, newest-first: page back only
  // to the recent window via boundedSince rather than the whole history)
  const sleepDateOf = (dp: DataPoint) =>
    dateOf((dp.sleep as { interval?: Interval } | undefined)?.interval?.startTime);
  const sleepPoints = await listDataPointsSince(token, DATA_TYPES.sleep, boundedSince, sleepDateOf);
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

  // ---- Recovery metrics (HRV + SpO₂) → dailyHealthMetrics ----
  // Instantaneous samples (many per day) aggregated to one local-day row: HRV as
  // the daily mean RMSSD, SpO₂ as daily mean + minimum. Bounded to the recent
  // window. Both 200 from the API only when a wearable (Fitbit) supplies them.
  const civilDate = (t?: { civilTime?: { date?: { year?: number; month?: number; day?: number } } }) => {
    const d = t?.civilTime?.date;
    return d?.year && d?.month && d?.day
      ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
      : null;
  };
  type Sample = { sampleTime?: Parameters<typeof civilDate>[0] };
  const hrvAcc = new Map<string, { sum: number; n: number }>();
  const spo2Acc = new Map<string, { sum: number; n: number; min: number }>();
  try {
    const hrvPoints = await listDataPointsSince(token, DATA_TYPES.hrv, boundedSince, (dp) =>
      civilDate((dp.heartRateVariability as Sample | undefined)?.sampleTime),
    );
    for (const dp of hrvPoints) {
      const v = dp.heartRateVariability as
        | (Sample & { rootMeanSquareOfSuccessiveDifferencesMilliseconds?: number })
        | undefined;
      const date = civilDate(v?.sampleTime);
      const ms = num(v?.rootMeanSquareOfSuccessiveDifferencesMilliseconds);
      if (!date || ms == null) continue;
      const a = hrvAcc.get(date) ?? { sum: 0, n: 0 };
      a.sum += ms;
      a.n += 1;
      hrvAcc.set(date, a);
    }
    const spo2Points = await listDataPointsSince(token, DATA_TYPES.spo2, boundedSince, (dp) =>
      civilDate((dp.oxygenSaturation as Sample | undefined)?.sampleTime),
    );
    for (const dp of spo2Points) {
      const v = dp.oxygenSaturation as (Sample & { percentage?: number }) | undefined;
      const date = civilDate(v?.sampleTime);
      const pct = num(v?.percentage);
      // Raw passive SpO₂ samples include motion artifacts (e.g. 50%); anything
      // below 88% is not a real resting reading for a healthy adult — drop it.
      if (!date || pct == null || pct < 88) continue;
      const a = spo2Acc.get(date) ?? { sum: 0, n: 0, min: pct };
      a.sum += pct;
      a.n += 1;
      a.min = Math.min(a.min, pct);
      spo2Acc.set(date, a);
    }
  } catch (e) {
    // A wearable that doesn't supply these (or an unsupported slug) shouldn't
    // fail the whole sync — log and carry on.
    console.error("Recovery-metrics fetch failed:", e);
  }
  const recoveryStmts: SqliteBatchItem[] = [];
  for (const date of new Set([...hrvAcc.keys(), ...spo2Acc.keys()])) {
    const hrv = hrvAcc.get(date);
    const sp = spo2Acc.get(date);
    const hrvMs = hrv ? Math.round((hrv.sum / hrv.n) * 10) / 10 : null;
    const spo2 = sp ? Math.round((sp.sum / sp.n) * 10) / 10 : null;
    const spo2Min = sp ? Math.round(sp.min * 10) / 10 : null;
    recoveryStmts.push(
      db
        .insert(dailyHealthMetrics)
        .values({ date, hrvMs, spo2, spo2Min, source: SOURCE })
        .onConflictDoUpdate({ target: dailyHealthMetrics.date, set: { hrvMs, spo2, spo2Min } }),
    );
    summary.recoveryDays++;
  }
  await runBatched(recoveryStmts);

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

  // Body composition (weight, body-fat, lean/muscle/bone/water) is no longer
  // read here — it comes directly from the Withings cloud (syncWithings), which
  // doesn't depend on the phone's Health-Connect bridge. Google Health keeps
  // activities, sleep and resting HR.

  await setCursor(today);
  return summary;
}

export type WithingsSyncSummary = { days: number; latest: string | null };

// Re-check this many seconds before the cursor so a measure edited/re-uploaded
// after we last synced (Withings keys `lastupdate` off modification time) still
// gets picked up rather than skipped forever.
const WITHINGS_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;

/**
 * Pull body composition from the Withings cloud into bodyMetrics. The scale is
 * the measuring device, so its readings win where present; manual fields (waist,
 * notes, resting HR) on the same day are preserved untouched, and days Withings
 * has no reading for (manual + legacy history) are never overwritten. Idempotent
 * — one row per date, merged like logBody. A full resync re-pulls all history.
 */
export async function syncWithings(opts?: { full?: boolean }): Promise<WithingsSyncSummary> {
  const full = opts?.full ?? false;
  const token = await getWithingsToken();
  if (!token) throw new Error("Withings is not connected.");

  const cursor = full ? null : await getWithingsCursor();
  const since = cursor != null ? Math.max(0, cursor - WITHINGS_LOOKBACK_SECONDS) : null;
  const { readings, updatetime } = await getMeasures(token, since);

  let latest: string | null = null;
  if (readings.length) {
    const dates = readings.map((r) => r.date);
    const existing = await db
      .select()
      .from(bodyMetrics)
      .where(inArray(bodyMetrics.date, dates))
      .all();
    // One row per date (newest id wins) — mirrors logBody's merge semantics.
    const rowByDate = new Map<string, (typeof existing)[number]>();
    for (const r of existing) {
      const prev = rowByDate.get(r.date);
      if (!prev || r.id > prev.id) rowByDate.set(r.date, r);
    }

    const stmts: SqliteBatchItem[] = [];
    for (const r of readings) {
      // Scale fields win where it has a reading; keep the prior value otherwise.
      const set = (next: number | null, prev: number | null | undefined) => next ?? prev ?? null;
      const ex = rowByDate.get(r.date);
      if (ex) {
        stmts.push(
          db
            .update(bodyMetrics)
            .set({
              weightKg: set(r.weightKg, ex.weightKg),
              bodyFatPct: set(r.bodyFatPct, ex.bodyFatPct),
              leanMassKg: set(r.leanMassKg, ex.leanMassKg),
              muscleMassKg: set(r.muscleMassKg, ex.muscleMassKg),
              boneMassKg: set(r.boneMassKg, ex.boneMassKg),
              hydrationKg: set(r.hydrationKg, ex.hydrationKg),
            })
            .where(eq(bodyMetrics.id, ex.id)),
        );
      } else {
        stmts.push(
          db.insert(bodyMetrics).values({
            date: r.date,
            weightKg: r.weightKg,
            bodyFatPct: r.bodyFatPct,
            leanMassKg: r.leanMassKg,
            muscleMassKg: r.muscleMassKg,
            boneMassKg: r.boneMassKg,
            hydrationKg: r.hydrationKg,
          }),
        );
      }
      if (latest == null || r.date > latest) latest = r.date;
    }
    await runBatched(stmts);

    // Body composition moved → nudge the lean-mass protein target (dated +
    // append-only, so it never re-grades past days). Best-effort.
    try {
      await maybeUpdateProteinTarget();
    } catch {
      /* non-fatal */
    }
  }

  // Advance the cursor to the response's updatetime so the next run only fetches
  // newer measures. Fall back to the prior cursor if absent (nothing to move to).
  if (updatetime != null) await setWithingsCursor(updatetime);
  return { days: readings.length, latest };
}
