"use client";

import * as React from "react";
import { Card, EmptyState } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { CardioEditSheet } from "./CardioEditSheet";
import { CARDIO_LABELS, CardioType } from "@/lib/constants";
import { prettyDate, relativeLabel, timeOf } from "@/lib/date";
import { trimNum } from "@/lib/format";
import { deleteCardio } from "@/lib/activity-actions";
import type { CardioSession } from "@/db/schema";

export function CardioList({ sessions }: { sessions: CardioSession[] }) {
  const [editing, setEditing] = React.useState<CardioSession | null>(null);

  if (sessions.length === 0) {
    return <EmptyState>No cardio logged yet.</EmptyState>;
  }

  return (
    <>
      <Card className="divide-y divide-border p-0">
        {sessions.map((s) => {
          const bits = [
            s.durationMin != null ? `${trimNum(s.durationMin)} min` : null,
            s.distanceKm != null ? `${trimNum(s.distanceKm)} km` : null,
            s.avgHr != null ? `${s.avgHr} bpm` : null,
            s.kcal != null ? `${Math.round(s.kcal)} kcal` : null,
          ].filter(Boolean);
          const time = timeOf(s.startedAt);
          const when = `${relativeLabel(s.date) ?? prettyDate(s.date)}${time ? ` (${time})` : ""}`;
          return (
            <div key={s.id} className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setEditing(s)}
                className="min-w-0 flex-1 text-left"
                aria-label={`Edit ${CARDIO_LABELS[s.type as CardioType] ?? s.type}`}
              >
                <div className="font-medium">
                  {CARDIO_LABELS[s.type as CardioType] ?? s.type}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {when}
                  {bits.length > 0 && ` · ${bits.join(" · ")}`}
                  {s.notes ? ` · ${s.notes}` : ""}
                </div>
              </button>
              <DeleteButton onDelete={() => deleteCardio(s.id)} label="Delete session" />
            </div>
          );
        })}
      </Card>
      <CardioEditSheet session={editing} onClose={() => setEditing(null)} />
    </>
  );
}
