/** Per-serving macro values stored in foods / food_log (totals = quantity × these). */
export type PerServingMacros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type LibraryFoodLike = PerServingMacros & {
  id: number;
  name: string;
  servingSize: number;
  servingUnit: string;
  source: string;
  evolution: string;
  /** Optional secondary macros — snapshotted onto the log row when present. */
  fiber?: number | null;
  saturatedFat?: number | null;
};

/** Wrap absolute portion totals as one serving (MCP free-text logging). */
export function portionAsSingleServing(totals: PerServingMacros): PerServingMacros & {
  servingSize: number;
  servingUnit: string;
} {
  return {
    servingSize: 1,
    servingUnit: "serving",
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
  };
}

/** Snapshot a library food into food_log row fields (per-serving values copied as-is). */
export function foodLogSnapshot(
  food: LibraryFoodLike,
  opts: {
    date: string;
    meal: string;
    quantity: number;
    recurringId?: number | null;
  },
) {
  return {
    date: opts.date,
    meal: opts.meal,
    foodId: food.id,
    name: food.name,
    quantity: opts.quantity,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber ?? null,
    saturatedFat: food.saturatedFat ?? null,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    source: food.source,
    evolution: food.evolution,
    recurringId: opts.recurringId ?? null,
  };
}
