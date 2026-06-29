import { DateNav } from "@/components/DateNav";
import { MacroSummary } from "@/components/MacroSummary";
import { DayHealthControl } from "@/components/today/DayHealthControl";
import { MealSection } from "@/components/today/MealSection";
import { MedicationCard } from "@/components/medication/MedicationCard";
import { MEALS } from "@/lib/constants";
import { isValidISO, todayISO } from "@/lib/date";
import { getNextDoseInfo } from "@/lib/medication-data";
import { getDayActivity, getDayHealth } from "@/lib/day-data";
import { getDayEntries } from "@/lib/food-data";
import { totalWaterMl } from "@/lib/hydration";
import { adjustedCalories, totals } from "@/lib/nutrition";
import { getContingency, getTargets } from "@/lib/settings";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const date = d && isValidISO(d) ? d : todayISO();

  const isToday = date === todayISO();
  const [entries, targets, health, contingency, activity, nextDose] = await Promise.all([
    getDayEntries(date),
    getTargets(),
    getDayHealth(date),
    getContingency(),
    getDayActivity(date),
    getNextDoseInfo(),
  ]);

  const dayTotals = totals(entries);
  const adjustedKcal = adjustedCalories(entries, contingency);
  const waterMl = totalWaterMl(entries);

  return (
    <div className="space-y-4">
      <DateNav date={date} />
      <div className="-mt-2 flex justify-end">
        <DayHealthControl key={date} date={date} status={health} />
      </div>
      <MacroSummary
        totals={dayTotals}
        targets={targets}
        adjustedKcal={adjustedKcal}
        waterMl={waterMl}
        steps={activity?.steps}
        distanceKm={activity?.distanceKm}
      />

      {isToday && nextDose.status !== "none" && <MedicationCard next={nextDose} />}

      {MEALS.map((meal) => (
        <MealSection
          key={meal}
          meal={meal}
          entries={entries.filter((e) => e.meal === meal)}
          date={date}
          contingency={contingency}
        />
      ))}
    </div>
  );
}
