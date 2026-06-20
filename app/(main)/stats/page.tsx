import { PageHeader } from "@/components/PageHeader";
import { StatsView } from "@/components/stats/StatsView";
import { getHealthSeries } from "@/lib/day-data";
import { addDays, todayISO } from "@/lib/date";
import { getGoalWeight, getMealSplit, getTargets } from "@/lib/settings";
import {
  getCalorieSeries,
  getCardioDistances,
  getDailyActivity,
  getLiftProgression,
  getRestingHrSeries,
  getSleepSeries,
  getWeightPredictions,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage() {
  const today = todayISO();
  const [targets, goalWeight, mealSplit, weight, predictions, calories, lifts, distances, activity, sleep, restingHr, health] =
    await Promise.all([
      getTargets(),
      getGoalWeight(),
      getMealSplit(),
      getWeightSeries(),
      getWeightPredictions(),
      getCalorieSeries(365), // bounded; the range control filters client-side
      getLiftProgression(),
      getCardioDistances(),
      getDailyActivity(),
      getSleepSeries(),
      getRestingHrSeries(),
      getHealthSeries(addDays(today, -363), today),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Stats" subtitle="Your trends over time" />
      <StatsView
        today={today}
        weight={weight}
        predictions={predictions}
        calories={calories}
        lifts={lifts}
        distances={distances}
        activity={activity}
        sleep={sleep}
        restingHr={restingHr}
        health={health}
        targets={targets}
        goalWeight={goalWeight}
        mealSplit={mealSplit}
      />
    </div>
  );
}
