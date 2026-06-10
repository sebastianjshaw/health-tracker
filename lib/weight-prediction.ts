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
 */
export function predictWeights(opts: {
  weighIns: WeighIn[]; // ascending by date
  intakeByDate: Map<string, number>; // contingency-adjusted kcal; absent/0 = unlogged
  cardioByDate: Map<string, number>; // kcal burned in logged cardio
  heightCm: number | null;
  age: number | null;
  sex: string;
}): WeightPrediction[] {
  const { weighIns, intakeByDate, cardioByDate, heightCm, age, sex } = opts;
  const out: WeightPrediction[] = [];

  for (let i = 1; i < weighIns.length; i++) {
    const anchor = weighIns[i - 1];
    const cur = weighIns[i];
    const days = daysAfter(anchor.date, cur.date);
    if (days.length === 0 || days.length > MAX_GAP_DAYS) continue;

    // BMR at the anchor weight is a fair constant across a short window.
    const base = bmr(anchor.weight, heightCm, age, sex);
    if (base == null) continue;
    const maintenance = base * BASELINE_ACTIVITY_FACTOR;

    const loggedIntakes = days
      .map((d) => intakeByDate.get(d))
      .filter((v): v is number => v != null && v > 0);
    if (loggedIntakes.length / days.length < MIN_COVERAGE) continue;
    const meanIntake =
      loggedIntakes.reduce((s, v) => s + v, 0) / loggedIntakes.length;

    let netKcal = 0;
    for (const d of days) {
      const raw = intakeByDate.get(d);
      const intake = raw != null && raw > 0 ? raw : meanIntake; // fill rare gaps
      const burn = maintenance + (cardioByDate.get(d) ?? 0);
      netKcal += intake - burn;
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
