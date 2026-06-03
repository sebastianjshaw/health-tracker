"use client";

import { useTransition } from "react";
import { Card, EmptyState } from "@/components/ui";
import { TrashIcon } from "@/components/icons";
import { prettyDate, relativeLabel } from "@/lib/date";
import { trimNum } from "@/lib/format";
import { deleteBody } from "@/lib/body-actions";
import type { BodyMetric } from "@/db/schema";

export function BodyHistory({ metrics }: { metrics: BodyMetric[] }) {
  const [pending, start] = useTransition();

  if (metrics.length === 0) {
    return <EmptyState>No measurements yet.</EmptyState>;
  }

  return (
    <Card className="divide-y divide-border p-0">
      {metrics.map((m) => {
        const bits = [
          m.weightKg != null ? `${trimNum(m.weightKg)} kg` : null,
          m.bodyFatPct != null ? `${trimNum(m.bodyFatPct)}% bf` : null,
          m.waistCm != null ? `${trimNum(m.waistCm)} cm waist` : null,
          m.restingHr != null ? `${m.restingHr} bpm` : null,
        ].filter(Boolean);
        return (
          <div key={m.id} className="flex items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{bits[0] ?? "—"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {relativeLabel(m.date) ?? prettyDate(m.date)}
                {bits.length > 1 && ` · ${bits.slice(1).join(" · ")}`}
                {m.notes ? ` · ${m.notes}` : ""}
              </div>
            </div>
            <button
              onClick={() => start(async () => deleteBody(m.id))}
              disabled={pending}
              className="p-1.5 text-muted-foreground hover:text-danger"
              aria-label="Delete measurement"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </Card>
  );
}
