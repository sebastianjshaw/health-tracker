import { addDays } from "./date";

/**
 * Weight-loss plateau detection. A plateau is a flat weight trend sustained over
 * several weeks *while still trying to lose* — the cue to recalc the target
 * (against measured TDEE) or take a planned diet break. A flat trend when you're
 * not in a deficit is just maintenance, not a plateau.
 */

export type PlateauResult = {
  plateaued: boolean;
  /** Weight trend (kg/week) over the recent window. */
  trendKgPerWeek: number;
  /** Whole weeks the window covers. */
  weeks: number;
};

const FLAT_KG_PER_WEEK = 0.1; // |trend| below this counts as flat

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/** Least-squares kg/day over the weigh-ins. */
function slopePerDay(w: { date: string; weight: number }[]): number {
  const xs = w.map((p) => daysBetween(w[0].date, p.date));
  const ys = w.map((p) => p.weight);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

export function detectPlateau(opts: {
  weighIns: { date: string; weight: number }[]; // ascending
  today: string;
  /** Whether the user is actively trying to lose (goal below current weight). */
  tryingToLose: boolean;
  weeks?: number; // window length, default 3
}): PlateauResult {
  const weeks = opts.weeks ?? 3;
  const cutoff = addDays(opts.today, -(weeks * 7 - 1));
  const w = opts.weighIns.filter((p) => p.date >= cutoff && p.date <= opts.today);
  if (w.length < 3) return { plateaued: false, trendKgPerWeek: 0, weeks };

  const span = daysBetween(w[0].date, w[w.length - 1].date);
  const trendKgPerWeek = Math.round(slopePerDay(w) * 7 * 100) / 100;
  // Need most of the window covered before calling it a plateau.
  const plateaued =
    opts.tryingToLose && span >= (weeks - 1) * 7 && Math.abs(trendKgPerWeek) < FLAT_KG_PER_WEEK;
  return { plateaued, trendKgPerWeek, weeks };
}
