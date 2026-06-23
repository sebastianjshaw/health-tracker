import { PageHeader } from "@/components/PageHeader";
import { StatsView } from "@/components/stats/StatsView";
import { getHealthSeries } from "@/lib/day-data";
import { addDays, todayISO } from "@/lib/date";
import { currentStreak } from "@/lib/streaks";
import { measuredTdee } from "@/lib/tdee";
import { getGoalWeight, getMealSplit, getProfile, getTargets } from "@/lib/settings";
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
  const [targets, goalWeight, mealSplit, profile, weight, predictions, calories, lifts, distances, activity, sleep, restingHr, health] =
    await Promise.all([
      getTargets(),
      getGoalWeight(),
      getMealSplit(),
      getProfile(),
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

  // Behaviour / energy-balance insights that belong with trends. (Body
  // composition + strength PRs moved to Measurements / Activity respectively.)
  const insights = {
    tdee: measuredTdee({
      weighIns: weight.map((w) => ({ date: w.date, weight: w.weight })),
      intakeByDate: new Map(calories.map((c) => [c.date, c.kcal])),
      today,
    }),
    streak: {
      logging: currentStreak(
        calories.map((c) => ({ date: c.date, value: c.kcal > 0 })),
        today,
      ),
      onTarget: currentStreak(
        calories.map((c) => ({ date: c.date, value: c.kcal > 0 && c.kcal <= c.targetKcal })),
        today,
      ),
    },
  };

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
        heightCm={profile.heightCm}
        insights={insights}
      />
    </div>
  );
}
