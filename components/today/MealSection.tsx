import { Card } from "@/components/ui";
import { Contingency, MEAL_LABELS, Meal } from "@/lib/constants";
import { adjustedCalories } from "@/lib/nutrition";
import type { DayEntry } from "@/lib/food-data";
import { EntryRow } from "./EntryRow";
import { AddFoodButton } from "./AddFoodButton";
import { CopyYesterdayButton } from "./CopyYesterdayButton";

export function MealSection({
  meal,
  entries,
  date,
  contingency,
}: {
  meal: Meal;
  entries: DayEntry[];
  date: string;
  contingency: Contingency;
}) {
  const kcal = adjustedCalories(entries, contingency);

  return (
    <Card>
      <div className="flex items-center justify-between px-4 pt-3">
        <h3 className="font-semibold">{MEAL_LABELS[meal]}</h3>
        <span className="text-sm text-muted-foreground">
          {Math.round(kcal)} kcal
        </span>
      </div>

      <div className="divide-y divide-border px-4">
        {entries.map((e) => (
          <EntryRow key={e.key} entry={e} date={date} contingency={contingency} />
        ))}
        {entries.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">Nothing yet</p>
        )}
      </div>

      <div className="px-4 pb-3 pt-2">
        <AddFoodButton date={date} meal={meal} />
        <CopyYesterdayButton date={date} meal={meal} />
      </div>
    </Card>
  );
}
