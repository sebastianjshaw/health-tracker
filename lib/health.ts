import { isValidISO } from "./date";
import { leanBodyMass } from "./metabolic-age";

/** Body Mass Index from weight (kg) and height (cm). Null if no height. */
export function bmi(weightKg: number, heightCm: number | null): number | null {
  if (!heightCm || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** Waist-to-height ratio — a central-adiposity marker that, unlike BMI, isn't
 * fooled by muscle. Null without both measurements. */
export function waistToHeight(waistCm: number | null, heightCm: number | null): number | null {
  if (!waistCm || waistCm <= 0 || !heightCm || heightCm <= 0) return null;
  return Math.round((waistCm / heightCm) * 100) / 100;
}

/** Risk band for waist-to-height ratio (the widely-used "keep it under 0.5"). */
export function whtrClass(r: number | null): string {
  if (r == null) return "";
  if (r < 0.4) return "Lean";
  if (r < 0.5) return "Healthy";
  if (r < 0.6) return "Increased risk";
  return "High risk";
}

export function bmiClass(b: number | null): string {
  if (b == null) return "";
  if (b < 18.5) return "Underweight";
  if (b < 25) return "Normal";
  if (b < 30) return "Overweight";
  if (b < 35) return "Obese (class I)";
  if (b < 40) return "Obese (class II)";
  return "Obese (class III)";
}

/** Mifflin-St Jeor basal metabolic rate (kcal/day). Null if inputs missing. */
export function bmr(
  weightKg: number | null,
  heightCm: number | null,
  age: number | null,
  sex: string,
): number | null {
  if (!weightKg || !heightCm || age == null) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  // sex adjustment; "other"/unset uses the midpoint of the male/female terms.
  const adj = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return base + adj;
}

// Sedentary-to-light default; a healthy ~0.5 kg/week loss ≈ 550 kcal/day deficit.
const ACTIVITY_FACTOR = 1.4;
const HEALTHY_DEFICIT = 550;

/**
 * Suggested daily calorie target: maintenance (TDEE) at the *current* weight,
 * minus a healthy weight-loss deficit while still above goal weight (so it
 * naturally eases off as weight drops). Floored at a safe minimum. Null if the
 * profile lacks the inputs needed to compute it.
 */
export function suggestedCalorieTarget(opts: {
  currentWeightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: string;
  goalWeightKg: number | null;
}): number | null {
  const b = bmr(opts.currentWeightKg, opts.heightCm, opts.age, opts.sex);
  if (b == null) return null;
  const tdee = b * ACTIVITY_FACTOR;
  const losing =
    opts.goalWeightKg != null && (opts.currentWeightKg ?? 0) > opts.goalWeightKg;
  const raw = losing ? tdee - HEALTHY_DEFICIT : tdee;
  const floor = opts.sex === "female" ? 1200 : 1500;
  return Math.round(Math.max(floor, raw) / 50) * 50;
}

/**
 * Protein target scales by LEAN (fat-free) mass, not total bodyweight, so a
 * higher-body-fat person isn't over-prescribed from their fat mass. 2.2 g/kg FFM
 * sits just UNDER the evidence-based range for preserving muscle in a calorie
 * deficit — 2.3–3.1 g/kg FFM for resistance-trained dieters (Helms 2014), ~2.5
 * g/kg FFM for minimal fat-free-mass loss (recent meta-analysis) — i.e. a
 * deliberately conservative choice that lands around 1.5 g/kg of bodyweight.
 * Muscle preservation matters doubly on a GLP-1, where much of the weight lost
 * can otherwise be lean mass. Rounded to the nearest 5 g.
 */
const PROTEIN_PER_KG_LEAN = 2.2;
const round5 = (g: number) => Math.round(g / 5) * 5;

/** Protein (g, rounded to 5) for a known lean mass (kg) at 2.2 g/kg. The single
 * source of truth for the lean-mass rule; prefer a scale-MEASURED lean mass over
 * the weight×(1−bf) estimate when one is available. Null without a lean mass. */
export function proteinForLeanMass(leanKg: number | null): number | null {
  if (leanKg == null || leanKg <= 0) return null;
  return round5(leanKg * PROTEIN_PER_KG_LEAN);
}

/** Top of the healthy BMI range — caps the reference weight so protein isn't
 *  scaled off excess fat when body fat is unknown. */
const REFERENCE_BMI = 25;
/** g protein per kg of reference (near-lean) weight for the no-body-fat path. */
const PROTEIN_PER_KG_REFERENCE = 2.0;

/**
 * Suggested daily protein (g), rounded to 5 g.
 *
 * Preferred basis is LEAN mass (2.2 g/kg — see proteinForLeanMass): scaling off
 * total bodyweight over-prescribes when there's a lot of fat to lose. When body
 * fat isn't known, fall back to a REFERENCE weight — the actual weight, but
 * capped at the top of the healthy BMI range for their height — so a heavier
 * person is scaled off a near-lean figure rather than their fat mass (e.g. a
 * 112 kg / 1.80 m person uses an 81 kg reference). Without a height we can't form
 * a reference, so use a moderate per-bodyweight figure instead of the higher
 * near-lean multiplier. Null without a weight.
 */
export function suggestedProtein(
  currentWeightKg: number | null,
  bodyFatPct: number | null = null,
  heightCm: number | null = null,
): number | null {
  if (!currentWeightKg || currentWeightKg <= 0) return null;
  const fromLean = proteinForLeanMass(leanBodyMass(currentWeightKg, bodyFatPct));
  if (fromLean != null) return fromLean;
  if (heightCm == null || heightCm <= 0) return round5(currentWeightKg * 1.6);
  const referenceWeight = Math.min(currentWeightKg, REFERENCE_BMI * (heightCm / 100) ** 2);
  return round5(referenceWeight * PROTEIN_PER_KG_REFERENCE);
}

/** Maintenance calories (TDEE) = BMR × the sedentary-to-light activity factor.
 * Null if the profile can't yield a BMR. */
export function maintenanceCalories(opts: {
  currentWeightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: string;
}): number | null {
  const b = bmr(opts.currentWeightKg, opts.heightCm, opts.age, opts.sex);
  return b == null ? null : Math.round(b * ACTIVITY_FACTOR);
}

/** Whole-years age from a YYYY-MM-DD date of birth. Rejects impossible dates
 * (isValidISO round-trips, so "2026-02-30" doesn't silently roll to March). */
export function ageFrom(dob: string): number | null {
  if (!isValidISO(dob)) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const hadBirthday =
    now.getMonth() > m - 1 || (now.getMonth() === m - 1 && now.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
