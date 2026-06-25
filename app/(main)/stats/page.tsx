import { PageHeader } from "@/components/PageHeader";
import { StatsView } from "@/components/stats/StatsView";
import { getHealthSeries } from "@/lib/day-data";
import { addDays, todayISO } from "@/lib/date";
import { ageFrom } from "@/lib/health";
import { latestBodyComposition } from "@/lib/metabolic-age";
import { monthlyAverages, yearlyAverages } from "@/lib/seasonal";
import { currentStreak } from "@/lib/streaks";
import { measuredTdee } from "@/lib/tdee";
import { getGoalWeight, getMealSplit, getProfile, getTargets } from "@/lib/settings";
import {
  getBodyMetrics,
  getCalorieSeriesAll,
  getCardioDistances,
  getRestingHrSeries,
  getSleepSeries,
  getWeightPredictions,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage() {
  const today = todayISO();
  const [targets, goalWeight, mealSplit, profile, metrics, weight, predictions, calories, distances, sleep, restingHr, health] =
    await Promise.all([
      getTargets(),
      getGoalWeight(),
      getMealSplit(),
      getProfile(),
      getBodyMetrics(),
      getWeightSeries(),
      getWeightPredictions(),
      getCalorieSeriesAll(), // full logged history; the range control filters client-side
      getCardioDistances(), // for the at-a-glance Distance tile (charts live on /activity)
      getSleepSeries(),
      getRestingHrSeries(),
      getHealthSeries(addDays(today, -363), today),
    ]);

  // Behaviour / energy-balance insights that belong with trends.
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

  // Body-composition snapshot + long-horizon weight views (moved here from
  // Measurements, which is now just the log + raw history).
  const bodyComp = latestBodyComposition(
    metrics.map((m) => ({
      date: m.date,
      weightKg: m.weightKg,
      bodyFatPct: m.bodyFatPct,
      leanMassKg: m.leanMassKg,
      muscleMassKg: m.muscleMassKg,
      boneMassKg: m.boneMassKg,
      hydrationKg: m.hydrationKg,
    })),
    { heightCm: profile.heightCm, sex: profile.sex },
  );
  const weighIns = weight.map((w) => ({ date: w.date, weight: w.weight }));

  return (
    <div className="space-y-4">
      <PageHeader title="Stats" subtitle="Your trends over time" />
      <StatsView
        today={today}
        weight={weight}
        predictions={predictions}
        calories={calories}
        distances={distances}
        sleep={sleep}
        restingHr={restingHr}
        health={health}
        targets={targets}
        goalWeight={goalWeight}
        mealSplit={mealSplit}
        heightCm={profile.heightCm}
        insights={insights}
        bodyComp={bodyComp}
        yearly={yearlyAverages(weighIns)}
        monthly={monthlyAverages(weighIns)}
        age={profile.dob ? ageFrom(profile.dob) : null}
      />
    </div>
  );
}
