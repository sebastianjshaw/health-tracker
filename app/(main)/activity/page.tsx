import { PageHeader } from "@/components/PageHeader";
import { ActivityView } from "@/components/activity/ActivityView";
import { isValidISO, todayISO } from "@/lib/date";
import {
  getNextLiftWorkout,
  getRecentCardio,
  getRecentLiftSessions,
} from "@/lib/activity-data";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const date = d && isValidISO(d) ? d : todayISO();

  const [cardio, nextWorkout, liftHistory] = await Promise.all([
    getRecentCardio(),
    getNextLiftWorkout(),
    getRecentLiftSessions(),
  ]);

  return (
    <>
      <PageHeader title="Activity" subtitle="Lifting and cardio" />
      <ActivityView
        date={date}
        cardio={cardio}
        nextWorkout={nextWorkout}
        liftHistory={liftHistory}
      />
    </>
  );
}
