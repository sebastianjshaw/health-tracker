import { addDays } from "./date";
import { daysBetween, slopePerDay } from "./regression";
import { KCAL_PER_KG } from "./weight-prediction";

/**
 * Measured ("adaptive") TDEE: your real average daily energy expenditure, fit
 * from logged intake vs. actual weight change rather than a BMR formula.
 *
 *   intake − expenditure = Δenergy/day = (Δweight × KCAL_PER_KG) / days
 *   ⇒ expenditure (TDEE) = mean daily intake − (weight slope × KCAL_PER_KG)
 *
 * This captures everything — NEAT, exercise, adaptation — because it's derived
 * from what actually happened, so it's usually more accurate than BMR × factor.
 * Accuracy hinges on logging completeness, hence the coverage/span guards.
 */

export type TdeeEstimate = {
  /** kcal/day, rounded to the nearest 10. */
  tdee: number;
  /** Mean daily contingency-adjusted intake over the window. */
  meanIntake: number;
  /** Weight trend (kg/week) from least-squares regression; negative = losing. */
  trendKgPerWeek: number;
  /** Days spanned, and how many had food logged. */
  spanDays: number;
  daysLogged: number;
  confidence: "low" | "medium" | "high";
};

const MIN_SPAN_DAYS = 14; // shorter windows are dominated by water-weight noise
const MIN_COVERAGE = 0.5; // at least half the days logged

export function measuredTdee(opts: {
  weighIns: { date: string; weight: number }[]; // ascending by date
  intakeByDate: Map<string, number>; // contingency-adjusted kcal; absent/0 = unlogged
  today: string;
  windowDays?: number; // default 28
}): TdeeEstimate | null {
  const windowDays = opts.windowDays ?? 28;
  const cutoff = addDays(opts.today, -(windowDays - 1));
  const w = opts.weighIns.filter((p) => p.date >= cutoff && p.date <= opts.today);
  if (w.length < 2) return null;

  const spanDays = daysBetween(w[0].date, w[w.length - 1].date);
  if (spanDays < MIN_SPAN_DAYS) return null;

  // Days from the first to last weigh-in; mean intake over the ones that were logged.
  const intakes: number[] = [];
  for (let d = w[0].date; d <= w[w.length - 1].date; d = addDays(d, 1)) {
    const v = opts.intakeByDate.get(d);
    if (v != null && v > 0) intakes.push(v);
  }
  if (intakes.length / (spanDays + 1) < MIN_COVERAGE) return null;
  const meanIntake = Math.round(intakes.reduce((a, b) => a + b, 0) / intakes.length);

  const slope = slopePerDay(w.map((p) => ({ date: p.date, value: p.weight }))); // kg/day
  const tdee = Math.round((meanIntake - slope * KCAL_PER_KG) / 10) * 10;

  const coverage = intakes.length / (spanDays + 1);
  const confidence: TdeeEstimate["confidence"] =
    spanDays >= 28 && coverage >= 0.8 && w.length >= 4
      ? "high"
      : spanDays >= 21 && coverage >= 0.65
        ? "medium"
        : "low";

  return {
    tdee,
    meanIntake,
    trendKgPerWeek: Math.round(slope * 7 * 100) / 100,
    spanDays,
    daysLogged: intakes.length,
    confidence,
  };
}
