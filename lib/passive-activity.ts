/**
 * Passive daily movement (steps/distance the device counts in the background)
 * is kept separate from deliberate cardio sessions: stored in full, but when it
 * feeds energy expenditure it must not double-count the distance already
 * covered by a logged session that day.
 */

/** Net cost of walking ≈ 0.5 kcal per kg per km (on top of resting metabolism). */
export const WALK_NET_KCAL_PER_KG_KM = 0.5;

/** Passive walking distance that ISN'T already covered by deliberate cardio
 * sessions that day (so expenditure isn't counted twice). Never negative. */
export function netPassiveKm(dailyDistanceKm: number, sessionDistanceKm: number): number {
  return Math.max(0, dailyDistanceKm - sessionDistanceKm);
}

/** Calories from a distance of passive walking, given bodyweight. */
export function passiveWalkKcal(netKm: number, weightKg: number | null): number {
  if (!weightKg || weightKg <= 0 || netKm <= 0) return 0;
  return Math.round(netKm * weightKg * WALK_NET_KCAL_PER_KG_KM);
}
