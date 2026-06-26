"use client";

import * as React from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { StrengthEditSheet } from "./StrengthEditSheet";
import { prettyDate, relativeLabel } from "@/lib/date";
import { trimNum } from "@/lib/format";
import { deleteFreeformLift } from "@/lib/activity-actions";
import type { FreeformLift } from "@/lib/activity-data";

export function StrengthList({ entries }: { entries: FreeformLift[] }) {
  const [editing, setEditing] = React.useState<FreeformLift | null>(null);

  if (entries.length === 0) {
    return <EmptyState>No strength entries yet.</EmptyState>;
  }

  return (
    <>
      <Card className="divide-y divide-border p-0">
        {entries.map((l) => {
          const scheme =
            l.sets != null && l.repsPerSet != null
              ? `${l.sets}×${l.repsPerSet}${l.weightKg != null && l.weightKg > 0 ? ` @ ${trimNum(l.weightKg)} kg` : ""}`
              : null;
          const when = relativeLabel(l.date) ?? prettyDate(l.date);
          return (
            <div key={l.id} className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setEditing(l)}
                className="min-w-0 flex-1 text-left"
                aria-label={`Edit ${l.exercise}`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{l.exercise}</span>
                  {l.source !== "manual" && <Badge className="shrink-0">{l.source}</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {when}
                  {scheme ? ` · ${scheme}` : ""}
                  {l.notes ? ` · ${l.notes}` : ""}
                </div>
              </button>
              <DeleteButton onDelete={() => deleteFreeformLift(l.id)} label="Delete entry" />
            </div>
          );
        })}
      </Card>
      <StrengthEditSheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}
