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
import { STATS_WINDOW_DAYS, type Range } from "@/lib/stats-range";
import {
  getBodyMetrics,
  calorieSeriesRange,
  getCalorieSeriesAll,
  getCardioDistances,
  getEnergyBalanceSeries,
  getCardioLoadSessions,
  getRecoverySeries,
  getRestingHrSeries,
  getRunVo2maxSeries,
  getSleepSeries,
  getWeightPredictions,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const today = todayISO();
  // Load a bounded window by default so /stats doesn't ship years of daily points
  // (7d…1y all filter within it client-side). "All" lifts the bound via ?range=all.
  const wantsAll = (await searchParams).range === "all";
  const from = wantsAll ? null : addDays(today, -(STATS_WINDOW_DAYS - 1));

  const [targets, goalWeight, mealSplit, profile, metrics, weight, predictions, calories, distances, sleep, restingHr, recovery, vo2max, loadSessions, health] =
    await Promise.all([
      getTargets(),
      getGoalWeight(),
      getMealSplit(),
      getProfile(),
      getBodyMetrics(), // full: body-composition snapshot
      getWeightSeries(), // full: multi-year seasonal averages need the whole history
      getWeightPredictions(from ?? undefined),
      from ? calorieSeriesRange(from, today) : getCalorieSeriesAll(),
      getCardioDistances(from ?? undefined), // for the at-a-glance Distance tile (charts live on /activity)
      getSleepSeries(from ?? undefined),
      getRestingHrSeries(from ?? undefined),
      getRecoverySeries(from ?? undefined),
      getRunVo2maxSeries(from ?? undefined),
      getCardioLoadSessions(from ?? undefined),
      getHealthSeries(addDays(today, -363), today),
    ]);

  // Derived from the already-loaded calorie series, so recurring foods aren't
  // materialised a second time in parallel.
  const energy = await getEnergyBalanceSeries(calories);

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
        initialRange={(wantsAll ? "all" : "30d") as Range}
        hasFullHistory={wantsAll}
        weight={weight}
        predictions={predictions}
        calories={calories}
        energy={energy}
        distances={distances}
        sleep={sleep}
        restingHr={restingHr}
        recovery={recovery}
        vo2max={vo2max}
        loadSessions={loadSessions}
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
