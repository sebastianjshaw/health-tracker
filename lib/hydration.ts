/**
 * Estimated water intake (mL) from logged food & drink — no separate tracker.
 *
 * Proximate analysis: a food is water + protein + carb + fat + a little ash by
 * mass, so when we know the mass (servingSize × quantity in g/ml) the water is
 * roughly `mass − (protein + carbs + fat)`. Entries logged in abstract units
 * (e.g. "1 serving", "1 Can") carry no mass; for those we only estimate
 * **drinks**, via a sensible default volume, since a solid's mass is unknown.
 */

export type WaterEntry = {
  servingSize: number;
  servingUnit: string;
  quantity: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Library category ('food' | 'drink' | 'other'); drives the no-mass fallback. */
  category?: string | null;
};

/** Drinks are ~95% water (covers coffee, tea, squash, milk, soda, etc.). */
const DRINK_WATER_FRACTION = 0.95;
/** Assumed volume for a drink logged without a g/ml mass. */
const DEFAULT_DRINK_ML = 250;
const CAN_ML = 330;

/** Estimated water (mL) contributed by one logged entry. */
export function estimateWaterMl(e: WaterEntry): number {
  const unit = (e.servingUnit ?? "").trim().toLowerCase();
  const qty = e.quantity || 0;

  if (unit === "g" || unit === "ml") {
    const mass = (e.servingSize || 0) * qty;
    const dry = (e.protein + e.carbs + e.fat) * qty;
    return Math.max(0, Math.round(mass - dry));
  }

  // No usable mass — only drinks get a volume-based fallback.
  if ((e.category ?? "").toLowerCase() === "drink") {
    const perServing = unit === "can" ? CAN_ML : DEFAULT_DRINK_ML;
    return Math.round(perServing * qty * DRINK_WATER_FRACTION);
  }
  return 0;
}

/** Total estimated water (mL) across a day's entries. */
export function totalWaterMl(entries: WaterEntry[]): number {
  return entries.reduce((s, e) => s + estimateWaterMl(e), 0);
}
