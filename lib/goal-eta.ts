import { addDays, parseISO } from "./date";

export type WeighInPoint = { date: string; weight: number };
export type GoalEta = {
  /** Projected date the goal is reached (YYYY-MM-DD). */
  date: string;
  /** Trend rate (kg/week; negative = losing). */
  kgPerWeek: number;
  /** Days from `today` to the projected date. */
  days: number;
};

/**
 * Estimate when the goal weight will be reached, from the least-squares slope of
 * the weigh-ins over time. Returns null when there isn't enough data, the trend
 * isn't moving toward the goal, or the ETA is implausibly far (≈ stalled).
 *
 * Fits the weigh-ins directly rather than a trailing moving average: because the
 * caller passes only the weigh-ins in the selected window, an in-window MA warms
 * up on the window's opening point (barely smoothed) while its tail lags the
 * latest weight, which flattened the slope and made the rate read lower than the
 * period's actual loss. Least-squares over ~a month of points already averages
 * out day-to-day water-weight noise in the slope.
 */
export function projectGoalEta(
  weighIns: WeighInPoint[],
  goal: number,
  today: string,
): GoalEta | null {
  if (weighIns.length < 5) return null;

  const firstMs = parseISO(weighIns[0].date).getTime();
  const dayOf = (d: string) => (parseISO(d).getTime() - firstMs) / 86_400_000;
  const xs = weighIns.map((p) => dayOf(p.date));
  const ys = weighIns.map((p) => p.weight);
  if (xs[xs.length - 1] < 7) return null; // need at least a week of span

  // Least-squares slope (kg/day).
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den; // kg/day

  const current = ys[ys.length - 1];
  const remaining = goal - current; // <0 when there's weight to lose
  // Only project when the trend actually heads toward the goal.
  if (Math.sign(slope) !== Math.sign(remaining)) return null;

  const days = remaining / slope;
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return null; // cap ~10y (≈ stalled)

  return {
    date: addDays(today, Math.round(days)),
    kgPerWeek: Math.round(slope * 7 * 100) / 100,
    days: Math.round(days),
  };
}
