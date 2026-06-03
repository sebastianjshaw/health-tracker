import { DateNav } from "@/components/DateNav";
import { MacroSummary } from "@/components/MacroSummary";
import { MealSection } from "@/components/today/MealSection";
import { MEALS } from "@/lib/constants";
import { isValidISO, todayISO } from "@/lib/date";
import { getDayEntries, getFoods } from "@/lib/food-data";
import { totals } from "@/lib/nutrition";
import { getTargets } from "@/lib/settings";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const date = d && isValidISO(d) ? d : todayISO();

  const [entries, foods, targets] = await Promise.all([
    getDayEntries(date),
    getFoods(),
    getTargets(),
  ]);

  const dayTotals = totals(entries);

  return (
    <div className="space-y-4">
      <DateNav date={date} />
      <MacroSummary totals={dayTotals} targets={targets} />

      {MEALS.map((meal) => (
        <MealSection
          key={meal}
          meal={meal}
          entries={entries.filter((e) => e.meal === meal)}
          date={date}
          foods={foods}
        />
      ))}
    </div>
  );
}
