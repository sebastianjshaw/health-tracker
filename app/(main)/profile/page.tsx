import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { GoalsEditor } from "@/components/stats/GoalsEditor";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { ageFrom, suggestedCalorieTarget } from "@/lib/health";
import { getGoalWeight, getMealSplit, getProfile, getTargets } from "@/lib/settings";
import { getWeightSeries } from "@/lib/stats-data";

export default async function ProfilePage() {
  const [profile, targets, goalWeight, mealSplit, weight] = await Promise.all([
    getProfile(),
    getTargets(),
    getGoalWeight(),
    getMealSplit(),
    getWeightSeries(),
  ]);

  const currentWeight = weight.length ? weight[weight.length - 1].weight : null;
  const suggestedKcal = suggestedCalorieTarget({
    currentWeightKg: currentWeight,
    heightCm: profile.heightCm,
    age: profile.dob ? ageFrom(profile.dob) : null,
    sex: profile.sex,
    goalWeightKg: goalWeight,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Profile"
        subtitle="Personal details and goals"
        action={
          <Link href="/report">
            <Button size="sm" variant="outline">
              Doctor report
            </Button>
          </Link>
        }
      />

      <ProfileEditor profile={profile} />
      <GoalsEditor
        kcal={targets.kcal}
        protein={targets.protein}
        goalWeight={goalWeight}
        mealSplit={mealSplit}
        suggestedKcal={suggestedKcal}
      />
    </div>
  );
}
