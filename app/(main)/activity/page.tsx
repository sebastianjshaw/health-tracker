import { PageHeader } from "@/components/PageHeader";
import { ActivityView } from "@/components/activity/ActivityView";
import { ActivityTrends } from "@/components/activity/ActivityTrends";
import { StrengthPRs } from "@/components/activity/StrengthPRs";
import { isValidISO, todayISO } from "@/lib/date";
import {
  getFreeformLifts,
  getNextLiftWorkout,
  getRecentCardio,
  getRecentLiftSessions,
} from "@/lib/activity-data";
import {
  getCardioDistances,
  getDailyActivity,
  getLiftProgression,
  getLiftSets,
} from "@/lib/stats-data";
import { liftStats } from "@/lib/strength";
import { isConfigured, isConnected } from "@/lib/integrations/google-health";

// The manual "Sync now" server action runs on this route; the first full sync
// can take a while, so allow more than the default ~10s function limit.
export const maxDuration = 60;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const date = d && isValidISO(d) ? d : todayISO();
  const today = todayISO();

  const [cardio, nextWorkout, liftHistory, connected, liftSetRows, liftProgression, activity, distances, freeform] =
    await Promise.all([
      getRecentCardio(),
      getNextLiftWorkout(),
      getRecentLiftSessions(),
      isConnected(),
      getLiftSets(),
      getLiftProgression(),
      getDailyActivity(),
      getCardioDistances(),
      getFreeformLifts(),
    ]);
  const canSync = isConfigured() && connected;
  const prs = liftStats(liftSetRows).slice(0, 5);

  return (
    <>
      <PageHeader title="Activity" subtitle="Lifting, cardio and strength" />
      <ActivityView
        date={date}
        cardio={cardio}
        freeform={freeform}
        nextWorkout={nextWorkout}
        liftHistory={liftHistory}
        canSync={canSync}
      />
      <div className="mt-4 space-y-4">
        <StrengthPRs lifts={prs} />
        <ActivityTrends today={today} lifts={liftProgression} activity={activity} distances={distances} />
      </div>
    </>
  );
}
