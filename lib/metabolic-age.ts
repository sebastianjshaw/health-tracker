/**
 * Body-composition derivations the provider doesn't expose directly.
 *
 * Google Health only surfaces weight and body-fat %, so lean mass and a
 * Withings-style "metabolic age" are computed here rather than synced. These are
 * estimates, not measurements (bone/visceral/water mass aren't recoverable).
 */

/** Sex term in the Mifflin-St Jeor equation; "other"/unset uses the midpoint. */
function sexAdjustment(sex: string): number {
  return sex === "male" ? 5 : sex === "female" ? -161 : -78;
}

/** Lean body mass (kg) = weight minus fat mass. Null if either input missing. */
export function leanBodyMass(
  weightKg: number | null,
  bodyFatPct: number | null,
): number | null {
  if (!weightKg || weightKg <= 0) return null;
  if (bodyFatPct == null || bodyFatPct < 0 || bodyFatPct >= 100) return null;
  return Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
}

/** Katch-McArdle BMR (kcal/day) from lean mass — body-composition based, so it
 * rewards muscle independent of age/sex. */
export function katchMcArdleBmr(leanKg: number): number {
  return 370 + 21.6 * leanKg;
}

/**
 * Estimated "metabolic age": the chronological age at which the population-
 * average (Mifflin-St Jeor) basal metabolic rate equals your body-composition-
 * based (Katch-McArdle) BMR. Carrying more lean mass than average for your size
 * reads younger; higher body fat reads older. Mirrors how smart scales surface
 * the figure (their exact algorithm is proprietary). Clamped to a sane 18–80.
 *
 * Needs weight, height and a body-fat reading; returns null otherwise.
 */
export function metabolicAge(opts: {
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  sex: string;
}): number | null {
  const lbm = leanBodyMass(opts.weightKg, opts.bodyFatPct);
  if (lbm == null || !opts.heightCm || opts.heightCm <= 0 || !opts.weightKg) return null;
  const km = katchMcArdleBmr(lbm);
  // Mifflin: BMR = 10w + 6.25h - 5·age + s  ⇒  age = (10w + 6.25h + s - BMR) / 5
  const age =
    (10 * opts.weightKg + 6.25 * opts.heightCm + sexAdjustment(opts.sex) - km) / 5;
  return Math.round(Math.max(18, Math.min(80, age)));
}

export type BodyComposition = {
  /** The date of the reading these figures derive from. */
  date: string;
  leanMassKg: number;
  metabolicAge: number | null;
};

/**
 * Lean mass + metabolic age from the most recent reading that has BOTH a weight
 * and a body-fat figure, so the two numbers are always derived from the same
 * measurement (never a fresh weight paired with a stale body-fat reading).
 * `readings` must be newest-first. Null if no reading carries both.
 */
export function latestBodyComposition(
  readings: { date: string; weightKg: number | null; bodyFatPct: number | null }[],
  profile: { heightCm: number | null; sex: string },
): BodyComposition | null {
  for (const r of readings) {
    const lean = leanBodyMass(r.weightKg, r.bodyFatPct);
    if (lean == null) continue; // needs both weight and a valid body-fat %
    return {
      date: r.date,
      leanMassKg: lean,
      metabolicAge: metabolicAge({
        weightKg: r.weightKg,
        heightCm: profile.heightCm,
        bodyFatPct: r.bodyFatPct,
        sex: profile.sex,
      }),
    };
  }
  return null;
}
