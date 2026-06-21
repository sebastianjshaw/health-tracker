"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { DateNav } from "@/components/DateNav";
import { SyncButton } from "@/components/integrations/SyncButton";
import { CardioForm } from "./CardioForm";
import { CardioList } from "./CardioList";
import { LiftTracker } from "./LiftTracker";
import { LiftHistory } from "./LiftHistory";
import type { CardioSession } from "@/db/schema";
import type { LiftHistoryEntry, NextLiftWorkout } from "@/lib/activity-data";

export function ActivityView({
  date,
  cardio,
  nextWorkout,
  liftHistory,
  canSync,
}: {
  date: string;
  cardio: CardioSession[];
  nextWorkout: NextLiftWorkout;
  liftHistory: LiftHistoryEntry[];
  canSync: boolean;
}) {
  const [tab, setTab] = React.useState<"lift" | "cardio">("lift");

  return (
    <div className="space-y-4">
      {canSync && (
        <div className="flex justify-end">
          <SyncButton />
        </div>
      )}
      <DateNav date={date} basePath="/activity" />

      <div className="flex rounded-xl bg-muted p-1">
        {(["lift", "cardio"] as const).map((t) => (
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
            {t === "lift" ? "Lift 5×5" : "Cardio"}
          </button>
        ))}
      </div>

      {tab === "lift" ? (
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
      ) : (
        <>
          <CardioForm date={date} />
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Recent</h3>
            <CardioList sessions={cardio} />
          </div>
        </>
      )}
    </div>
  );
}
