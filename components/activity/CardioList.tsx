"use client";

import * as React from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { CardioEditSheet } from "./CardioEditSheet";
import { RouteThumbnail } from "./RouteThumbnail";
import { CARDIO_LABELS, CardioType } from "@/lib/constants";
import { prettyDate, relativeLabel, timeOf } from "@/lib/date";
import { trimNum } from "@/lib/format";
import { parseSplits } from "@/lib/splits";
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
          const typeLabel = CARDIO_LABELS[s.type as CardioType] ?? s.type;
          const bits = [
            s.durationMin != null ? `${trimNum(s.durationMin)} min` : null,
            s.distanceKm != null ? `${trimNum(s.distanceKm)} km` : null,
            s.avgHr != null ? `${s.avgHr} bpm${s.maxHr != null ? `/${s.maxHr} max` : ""}` : null,
            s.elevationGainM != null && s.elevationGainM > 0 ? `↑${Math.round(s.elevationGainM)} m` : null,
            s.kcal != null ? `${Math.round(s.kcal)} kcal` : null,
          ].filter(Boolean);
          const time = timeOf(s.startedAt);
          const when = `${relativeLabel(s.date) ?? prettyDate(s.date)}${time ? ` (${time})` : ""}`;
          const heading = s.name?.trim() || typeLabel;
          const hasSplits = parseSplits(s.splits).length > 0;
          return (
            <div key={s.id} className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setEditing(s)}
                className="min-w-0 flex-1 text-left"
                aria-label={`Open ${heading}`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{heading}</span>
                  {s.name?.trim() && (
                    <span className="shrink-0 text-xs text-muted-foreground">{typeLabel}</span>
                  )}
                  {hasSplits && <Badge className="shrink-0">Splits</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {when}
                  {bits.length > 0 && ` · ${bits.join(" · ")}`}
                  {s.notes ? ` · ${s.notes}` : ""}
                </div>
              </button>
              {s.gpsTrack && (
                <RouteThumbnail track={s.gpsTrack} className="h-10 w-10 shrink-0 text-accent" />
              )}
              <DeleteButton onDelete={() => deleteCardio(s.id)} label="Delete session" />
            </div>
          );
        })}
      </Card>
      <CardioEditSheet session={editing} onClose={() => setEditing(null)} />
    </>
  );
}
