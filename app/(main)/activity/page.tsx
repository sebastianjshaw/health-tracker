import { PageHeader } from "@/components/PageHeader";
import { ActivityView } from "@/components/activity/ActivityView";
import { isValidISO, todayISO } from "@/lib/date";
import {
  getNextLiftWorkout,
  getRecentCardio,
  getRecentLiftSessions,
} from "@/lib/activity-data";
import { isConfigured, isConnected } from "@/lib/integrations/google-health";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const date = d && isValidISO(d) ? d : todayISO();

  const [cardio, nextWorkout, liftHistory, connected] = await Promise.all([
    getRecentCardio(),
    getNextLiftWorkout(),
    getRecentLiftSessions(),
    isConnected(),
  ]);
  const canSync = isConfigured() && connected;

  return (
    <>
      <PageHeader title="Activity" subtitle="Lifting and cardio" />
      <ActivityView
        date={date}
        cardio={cardio}
        nextWorkout={nextWorkout}
        liftHistory={liftHistory}
        canSync={canSync}
      />
    </>
  );
}
