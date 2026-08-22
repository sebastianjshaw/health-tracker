import { addDays } from "./date";
import { bmr } from "./health";

/** kcal of energy per kg of body mass (≈ the classic 7700 kcal/kg of fat). */
export const KCAL_PER_KG = 7700;

/**
 * Resting maintenance multiplier on BMR. Deliberately low (sedentary baseline /
 * NEAT only) because deliberate exercise is added on top from logged cardio,
 * so it must not be double-counted in the baseline.
 */
export const BASELINE_ACTIVITY_FACTOR = 1.2;

/** Largest gap (days) between two weigh-ins we'll still predict across — beyond
 * this, accumulated estimation error makes the prediction meaningless. */
export const MAX_GAP_DAYS = 21;

/** Minimum fraction of days in the window that must have food logged. */
export const MIN_COVERAGE = 0.6;

export type WeighIn = { date: string; weight: number };

/** Per-weigh-in prediction (endpoint view): each weigh-in vs the projection from
 *  the prior one. Used by the MCP get_weight_trend tool. */
export type WeightPrediction = {
  /** The weigh-in date this prediction lands on. */
  date: string;
  /** Estimated weight from the prior weigh-in + the window's energy balance. */
  predicted: number;
  /** The measured weight on that date (for direct comparison). */
  actual: number;
  /** predicted − actual (kg). Positive ⇒ you lost more than the logs imply
   * (under-reported intake / contingency too low); negative ⇒ lost less. */
  gap: number;
  /** Mean daily energy balance over the window (kcal; negative = deficit). */
  perDayKcal: number;
  /** Days spanned from the anchoring weigh-in. */
  windowDays: number;
};

/** Daily theoretical-weight point (continuous view): a value for every day,
 *  including days after the last weigh-in. Used by the stats weight chart. */
export type DailyWeightPrediction = {
  /** The day this predicted weight lands on. */
  date: string;
  /** Estimated weight = the most recent prior weigh-in + the running energy
   * balance since it (the "theoretical" weight from logged food & exercise). */
  predicted: number;
  /** The measured weight that day, when a weigh-in exists — so the theoretical
   * line can be compared against reality. Null on projected-only days (including
   * every day after the last weigh-in). */
  actual: number | null;
};

