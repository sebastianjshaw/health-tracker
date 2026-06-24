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

export type CompositionBar = { date: string; fatKg: number; leanKg: number; boneKg: number };

/**
 * Per-weigh-in breakdown of bodyweight into fat / lean (soft) / bone, designed
 * to STACK to total weight. Fat-free mass is the scale's measured value when
 * present (else weight×(1−bf)); bone is split out of it when measured, leaving
 * "lean" as the soft lean tissue (≈ Withings' muscle mass). Days with no fat/lean
 * split (weight only) are skipped. Ascending in → ascending out.
 *
 * fat + lean + bone === weight by construction, so the stack height reads as
 * bodyweight and the segments show how that weight is composed over time.
 */
export function compositionBars(
  rows: {
    date: string;
    weight: number;
    bodyFat: number | null;
    leanMass?: number | null;
    boneMass?: number | null;
  }[],
): CompositionBar[] {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const out: CompositionBar[] = [];
  for (const r of rows) {
    const measuredLean = r.leanMass != null && r.leanMass > 0 ? r.leanMass : null;
    const fatFree = measuredLean ?? leanBodyMass(r.weight, r.bodyFat);
    if (fatFree == null) continue; // need a fat/lean split
    const bone = r.boneMass != null && r.boneMass > 0 ? Math.min(r.boneMass, fatFree) : 0;
    out.push({
      date: r.date,
      fatKg: Math.max(0, r1(r.weight - fatFree)),
      leanKg: Math.max(0, r1(fatFree - bone)),
      boneKg: r1(bone),
    });
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
  weightKg: number;
  leanMassKg: number;
  fatMassKg: number | null;
  ffmi: number | null;
  metabolicAge: number | null;
  /** Scale-measured extras (Withings), null when not provided by the reading. */
  muscleMassKg: number | null;
  boneMassKg: number | null;
  hydrationKg: number | null;
  /** True when lean mass came from a scale measurement rather than weight×(1−bf). */
  measured: boolean;
};

type BodyReading = {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  /** Scale-measured fat-free mass (kg), preferred over the derived estimate. */
  leanMassKg?: number | null;
  muscleMassKg?: number | null;
  boneMassKg?: number | null;
  hydrationKg?: number | null;
};

/**
 * Body-composition snapshot (lean mass, fat mass, FFMI, metabolic age, plus the
 * scale's measured muscle/bone) from the most recent reading we can derive lean
 * mass for — a scale-MEASURED fat-free mass if present, else weight×(1−bf) which
 * needs both a weight and a body-fat figure. Preferring the same reading keeps
 * every number off one measurement. `readings` must be newest-first; null if
 * none yields a lean mass.
 */
export function latestBodyComposition(
  readings: BodyReading[],
  profile: { heightCm: number | null; sex: string },
): BodyComposition | null {
  for (const r of readings) {
    const measuredLean = r.leanMassKg != null && r.leanMassKg > 0 ? r.leanMassKg : null;
    const lean = measuredLean ?? leanBodyMass(r.weightKg, r.bodyFatPct);
    if (lean == null || r.weightKg == null) continue;
    const h = profile.heightCm;
    return {
      date: r.date,
      weightKg: r.weightKg,
      leanMassKg: Math.round(lean * 10) / 10,
      // Measured lean → fat is the remainder; else fall back to the bf-derived split.
      fatMassKg: measuredLean != null
        ? Math.round((r.weightKg - measuredLean) * 10) / 10
        : fatMass(r.weightKg, r.bodyFatPct),
      ffmi: h && h > 0 ? Math.round((lean / ((h / 100) * (h / 100))) * 10) / 10 : null,
      metabolicAge: metabolicAge({
        weightKg: r.weightKg,
        heightCm: profile.heightCm,
        bodyFatPct: r.bodyFatPct,
        sex: profile.sex,
      }),
      muscleMassKg: r.muscleMassKg ?? null,
      boneMassKg: r.boneMassKg ?? null,
      hydrationKg: r.hydrationKg ?? null,
      measured: measuredLean != null,
    };
  }
  return null;
}
