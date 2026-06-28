/**
 * Derived fitness metrics computed from data we already hold — no extra sync.
 *  - VO₂max estimate from a run's distance + time (Daniels–Gilbert), the standard
 *    race-predictor model. Only needs distance + duration.
 *  - Training load + acute:chronic workload ratio (ACWR) from cardio sessions, an
 *    over/under-training signal (sweet spot ~0.8–1.3; >1.5 = spike/injury risk).
 */
import type { CardioType } from "./constants";

/** Daniels–Gilbert VO₂max from a steady run. Returns null for implausible input. */
export function vo2maxFromRun(distanceKm: number, durationMin: number): number | null {
  if (!(distanceKm > 0) || !(durationMin > 0)) return null;
  const v = (distanceKm * 1000) / durationMin; // m/min
  const t = durationMin;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  const vo2max = vo2 / pct;
  return vo2max > 20 && vo2max < 90 ? Math.round(vo2max * 10) / 10 : null;
}

/** Relative cardiovascular demand per minute, by activity type — a rough TRIMP
 * substitute when we don't have continuous HR for every session. */
export const LOAD_INTENSITY: Record<CardioType, number> = {
  run: 1.0,
  row: 0.9,
  swim: 0.9,
  hike: 0.8,
  bike: 0.7,
  other: 0.6,
  walk: 0.4,
};

export type LoadSession = { date: string; type: string; durationMin: number | null };

/** Total load per day = Σ duration × type-intensity. */
export function dailyLoad(sessions: LoadSession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (!s.durationMin) continue;
    const w = LOAD_INTENSITY[s.type as CardioType] ?? 0.6;
    m.set(s.date, (m.get(s.date) ?? 0) + s.durationMin * w);
  }
  return m;
}

export type Acwr = { acute: number; chronic: number; ratio: number | null; zone: "low" | "ok" | "high" | "none" };

/** Acute (7-day total) vs chronic (28-day weekly average) load at `end`. */
export function acwr(loads: Map<string, number>, end: string): Acwr {
  const dayMs = 86_400_000;
  const endT = Date.parse(`${end}T00:00:00Z`);
  let acute = 0;
  let chronic28 = 0;
  for (const [date, load] of loads) {
    const ageDays = Math.floor((endT - Date.parse(`${date}T00:00:00Z`)) / dayMs);
    if (ageDays < 0) continue;
    if (ageDays < 7) acute += load;
    if (ageDays < 28) chronic28 += load;
  }
  const chronic = chronic28 / 4; // 28-day total → weekly equivalent
  if (chronic <= 0) return { acute, chronic, ratio: null, zone: "none" };
  const ratio = Math.round((acute / chronic) * 100) / 100;
  const zone = ratio < 0.8 ? "low" : ratio <= 1.3 ? "ok" : "high";
  return { acute: Math.round(acute), chronic: Math.round(chronic), ratio, zone };
}
