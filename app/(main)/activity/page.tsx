import { PageHeader } from "@/components/PageHeader";
import { ActivityView } from "@/components/activity/ActivityView";
import {
  getNextLiftWorkout,
  getRecentCardio,
  getRecentLiftSessions,
} from "@/lib/activity-data";

export default async function ActivityPage() {
  const [cardio, nextWorkout, liftHistory] = await Promise.all([
    getRecentCardio(),
    getNextLiftWorkout(),
    getRecentLiftSessions(),
  ]);

  return (
    <>
      <PageHeader title="Activity" subtitle="Lifting and cardio" />
      <ActivityView
        cardio={cardio}
        nextWorkout={nextWorkout}
        liftHistory={liftHistory}
      />
    </>
  );
}
