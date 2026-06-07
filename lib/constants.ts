export const MEALS = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

/**
 * Pick the most likely meal from the time of day (local):
 * 05:00–10:30 breakfast, 11:30–14:00 lunch, 18:00–21:00 dinner, otherwise snacks.
 */
export function mealForTime(d: Date = new Date()): Meal {
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins >= 300 && mins <= 630) return "breakfast"; // 05:00–10:30
  if (mins >= 690 && mins <= 840) return "lunch"; // 11:30–14:00
  if (mins >= 1080 && mins <= 1260) return "dinner"; // 18:00–21:00
  return "snacks";
}

export const CATEGORIES = ["food", "drink", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  food: "Food",
  drink: "Drink",
  other: "Other",
};

/**
 * "Wardley" evolution axis for a food/entry — how knowable its calories are.
 * Drives a contingency uplift on logged calories (commodity/measured = exact;
 * product/estimated add a buffer for under-reporting). See README / the article.
 */
export const EVOLUTIONS = ["commodity", "product", "measured", "estimated"] as const;
export type Evolution = (typeof EVOLUTIONS)[number];

export const EVOLUTION_LABELS: Record<Evolution, string> = {
  commodity: "Commodity — packaged / chain (exact)",
  product: "Product — restaurant / branded",
  measured: "Home-cooked — weighed (exact)",
  estimated: "Home-cooked — estimated",
};

/** Compact labels for tight UI (per-entry chips). */
export const EVOLUTION_SHORT: Record<Evolution, string> = {
  commodity: "Exact",
  product: "Restaurant",
  measured: "Measured",
  estimated: "Estimated",
};

export type Contingency = { product: number; estimated: number };
/** Percentages from the article: restaurants +20%, eyeballed home meals +50%. */
export const DEFAULT_CONTINGENCY: Contingency = { product: 20, estimated: 50 };

/** Auto-classify a food's default evolution from how it entered the library. */
export function evolutionForSource(source: string): Evolution {
  switch (source) {
    case "openfoodfacts":
      return "commodity";
    case "ai":
    case "mcp":
      return "estimated";
    default:
      return "measured"; // hand-entered → assume the figures are known
  }
}

/** Calorie multiplier for an evolution given the tunable contingencies. */
export function contingencyMultiplier(evolution: string, c: Contingency): number {
  if (evolution === "product") return 1 + c.product / 100;
  if (evolution === "estimated") return 1 + c.estimated / 100;
  return 1; // commodity, measured → exact, no uplift
}

export const HEALTH_STATUSES = ["healthy", "unwell", "injured"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  unwell: "Unwell",
  injured: "Injured",
};

export const SCHEDULES = ["everyday", "weekday", "weekend"] as const;
export type Schedule = (typeof SCHEDULES)[number];

export const SCHEDULE_LABELS: Record<Schedule, string> = {
  everyday: "Every day",
  weekday: "Daily (Mon–Fri)",
  weekend: "Weekend",
};

export const CARDIO_TYPES = ["run", "bike", "row", "walk", "swim", "other"] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

// StrongLifts 5x5
export const EXERCISES = ["squat", "bench", "row", "ohp", "deadlift"] as const;
export type Exercise = (typeof EXERCISES)[number];

export const EXERCISE_LABELS: Record<Exercise, string> = {
  squat: "Squat",
  bench: "Bench Press",
  row: "Barbell Row",
  ohp: "Overhead Press",
  deadlift: "Deadlift",
};

// Workout A: Squat, Bench, Row. Workout B: Squat, OHP, Deadlift.
export const WORKOUTS: Record<"A" | "B", Exercise[]> = {
  A: ["squat", "bench", "row"],
  B: ["squat", "ohp", "deadlift"],
};

// Deadlift is 1x5, everything else 5x5.
export const SETS_FOR: Record<Exercise, number> = {
  squat: 5,
  bench: 5,
  row: 5,
  ohp: 5,
  deadlift: 1,
};

export const REPS_PER_SET = 5;

export const DEFAULT_LIFT_WEIGHTS: Record<Exercise, number> = {
  squat: 20,
  bench: 20,
  row: 30,
  ohp: 20,
  deadlift: 40,
};

export const DEFAULT_TARGETS = {
  kcal: 2200,
  protein: 150,
};

// Branding for the lifting program (kept generic to avoid trademark issues).
export const LIFT_PROGRAM_NAME = "Seblifts 5×5";

// Default share of the daily calorie goal per meal (percent, sums to 100).
export const DEFAULT_MEAL_SPLIT: Record<Meal, number> = {
  breakfast: 25,
  lunch: 30,
  dinner: 35,
  snacks: 10,
};
