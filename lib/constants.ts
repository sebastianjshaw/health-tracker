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
