import { Card } from "@/components/ui";
import { EXERCISE_LABELS, type Exercise } from "@/lib/constants";
import type { LiftStat } from "@/lib/strength";

/** Estimated 1RM personal records per lift — lives with the lift tracker. */
export function StrengthPRs({ lifts }: { lifts: LiftStat[] }) {
  if (lifts.length === 0) return null;
  return (
    <Card className="p-0">
      <div className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Personal records (est. 1RM)
      </div>
      <div className="mt-1 divide-y divide-border">
        {lifts.map((l) => (
          <div key={l.exercise} className="flex items-baseline justify-between px-4 py-2.5">
            <span className="text-sm">{EXERCISE_LABELS[l.exercise as Exercise] ?? l.exercise}</span>
            <span className="text-sm font-medium tabular-nums">
              {l.best1RM} kg
              {l.latest1RM < l.best1RM && (
                <span className="ml-2 text-xs text-muted-foreground">now {l.latest1RM}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
