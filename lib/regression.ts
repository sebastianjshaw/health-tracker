/**
 * Shared time-series maths for the weight-derived insights (measured TDEE,
 * plateau detection). Day differences use UTC midnights — DST-immune, and only
 * the *difference* matters, so this stays correct across the Mar/Oct switches.
 */

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/** Least-squares slope (value per day) of dated points. 0 with fewer than two
 * points or no time spread. */
export function slopePerDay(points: { date: string; value: number }[]): number {
  if (points.length < 2) return 0;
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}
