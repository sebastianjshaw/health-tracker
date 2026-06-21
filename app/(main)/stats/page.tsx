import { PageHeader } from "@/components/PageHeader";
import { StatsView } from "@/components/stats/StatsView";
import { getHealthSeries } from "@/lib/day-data";
import { addDays, todayISO } from "@/lib/date";
import { latestBodyComposition } from "@/lib/metabolic-age";
import { yearlyAverages } from "@/lib/seasonal";
import { liftStats } from "@/lib/strength";
import { measuredTdee } from "@/lib/tdee";
import { getGoalWeight, getMealSplit, getProfile, getTargets } from "@/lib/settings";
import {
  getCalorieSeries,
  getCardioDistances,
  getDailyActivity,
  getLiftProgression,
  getLiftSets,
  getRestingHrSeries,
  getSleepSeries,
  getWeightPredictions,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage() {
  const today = todayISO();
  const [targets, goalWeight, mealSplit, profile, weight, predictions, calories, lifts, liftSetRows, distances, activity, sleep, restingHr, health] =
    await Promise.all([
      getTargets(),
      getGoalWeight(),
      getMealSplit(),
      getProfile(),
      getWeightSeries(),
      getWeightPredictions(),
      getCalorieSeries(365), // bounded; the range control filters client-side
      getLiftProgression(),
      getLiftSets(),
      getCardioDistances(),
      getDailyActivity(),
      getSleepSeries(),
      getRestingHrSeries(),
      getHealthSeries(addDays(today, -363), today),
    ]);

  // Range-independent insights (latest / lifetime), computed once server-side.
  const insights = {
    tdee: measuredTdee({
      weighIns: weight.map((w) => ({ date: w.date, weight: w.weight })),
      intakeByDate: new Map(calories.map((c) => [c.date, c.kcal])),
      today,
    }),
    bodyComp: latestBodyComposition(
      [...weight].reverse().map((w) => ({ date: w.date, weightKg: w.weight, bodyFatPct: w.bodyFat })),
      { heightCm: profile.heightCm, sex: profile.sex },
    ),
    yearly: yearlyAverages(weight.map((w) => ({ date: w.date, weight: w.weight }))),
    prs: liftStats(liftSetRows).slice(0, 5),
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
        insights={insights}
      />
    </div>
  );
}
