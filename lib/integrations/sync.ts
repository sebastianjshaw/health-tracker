import "server-only";
import { db } from "@/db";
import { cardioSessions, heartRateDaily, sleepSessions } from "@/db/schema";
import { CardioType } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import {
  DATA_TYPES,
  getAccessToken,
  getCursor,
  listDataPoints,
  setCursor,
} from "./google-health";

const SOURCE = "google-health";
const MIN_EXERCISE_MIN = 10; // below this, with no distance, treat as auto-detected noise

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
};

export async function syncGoogleHealth(): Promise<SyncSummary> {
  const token = await getAccessToken();
  if (!token) throw new Error("Google Health is not connected.");

  const today = todayISO();
  // First sync (no cursor) imports full history; then we go incremental.
  const start = (await getCursor()) ?? "2015-01-01";
  const summary: SyncSummary = { from: start, to: today, exercise: 0, sleep: 0, restingHr: 0 };

  // ---- Exercise → cardioSessions ----
  // exercise is a session type — it rejects time filters, so fetch all and
  // window client-side by start date.
  const exPoints = await listDataPoints(token, DATA_TYPES.exercise);
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
    if (!ex || !date || !externalId || date < start) continue;

    const m = ex.metricsSummary ?? {};
    const durationMin = durationToMin(ex.activeDuration);
    const distanceKm = m.distanceMillimeters != null ? m.distanceMillimeters / 1_000_000 : null;

    // Skip Google Fit's auto-detected micro-activities: short blips with no
    // distance (e.g. 1–5 min "OTHER"). Keep anything with a distance or ≥10 min.
    if ((distanceKm == null || distanceKm === 0) && (durationMin == null || durationMin < MIN_EXERCISE_MIN)) {
      continue;
    }

    const row = {
      date,
      type: exerciseToCardio(ex.exerciseType),
      durationMin,
      distanceKm,
      avgHr: num(m.averageHeartRateBeatsPerMinute),
      kcal: m.caloriesKcal != null ? Math.round(m.caloriesKcal) : null,
    };
    await db
      .insert(cardioSessions)
      .values({ ...row, source: SOURCE, externalId })
      .onConflictDoUpdate({
        target: [cardioSessions.source, cardioSessions.externalId],
        set: row,
      });
    summary.exercise++;
  }

  // ---- Sleep → sleepSessions ---- (session type: fetch all, window client-side)
  const sleepPoints = await listDataPoints(token, DATA_TYPES.sleep);
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
    await db
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
      });
    summary.sleep++;
  }

  // ---- Daily resting heart rate → heartRateDaily ----
  // Daily summary type supports a server-side date filter.
  const hrPoints = await listDataPoints(
    token,
    DATA_TYPES.restingHr,
    `daily_resting_heart_rate.date >= "${start}"`,
  );
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
    await db
      .insert(heartRateDaily)
      .values({ date, restingBpm: Math.round(bpm), source: SOURCE, externalId })
      .onConflictDoUpdate({
        target: [heartRateDaily.source, heartRateDaily.externalId],
        set: { date, restingBpm: Math.round(bpm) },
      });
    summary.restingHr++;
  }

  await setCursor(today);
  return summary;
}
