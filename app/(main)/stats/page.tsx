import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { CalorieChart, LiftChart, WeightChart } from "@/components/stats/charts-lazy";
import { BodyForm } from "@/components/stats/BodyForm";
import { BodyHistory } from "@/components/stats/BodyHistory";
import { GoalsEditor } from "@/components/stats/GoalsEditor";
import { Bloodwork } from "@/components/stats/Bloodwork";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { getBloodPanels } from "@/lib/blood-data";
import { getGoalWeight, getMealSplit, getProfile, getTargets } from "@/lib/settings";
import {
  getBodyMetrics,
  getCalorieSeries,
  getLiftProgression,
  getWeightSeries,
} from "@/lib/stats-data";

export default async function StatsPage() {
  const [targets, goalWeight, mealSplit, profile, weight, calories, lifts, metrics, bloodPanels] =
    await Promise.all([
      getTargets(),
      getGoalWeight(),
      getMealSplit(),
      getProfile(),
      getWeightSeries(),
      getCalorieSeries(14),
      getLiftProgression(),
      getBodyMetrics(),
      getBloodPanels(),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stats"
        subtitle="Trends, body metrics and goals"
        action={
          <Link href="/report">
            <Button size="sm" variant="outline">
              Doctor report
            </Button>
          </Link>
        }
      />

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
      <ProfileEditor profile={profile} />

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
