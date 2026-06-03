import { Card, EmptyState } from "@/components/ui";
import { EXERCISE_LABELS, Exercise, REPS_PER_SET } from "@/lib/constants";
import { prettyDate, relativeLabel } from "@/lib/date";
import { trimNum } from "@/lib/format";
import type { LiftHistoryEntry } from "@/lib/activity-data";

function exerciseSummary(
  sets: { exercise: Exercise; targetWeightKg: number; repsDone: number | null }[],
) {
  const byExercise = new Map<
    Exercise,
    { weight: number; reps: (number | null)[] }
  >();
  for (const s of sets) {
    const cur = byExercise.get(s.exercise) ?? { weight: s.targetWeightKg, reps: [] };
    cur.reps.push(s.repsDone);
    byExercise.set(s.exercise, cur);
  }
  return [...byExercise.entries()];
}

export function LiftHistory({ entries }: { entries: LiftHistoryEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState>No workouts logged yet.</EmptyState>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <Card key={entry.id} className="p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-medium">Workout {entry.workout}</span>
            <span className="text-xs text-muted-foreground">
              {relativeLabel(entry.date) ?? prettyDate(entry.date)}
            </span>
          </div>
          <div className="space-y-0.5">
            {exerciseSummary(entry.sets).map(([exercise, data]) => {
              const allHit = data.reps.every((r) => (r ?? 0) >= REPS_PER_SET);
              return (
                <div key={exercise} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {EXERCISE_LABELS[exercise]}
                  </span>
                  <span className={allHit ? "text-accent" : ""}>
                    {trimNum(data.weight)} kg · {data.reps.map((r) => r ?? 0).join("/")}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
