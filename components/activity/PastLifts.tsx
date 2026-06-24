import { trimNum } from "@/lib/format";
import type { FreeformLift } from "@/lib/activity-data";

/** Read-only history of free-form / imported strength entries (e.g. from
 * MyFitnessPal) that don't belong to the 5×5 program. Collapsed by default via a
 * native <details> so it never crowds the live tracker. */
export function PastLifts({ lifts }: { lifts: FreeformLift[] }) {
  if (lifts.length === 0) return null;
  return (
    <details className="group rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
        Past lifts ({lifts.length})
        <span className="transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
      </summary>
      <div className="max-h-96 divide-y divide-border overflow-y-auto border-t border-border">
        {lifts.map((l) => (
          <div key={l.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0 truncate">{l.exercise}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {l.sets != null && l.repsPerSet != null && (
                <span className="mr-2">
                  {l.sets}×{l.repsPerSet}
                  {l.weightKg != null && l.weightKg > 0 && ` @ ${trimNum(l.weightKg)}kg`}
                </span>
              )}
              <span className="text-xs">{l.date}</span>
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
