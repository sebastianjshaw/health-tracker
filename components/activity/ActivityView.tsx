"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { DateNav } from "@/components/DateNav";
import { SyncButton } from "@/components/integrations/SyncButton";
import { CardioForm } from "./CardioForm";
import { CardioList } from "./CardioList";
import { StrengthForm } from "./StrengthForm";
import { StrengthList } from "./StrengthList";
import { LiftTracker } from "./LiftTracker";
import { LiftHistory } from "./LiftHistory";
import type { CardioSession } from "@/db/schema";
import type { FreeformLift, LiftHistoryEntry, NextLiftWorkout } from "@/lib/activity-data";

type Tab = "lift" | "cardio" | "strength";
const TAB_LABELS: Record<Tab, string> = { lift: "Lift 5×5", cardio: "Cardio", strength: "Strength" };

export function ActivityView({
  date,
  cardio,
  freeform,
  nextWorkout,
  liftHistory,
  canSync,
}: {
  date: string;
  cardio: CardioSession[];
  freeform: FreeformLift[];
  nextWorkout: NextLiftWorkout;
  liftHistory: LiftHistoryEntry[];
  canSync: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>("lift");

  return (
    <div className="space-y-4">
      {canSync && (
        <div className="flex justify-end">
          <SyncButton />
        </div>
      )}
      <DateNav date={date} basePath="/activity" />

      <div className="flex rounded-xl bg-muted p-1">
        {(["lift", "cardio", "strength"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition",
              tab === t
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "lift" && (
        <>
          {/* key remounts the tracker after a workout is saved + targets change */}
          <LiftTracker
            key={`${nextWorkout.workout}-${nextWorkout.exercises
              .map((e) => e.targetWeightKg)
              .join(",")}`}
            next={nextWorkout}
            date={date}
          />
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">History</h3>
            <LiftHistory entries={liftHistory} />
          </div>
        </>
      )}

      {tab === "cardio" && (
        <>
          <CardioForm date={date} />
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Recent</h3>
            <CardioList sessions={cardio} />
          </div>
        </>
      )}

      {tab === "strength" && (
        <>
          <StrengthForm date={date} />
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Recent</h3>
            <StrengthList entries={freeform} />
          </div>
        </>
      )}
    </div>
  );
}
