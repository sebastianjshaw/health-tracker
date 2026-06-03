import { PageHeader } from "@/components/PageHeader";
import { CalorieChart, LiftChart, WeightChart } from "@/components/stats/Charts";
import { BodyForm } from "@/components/stats/BodyForm";
import { BodyHistory } from "@/components/stats/BodyHistory";
import { GoalsEditor } from "@/components/stats/GoalsEditor";
import { Bloodwork } from "@/components/stats/Bloodwork";
import { getBloodPanels } from "@/lib/blood-data";
import { getGoalWeight, getMealSplit, getTargets } from "@/lib/settings";
import {
  getBodyMetrics,
  getCalorieSeries,
  getLiftProgression,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage() {
  const [targets, goalWeight, mealSplit, weight, calories, lifts, metrics, bloodPanels] =
    await Promise.all([
      getTargets(),
      getGoalWeight(),
      getMealSplit(),
      getWeightSeries(),
      getCalorieSeries(14),
      getLiftProgression(),
      getBodyMetrics(),
      getBloodPanels(),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Stats" subtitle="Trends, body metrics and goals" />

      <WeightChart data={weight} goalWeight={goalWeight} />
      <CalorieChart data={calories} target={targets.kcal} mealSplit={mealSplit} />
      <LiftChart data={lifts} />

      <BodyForm />
      <GoalsEditor
        kcal={targets.kcal}
        protein={targets.protein}
        goalWeight={goalWeight}
        mealSplit={mealSplit}
      />

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