/** Inclusive list of ISO dates strictly after `from`, up to and including `to`. */
function daysAfter(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * For each weigh-in (anchored on the previous one), estimate what the weight
 * "should" be from the energy balance of the intervening days:
 *   Δweight = Σ(intake − [BMR·factor + cardio]) / KCAL_PER_KG
 * Intake is the contingency-adjusted figure the caller passes in. Windows with
 * too large a gap, or too little logged food, are skipped (no dot emitted).
 *
 * The endpoint counterpart to predictDailyWeights (which shares the same
 * energy-balance model but emits a value for every day). See that function's
 * doc for how gross cardio is netted against resting metabolism.
 */
export function predictWeights(opts: {
  weighIns: WeighIn[]; // ascending by date
  intakeByDate: Map<string, number>; // contingency-adjusted kcal; absent/0 = unlogged
  cardioByDate: Map<string, number>; // gross kcal burned in logged cardio (+ net passive)
  cardioMinutesByDate?: Map<string, number>; // minutes of logged cardio sessions (for the resting offset)
  heightCm: number | null;
  age: number | null;
  sex: string;
}): WeightPrediction[] {
  const { weighIns, intakeByDate, cardioByDate, cardioMinutesByDate, heightCm, age, sex } = opts;
  const out: WeightPrediction[] = [];

  for (let i = 1; i < weighIns.length; i++) {
    const anchor = weighIns[i - 1];
    const cur = weighIns[i];
    const days = daysAfter(anchor.date, cur.date);
    if (days.length === 0 || days.length > MAX_GAP_DAYS) continue;

    const base = bmr(anchor.weight, heightCm, age, sex);
    if (base == null) continue;
    const maintenance = base * BASELINE_ACTIVITY_FACTOR;
    const restingPerMin = base / 1440;

    const loggedIntakes = days
      .map((d) => intakeByDate.get(d))
      .filter((v): v is number => v != null && v > 0);
    if (loggedIntakes.length / days.length < MIN_COVERAGE) continue;
    const meanIntake = loggedIntakes.reduce((s, v) => s + v, 0) / loggedIntakes.length;

    let netKcal = 0;
    for (const d of days) {
      const raw = intakeByDate.get(d);
      const intake = raw != null && raw > 0 ? raw : meanIntake;
      const restCardio = restingPerMin * (cardioMinutesByDate?.get(d) ?? 0);
      const cardio = Math.max(0, (cardioByDate.get(d) ?? 0) - restCardio);
      netKcal += intake - (maintenance + cardio);
    }

    const predicted = r1(anchor.weight + netKcal / KCAL_PER_KG);
    out.push({
      date: cur.date,
      predicted,
      actual: cur.weight,
      gap: r1(predicted - cur.weight),
      perDayKcal: Math.round(netKcal / days.length),
      windowDays: days.length,
    });
  }

  return out;
}

/**
 * A theoretical daily weight from energy balance. Each day is anchored on the
 * most recent prior weigh-in and accumulates:
 *   Δweight = Σ(intake − [BMR·factor + cardio]) / KCAL_PER_KG
 * so between weigh-ins the line shows what the logs imply, and after the last
 * weigh-in it projects forward (up to MAX_GAP_DAYS) — letting you compare the
 * projection against the next real weigh-in as an honesty check. At each weigh-in
 * day the `actual` weight is attached alongside the projected value.
 *
 * A weigh-in re-anchors the line to the measured weight, so error doesn't
 * accumulate indefinitely. Closed windows with too large a gap, or too little
 * logged food, are skipped (the line breaks). Intake is the contingency-adjusted
 * figure the caller passes in.
 *
 * `cardioByDate` is the gross energy a device (e.g. Fitbit) reports for logged
 * sessions, which INCLUDES the resting metabolism the person would burn anyway.
 * Since `maintenance` already covers resting for all 24h, we subtract the resting
 * cost of the session minutes (`cardioMinutesByDate`) so exercise counts only its
 * *net* cost — otherwise a heavy-exercise stretch (e.g. a walking holiday) double-
 * counts resting energy and wrongly predicts a loss. Passive walking, folded into
 * `cardioByDate` by the caller, is already a net figure and carries no minutes, so
 * it is left untouched.
 */
export function predictDailyWeights(opts: {
  weighIns: WeighIn[]; // ascending by date
  end: string; // project the trailing (open) segment through this date, typically today
  intakeByDate: Map<string, number>; // contingency-adjusted kcal; absent/0 = unlogged
  cardioByDate: Map<string, number>; // gross kcal burned in logged cardio (+ net passive)
  cardioMinutesByDate?: Map<string, number>; // minutes of logged cardio sessions (for the resting offset)
  heightCm: number | null;
  age: number | null;
  sex: string;
}): DailyWeightPrediction[] {
  const { weighIns, end, intakeByDate, cardioByDate, cardioMinutesByDate, heightCm, age, sex } =
    opts;
  const out: DailyWeightPrediction[] = [];
  const actualByDate = new Map(weighIns.map((w) => [w.date, w.weight]));

  for (let i = 0; i < weighIns.length; i++) {
    const anchor = weighIns[i];
    const next = weighIns[i + 1];
    const isOpen = !next; // the trailing segment past the last weigh-in
    let days = daysAfter(anchor.date, next ? next.date : end);
    // The open forward projection is only trustworthy for a limited horizon;
    // closed windows beyond the gap limit are too error-prone to draw at all.
    if (isOpen) days = days.slice(0, MAX_GAP_DAYS);
    else if (days.length > MAX_GAP_DAYS) continue;
    if (days.length === 0) continue;

    // BMR at the anchor weight is a fair constant across a short window.
    const base = bmr(anchor.weight, heightCm, age, sex);
    if (base == null) continue;
    const maintenance = base * BASELINE_ACTIVITY_FACTOR;
    const restingPerMin = base / 1440; // resting kcal/min, to net out of session gross

    const loggedIntakes = days
      .map((d) => intakeByDate.get(d))
      .filter((v): v is number => v != null && v > 0);
    if (loggedIntakes.length / days.length < MIN_COVERAGE) continue;
    const meanIntake = loggedIntakes.reduce((s, v) => s + v, 0) / loggedIntakes.length;

    let running = anchor.weight;
    for (const d of days) {
      const raw = intakeByDate.get(d);
      const intake = raw != null && raw > 0 ? raw : meanIntake; // fill rare gaps
      // Net the resting cost of the session minutes out of the device's gross
      // cardio figure so resting isn't counted twice (maintenance already has it).
      const restCardio = restingPerMin * (cardioMinutesByDate?.get(d) ?? 0);
      const cardio = Math.max(0, (cardioByDate.get(d) ?? 0) - restCardio);
      running += (intake - (maintenance + cardio)) / KCAL_PER_KG;
      out.push({ date: d, predicted: r1(running), actual: actualByDate.get(d) ?? null });
    }
  }

  return out;
}
