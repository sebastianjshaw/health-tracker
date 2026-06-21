/**
 * Long-horizon weight views over the multi-year history: average weight per
 * calendar month (seasonality) and per year (year-over-year drift).
 */

export type WeighIn = { date: string; weight: number };

export type MonthlyAverage = {
  /** 1–12. */
  month: number;
  label: string; // "Jan" … "Dec"
  avgWeight: number;
  count: number;
};

export type YearlyAverage = {
  year: number;
  avgWeight: number;
  min: number;
  max: number;
  count: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Mean weight per calendar month across all years (seasonality). Only months
 * with data are returned, ordered Jan→Dec. */
export function monthlyAverages(weighIns: WeighIn[]): MonthlyAverage[] {
  const buckets = new Map<number, number[]>();
  for (const w of weighIns) {
    const month = Number(w.date.slice(5, 7));
    if (!month) continue;
    (buckets.get(month) ?? buckets.set(month, []).get(month)!).push(w.weight);
  }
  return [...buckets.entries()]
    .map(([month, ws]) => ({
      month,
      label: MONTHS[month - 1],
      avgWeight: r1(ws.reduce((a, b) => a + b, 0) / ws.length),
      count: ws.length,
    }))
    .sort((a, b) => a.month - b.month);
}

/** Mean/min/max weight per calendar year, ascending. */
export function yearlyAverages(weighIns: WeighIn[]): YearlyAverage[] {
  const buckets = new Map<number, number[]>();
  for (const w of weighIns) {
    const year = Number(w.date.slice(0, 4));
    if (!year) continue;
    (buckets.get(year) ?? buckets.set(year, []).get(year)!).push(w.weight);
  }
  return [...buckets.entries()]
    .map(([year, ws]) => ({
      year,
      avgWeight: r1(ws.reduce((a, b) => a + b, 0) / ws.length),
      min: r1(Math.min(...ws)),
      max: r1(Math.max(...ws)),
      count: ws.length,
    }))
    .sort((a, b) => a.year - b.year);
}
