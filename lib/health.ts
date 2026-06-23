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
 * Suggested daily protein (g) from bodyweight. ~1.6–2.2 g/kg preserves lean
 * mass in a deficit (the classic "1 g per lb" ≈ 2.2 g/kg); we use 2.0 g/kg as a
 * sensible middle, rounded to the nearest 5 g. Null without a weight.
 */
const PROTEIN_PER_KG_LEAN = 2.2; // ≈1 g/lb of lean mass — the standard "general rule"

/**
 * Suggested daily protein (g), rounded to 5 g. Preferred basis is LEAN mass
 * (2.2 g/kg ≈ 1 g/lb lean): per-bodyweight over-prescribes when there's a lot of
 * fat to lose. When body fat isn't known, fall back to bodyweight — easing to
 * ~1.3 g/kg for an obese BMI (≈0.6 g/lb, the simplified high-body-fat rule) and
 * 2.0 g/kg otherwise. Null without a weight.
 */
export function suggestedProtein(
  currentWeightKg: number | null,
  bodyFatPct: number | null = null,
  heightCm: number | null = null,
): number | null {
  if (!currentWeightKg || currentWeightKg <= 0) return null;
  const round5 = (g: number) => Math.round(g / 5) * 5;
  const lean = leanBodyMass(currentWeightKg, bodyFatPct);
  if (lean != null) return round5(lean * PROTEIN_PER_KG_LEAN);
  const b = bmi(currentWeightKg, heightCm);
  if (b != null && b >= 30) return round5(currentWeightKg * 1.3); // obese proxy for high body fat
  return round5(currentWeightKg * 2.0);
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
