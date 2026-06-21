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

/** Fat mass (kg). Null if weight or a valid body-fat % is missing. */
export function fatMass(weightKg: number | null, bodyFatPct: number | null): number | null {
  const lean = leanBodyMass(weightKg, bodyFatPct);
  if (lean == null || weightKg == null) return null;
  return Math.round((weightKg - lean) * 10) / 10;
}

/**
 * Fat-Free Mass Index = lean mass (kg) / height (m)² — the muscularity
 * counterpart to BMI (which can't tell muscle from fat). Natural lifters tend
 * to top out around 22–25. Null without lean mass + height.
 */
export function ffmi(
  weightKg: number | null,
  bodyFatPct: number | null,
  heightCm: number | null,
): number | null {
  const lean = leanBodyMass(weightKg, bodyFatPct);
  if (lean == null || !heightCm || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((lean / (m * m)) * 10) / 10;
}

export type BodyCompPoint = { date: string; fatKg: number; leanKg: number };

/** Fat/lean mass split per weigh-in that has both weight and body-fat (others
 * are skipped). Ascending in → ascending out. */
export function bodyCompSeries(
  weighIns: { date: string; weight: number; bodyFat: number | null }[],
): BodyCompPoint[] {
  const out: BodyCompPoint[] = [];
  for (const w of weighIns) {
    const lean = leanBodyMass(w.weight, w.bodyFat);
    if (lean == null) continue;
    out.push({ date: w.date, fatKg: Math.round((w.weight - lean) * 10) / 10, leanKg: lean });
  }
  return out;
}

/** Midpoint of a healthy body-fat range by sex (%). Excess fat above this ages
 * the metabolic-age estimate. */
function healthyBodyFat(sex: string): number {
  return sex === "male" ? 15 : sex === "female" ? 23 : 19;
}

/** Years added to metabolic age per body-fat point above the healthy midpoint.
 * Adiposity is the dominant driver of cardiometabolic mortality risk, so it has
 * to bite — a pure lean-mass/BMR model reads obese-but-heavy people as young
 * because absolute lean mass scales with bodyweight. */
const FAT_PENALTY_PER_POINT = 0.8;

/**
 * Estimated "metabolic age". Two signals:
 *  1. A lean-mass base — the age at which the population-average (Mifflin-St
 *     Jeor) BMR equals your body-composition (Katch-McArdle) BMR. More muscle
 *     for your size reads younger.
 *  2. A fat penalty — years added for body fat above a healthy level, so
 *     carrying excess fat ages the number even when lean mass is high (which it
 *     is for anyone heavy). Without this, the base alone flatters obesity.
 *
 * Clamped to a sane 18–80. Needs weight, height and a body-fat reading.
 */
export function metabolicAge(opts: {
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  sex: string;
}): number | null {
  const lbm = leanBodyMass(opts.weightKg, opts.bodyFatPct);
  if (lbm == null || !opts.heightCm || opts.heightCm <= 0 || !opts.weightKg) return null;
  const bf = opts.bodyFatPct ?? 0; // non-null here (leanBodyMass would've returned null)
  const km = katchMcArdleBmr(lbm);
  // Mifflin: BMR = 10w + 6.25h - 5·age + s  ⇒  age = (10w + 6.25h + s - BMR) / 5
  const leanBase =
    (10 * opts.weightKg + 6.25 * opts.heightCm + sexAdjustment(opts.sex) - km) / 5;
  const fatPenalty = Math.max(0, bf - healthyBodyFat(opts.sex)) * FAT_PENALTY_PER_POINT;
  return Math.round(Math.max(18, Math.min(80, leanBase + fatPenalty)));
}

export type BodyComposition = {
  /** The date of the reading these figures derive from. */
  date: string;
  leanMassKg: number;
  fatMassKg: number | null;
  ffmi: number | null;
  metabolicAge: number | null;
};

/**
 * Body-composition snapshot (lean mass, fat mass, FFMI, metabolic age) from the
 * most recent reading that has BOTH a weight and a body-fat figure, so every
 * number derives from the same measurement (never a fresh weight paired with a
 * stale body-fat reading). `readings` must be newest-first; null if none carries
 * both.
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
      fatMassKg: fatMass(r.weightKg, r.bodyFatPct),
      ffmi: ffmi(r.weightKg, r.bodyFatPct, profile.heightCm),
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
