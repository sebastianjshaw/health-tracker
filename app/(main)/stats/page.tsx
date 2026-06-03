import { PageHeader } from "@/components/PageHeader";
import { CalorieChart, LiftChart, WeightChart } from "@/components/stats/Charts";
import { BodyForm } from "@/components/stats/BodyForm";
import { BodyHistory } from "@/components/stats/BodyHistory";
import { GoalsEditor } from "@/components/stats/GoalsEditor";
import { getTargets } from "@/lib/settings";
import {
  getBodyMetrics,
  getCalorieSeries,
  getLiftProgression,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage() {
  const [targets, weight, calories, lifts, metrics] = await Promise.all([
    getTargets(),
    getWeightSeries(),
    getCalorieSeries(14),
    getLiftProgression(),
    getBodyMetrics(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Stats" subtitle="Trends, body metrics and goals" />

      <WeightChart data={weight} />
      <CalorieChart data={calories} target={targets.kcal} />
      <LiftChart data={lifts} />

      <BodyForm />
      <GoalsEditor kcal={targets.kcal} protein={targets.protein} />

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          Measurement history
        </h3>
        <BodyHistory metrics={metrics} />
      </div>
    </div>
  );
}
