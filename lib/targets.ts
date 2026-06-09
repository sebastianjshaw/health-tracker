import { DEFAULT_TARGETS } from "./constants";

/** A calorie/protein target effective from `from` (YYYY-MM-DD) onward. */
export type TargetEntry = { from: string; kcal: number; protein: number };

export type Targets = { kcal: number; protein: number };

/**
 * The target effective on `date` = the entry with the greatest `from <= date`.
 * `history` must be sorted ascending by `from`. Dates before the first entry
 * (or an empty history) fall back to the earliest entry / DEFAULT_TARGETS.
 */
export function targetForDate(history: TargetEntry[], date: string): Targets {
  let chosen: TargetEntry | undefined = history[0];
  for (const e of history) {
    if (e.from <= date) chosen = e;
    else break;
  }
  return chosen ? { kcal: chosen.kcal, protein: chosen.protein } : { ...DEFAULT_TARGETS };
}
