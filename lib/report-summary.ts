import { parseISO } from "./date";

/**
 * Weight summary for the doctor report, scoped to a date range. Pure so the
 * range-scoping (the chart + baseline→current must reflect From/To, not the
 * whole history) is unit-testable. Input is expected ascending by date; the
 * caller already bounds the query, but we clamp again here as a safety net so a
 * dropped query bound can't silently re-show the full series.
 */
export type WeighIn = { date: string; weight: number; bodyFat: number | null };

export type WeightSummary = {
  series: WeighIn[];
  baseline: { weight: number; date: string } | null;
  current: { weight: number; date: string } | null;
  changeKg: number | null;
  changePct: number | null;
  kgPerWeek: number | null;
};

export function summariseWeights(all: WeighIn[], from: string, to: string): WeightSummary {
  const series = all.filter((w) => w.date >= from && w.date <= to);
  const baseline = series[0] ? { weight: series[0].weight, date: series[0].date } : null;
  const last = series[series.length - 1];
  const current = last ? { weight: last.weight, date: last.date } : null;

  let changeKg: number | null = null;
  let changePct: number | null = null;
  let kgPerWeek: number | null = null;
  if (baseline && current) {
    changeKg = Math.round((current.weight - baseline.weight) * 10) / 10;
    changePct = baseline.weight ? Math.round((changeKg / baseline.weight) * 1000) / 10 : null;
    const weeks =
      (parseISO(current.date).getTime() - parseISO(baseline.date).getTime()) / (7 * 86400000);
    kgPerWeek = weeks > 0 ? Math.round((changeKg / weeks) * 100) / 100 : null;
  }

  return { series, baseline, current, changeKg, changePct, kgPerWeek };
}
