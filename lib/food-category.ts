import { CATEGORIES, Category } from "./constants";

const LIQUID_UNITS = new Set(["ml", "l", "cl", "dl", "fl oz", "floz", "oz"]);
const DOSE_UNITS = /tablet|capsule|\bcap\b|caps\b|pill|softgel|gummy|scoop|sachet|drop/;

const DRINK_WORDS =
  /\b(juice|soda|cola|coke|pepsi|water|coffee|tea|milk|smoothie|shake|lemonade|squash|cordial|beer|wine|cider|lager|latte|cappuccino|espresso|kombucha|drink)\b/;
const OTHER_WORDS =
  /\b(creatine|vitamin|multivitamin|magnesium|supplement|omega|zinc|collagen|electrolyte|pre[- ]?workout|bcaa|fish oil|probiotic)\b/;

/**
 * Best-effort category guess used as the *default* when a food is created or
 * imported. It's intentionally simple — the value is editable per food, so the
 * goal is "right most of the time", not perfect. Serving unit is the strongest
 * signal; name keywords cover items logged in grams (protein shakes, powders).
 */
export function inferCategory(servingUnit?: string | null, name = ""): Category {
  const u = (servingUnit ?? "").trim().toLowerCase();
  if (LIQUID_UNITS.has(u)) return "drink";
  if (DOSE_UNITS.test(u)) return "other";

  const n = name.toLowerCase();
  if (OTHER_WORDS.test(n)) return "other";
  if (DRINK_WORDS.test(n)) return "drink";
  return "food";
}

/** Coerce an arbitrary string to a valid Category, defaulting to "food". */
export function asCategory(value?: string | null): Category {
  return CATEGORIES.includes(value as Category) ? (value as Category) : "food";
}
