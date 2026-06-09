import { PageHeader } from "@/components/PageHeader";
import {
  CalorieChart,
  DistanceChart,
  HeartRateChart,
  LiftChart,
  SleepChart,
  WeightChart,
} from "@/components/stats/charts-lazy";
import { HealthCalendar } from "@/components/stats/HealthCalendar";
import { getHealthSeries } from "@/lib/day-data";
import { addDays, todayISO } from "@/lib/date";
import { getGoalWeight, getMealSplit, getTargets } from "@/lib/settings";
import {
  getCalorieSeries,
  getCardioDistances,
  getLiftProgression,
  getRestingHrSeries,
  getSleepSeries,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage() {
  const today = todayISO();
  const [targets, goalWeight, mealSplit, weight, calories, lifts, distances, sleep, restingHr, health] =
    await Promise.all([
      getTargets(),
      getGoalWeight(),
      getMealSplit(),
      getWeightSeries(),
      getCalorieSeries(14),
      getLiftProgression(),
      getCardioDistances(),
      getSleepSeries(),
      getRestingHrSeries(),
      getHealthSeries(addDays(today, -363), today),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Stats" subtitle="Your trends over time" />

      <WeightChart data={weight} goalWeight={goalWeight} />
      <CalorieChart data={calories} target={targets.kcal} mealSplit={mealSplit} />
      <LiftChart data={lifts} />
      <DistanceChart data={distances} end={today} />
      <SleepChart data={sleep} />
      <HeartRateChart data={restingHr} />
      <HealthCalendar statuses={health} end={today} />
    </div>
  );
}
