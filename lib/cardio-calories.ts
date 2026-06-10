import type { CardioType } from "./constants";

/**
 * Metabolic-equivalent (MET) values per cardio type — moderate-effort
 * mid-points from the Compendium of Physical Activities. Used only to estimate
 * calories when an imported session doesn't carry a measured figure.
 */
export const CARDIO_MET: Record<CardioType, number> = {
  run: 9.8,
  bike: 7.5,
  row: 7.0,
  swim: 7.0,
  walk: 3.5,
  other: 5.0,
};

/** Bodyweight assumed when no weigh-in exists yet (kg). */
export const DEFAULT_WEIGHT_KG = 80;

/**
 * Estimate calories burned: kcal = MET × weight(kg) × hours.
 * Returns null when there's no usable duration to base it on.
 */
export function estimateCardioKcal(
  type: CardioType,
  durationMin: number | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (durationMin == null || durationMin <= 0) return null;
  const weight = weightKg != null && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  const met = CARDIO_MET[type] ?? CARDIO_MET.other;
  return Math.round((met * weight * durationMin) / 60);
}
