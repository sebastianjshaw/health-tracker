import { Contingency, contingencyMultiplier } from "./constants";

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

export type EntryLike = {
  quantity: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** An entry that also carries its Wardley evolution (for contingency). */
export type EntryWithEvolution = EntryLike & { evolution?: string };

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Sum per-serving values scaled by quantity. */
export function totals(entries: EntryLike[]): Macros {
  return entries.reduce<Macros>(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal * e.quantity,
      protein: acc.protein + e.protein * e.quantity,
      carbs: acc.carbs + e.carbs * e.quantity,
      fat: acc.fat + e.fat * e.quantity,
    }),
    { ...ZERO },
  );
}

export function entryMacros(e: EntryLike): Macros {
  return {
    kcal: e.kcal * e.quantity,
    protein: e.protein * e.quantity,
    carbs: e.carbs * e.quantity,
    fat: e.fat * e.quantity,
  };
}

/** Raw logged calories for one entry (no contingency). */
export function entryKcal(e: EntryLike): number {
  return e.kcal * e.quantity;
}

/** Contingency-adjusted calories for one entry, per the Wardley evolution. */
export function entryAdjustedKcal(e: EntryWithEvolution, c: Contingency): number {
  return entryKcal(e) * contingencyMultiplier(e.evolution ?? "commodity", c);
}

/** Sum of contingency-adjusted calories across entries. */
export function adjustedCalories(entries: EntryWithEvolution[], c: Contingency): number {
  return entries.reduce((s, e) => s + entryAdjustedKcal(e, c), 0);
}

export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
