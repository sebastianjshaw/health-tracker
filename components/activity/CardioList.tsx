"use client";

import { Card, EmptyState } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { CARDIO_LABELS, CardioType } from "@/lib/constants";
import { prettyDate, relativeLabel } from "@/lib/date";
import { trimNum } from "@/lib/format";
import { deleteCardio } from "@/lib/activity-actions";
import type { CardioSession } from "@/db/schema";

export function CardioList({ sessions }: { sessions: CardioSession[] }) {
  if (sessions.length === 0) {
    return <EmptyState>No cardio logged yet.</EmptyState>;
  }

  return (
    <Card className="divide-y divide-border p-0">
      {sessions.map((s) => {
        const bits = [
          s.durationMin != null ? `${trimNum(s.durationMin)} min` : null,
          s.distanceKm != null ? `${trimNum(s.distanceKm)} km` : null,
          s.avgHr != null ? `${s.avgHr} bpm` : null,
          s.kcal != null ? `${Math.round(s.kcal)} kcal` : null,
        ].filter(Boolean);
        return (
          <div key={s.id} className="flex items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {CARDIO_LABELS[s.type as CardioType] ?? s.type}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {relativeLabel(s.date) ?? prettyDate(s.date)}
                {bits.length > 0 && ` · ${bits.join(" · ")}`}
                {s.notes ? ` · ${s.notes}` : ""}
              </div>
            </div>
            <DeleteButton onDelete={() => deleteCardio(s.id)} label="Delete session" />
          </div>
        );
      })}
    </Card>
  );
}
