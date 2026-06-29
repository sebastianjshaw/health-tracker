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

export const HEALTH_STATUSES = ["healthy", "unwell", "injured", "vacation"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  unwell: "Unwell",
  injured: "Injured",
  vacation: "Vacation",
};

export const SCHEDULES = ["everyday", "weekday", "weekend"] as const;
export type Schedule = (typeof SCHEDULES)[number];

export const SCHEDULE_LABELS: Record<Schedule, string> = {
  everyday: "Every day",
  weekday: "Daily (Mon–Fri)",
  weekend: "Weekend",
};

export const CARDIO_TYPES = ["run", "bike", "row", "walk", "hike", "swim", "other"] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

export const CARDIO_LABELS: Record<CardioType, string> = {
  run: "Run",
  bike: "Bike",
  row: "Row",
  walk: "Walk",
  hike: "Hike",
  swim: "Swim",
  other: "Other",
};

// GLP-1 medication tracking
export const MED_DRUGS = ["tirzepatide", "semaglutide"] as const;
export type MedDrug = (typeof MED_DRUGS)[number];

export const MED_DRUG_LABELS: Record<MedDrug, string> = {
  tirzepatide: "Tirzepatide (Mounjaro)",
  semaglutide: "Semaglutide (Ozempic)",
};

// Typical titration doses (mg) per drug — just to speed up entry, not advice.
export const MED_DOSE_OPTIONS: Record<MedDrug, number[]> = {
  tirzepatide: [2.5, 5, 7.5, 10, 12.5, 15],
  semaglutide: [0.25, 0.5, 1, 1.7, 2.4],
};

export const INJECTION_SITES = ["abdomen", "thigh", "upper_arm"] as const;
export type InjectionSite = (typeof INJECTION_SITES)[number];

export const INJECTION_SITE_LABELS: Record<InjectionSite, string> = {
  abdomen: "Abdomen",
  thigh: "Thigh",
  upper_arm: "Upper arm",
};

export const SIDE_EFFECTS = [
  "nausea",
  "reflux",
  "constipation",
  "diarrhea",
  "fatigue",
  "headache",
  "injection_site",
] as const;
export type SideEffect = (typeof SIDE_EFFECTS)[number];

export const SIDE_EFFECT_LABELS: Record<SideEffect, string> = {
  nausea: "Nausea",
  reflux: "Reflux / heartburn",
  constipation: "Constipation",
  diarrhea: "Diarrhoea",
  fatigue: "Fatigue",
  headache: "Headache",
  injection_site: "Injection-site reaction",
};

// Appetite scale used by the daily check-in (1 = no appetite … 5 = ravenous).
export const APPETITE_LABELS: Record<number, string> = {
  1: "None",
  2: "Low",
  3: "Normal",
  4: "High",
  5: "Ravenous",
};

// Side-effect severity (0 = not present, omitted from storage).
export const SEVERITY_LABELS: Record<number, string> = {
  1: "Mild",
  2: "Moderate",
  3: "Severe",
};

/** Weekly injection cadence — drives the "next dose due" indicator. */
export const MED_CADENCE_DAYS = 7;

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
