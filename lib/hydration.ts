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
  /** Entry name — used to tell plain water apart from other drinks. */
  name?: string | null;
};

/** Which bucket an entry's water counts toward in the breakdown. */
export type WaterSource = "water" | "drink" | "food";

/** Plain water (incl. sparkling/coconut; Swedish "vatten"), as a whole word. */
const WATER_NAME = /\b(water|vatten)\b/i;

/**
 * Classify where an entry's water comes from: plain `water`, another `drink`,
 * or `food` (incidental moisture in solids). Only drinks can be plain water.
 */
export function waterSourceOf(e: WaterEntry): WaterSource {
  if ((e.category ?? "").toLowerCase() !== "drink") return "food";
  return WATER_NAME.test(e.name ?? "") ? "water" : "drink";
}

/** Drinks are ~95% water (covers coffee, tea, squash, milk, soda, etc.). */
const DRINK_WATER_FRACTION = 0.95;
/** Assumed volume for a drink logged without a g/ml mass, by serving unit. */
const DEFAULT_DRINK_ML = 250;
const DRINK_VOLUME_ML: Record<string, number> = {
  can: 330,
  cans: 330,
  bottle: 500,
  bottles: 500,
  glass: 250,
  glasses: 250,
  cup: 240,
  cups: 240,
};

/** Estimated water (mL) contributed by one logged entry. */
export function estimateWaterMl(e: WaterEntry): number {
  const unit = (e.servingUnit ?? "").trim().toLowerCase();
  const qty = e.quantity || 0;

  // Mass-based units (g, ml, and litres which are 1000× ml).
  const litre = unit === "l" || unit === "litre" || unit === "liter";
  if (unit === "g" || unit === "ml" || litre) {
    const grams = (e.servingSize || 0) * qty * (litre ? 1000 : 1);
    const dry = (e.protein + e.carbs + e.fat) * qty;
    return Math.max(0, Math.round(grams - dry));
  }

  // No usable mass — only drinks get a volume-based fallback.
  if ((e.category ?? "").toLowerCase() === "drink") {
    const perServing = DRINK_VOLUME_ML[unit] ?? DEFAULT_DRINK_ML;
    return Math.round(perServing * qty * DRINK_WATER_FRACTION);
  }
  return 0;
}

/** Total estimated water (mL) across a day's entries. */
export function totalWaterMl(entries: WaterEntry[]): number {
  return entries.reduce((s, e) => s + estimateWaterMl(e), 0);
}
