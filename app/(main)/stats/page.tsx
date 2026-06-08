import { PageHeader } from "@/components/PageHeader";
import {
  CalorieChart,
  DistanceChart,
  LiftChart,
  WeightChart,
} from "@/components/stats/charts-lazy";
import { HealthCalendar } from "@/components/stats/HealthCalendar";
import { BodyForm } from "@/components/stats/BodyForm";
import { BodyHistory } from "@/components/stats/BodyHistory";
import { Bloodwork } from "@/components/stats/Bloodwork";
import { getBloodPanels } from "@/lib/blood-data";
import { getHealthSeries } from "@/lib/day-data";
import { addDays, todayISO } from "@/lib/date";
import { getGoalWeight, getMealSplit, getTargets } from "@/lib/settings";
import {
  getBodyMetrics,
  getCalorieSeries,
  getCardioDistances,
  getLiftProgression,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage() {
  const today = todayISO();
  const [
    targets,
    goalWeight,
    mealSplit,
    weight,
    calories,
    lifts,
    metrics,
    bloodPanels,
    health,
    distances,
  ] = await Promise.all([
    getTargets(),
    getGoalWeight(),
    getMealSplit(),
    getWeightSeries(),
    getCalorieSeries(14),
    getLiftProgression(),
    getBodyMetrics(),
    getBloodPanels(),
    getHealthSeries(addDays(today, -363), today),
    getCardioDistances(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Stats" subtitle="Trends and health data" />

      <WeightChart data={weight} goalWeight={goalWeight} />
      <CalorieChart data={calories} target={targets.kcal} mealSplit={mealSplit} />
      <LiftChart data={lifts} />
      <DistanceChart data={distances} end={today} />
      <HealthCalendar statuses={health} end={today} />

      <BodyForm />

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          Measurement history
        </h3>
        <BodyHistory metrics={metrics} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          Blood & lab results
        </h3>
        <Bloodwork panels={bloodPanels} />
      </div>
    </div>
  );
}
