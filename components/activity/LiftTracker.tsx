"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { EXERCISE_LABELS, Exercise, REPS_PER_SET } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { trimNum } from "@/lib/format";
import { completeLiftWorkout } from "@/lib/activity-actions";
import type { NextLiftWorkout } from "@/lib/activity-data";

export function LiftTracker({ next }: { next: NextLiftWorkout }) {
  const [reps, setReps] = React.useState<Record<string, number[]>>(() =>
    Object.fromEntries(
      next.exercises.map((e) => [e.exercise, Array(e.sets).fill(REPS_PER_SET)]),
    ),
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = React.useState(false);

  function cycle(ex: Exercise, i: number) {
    setSaved(false);
    setReps((prev) => {
      const arr = [...prev[ex]];
      arr[i] = arr[i] <= 0 ? REPS_PER_SET : arr[i] - 1;
      return { ...prev, [ex]: arr };
    });
  }

  function finish() {
    start(async () => {
      await completeLiftWorkout({
        date: todayISO(),
        workout: next.workout,
        entries: next.exercises.map((e) => ({
          exercise: e.exercise,
          targetWeightKg: e.targetWeightKg,
          reps: reps[e.exercise],
        })),
      });
      setSaved(true);
    });
  }

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">Workout {next.workout}</h2>
        <span className="text-sm text-muted-foreground">StrongLifts 5×5</span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Tap a set to log reps. Hit all reps to progress (+2.5 kg) next time.
      </p>

      <div className="space-y-4">
        {next.exercises.map((e) => (
          <div key={e.exercise}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="font-medium">{EXERCISE_LABELS[e.exercise]}</span>
              <span className="text-sm text-muted-foreground">
                {trimNum(e.targetWeightKg)} kg × {e.sets}×{REPS_PER_SET}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {reps[e.exercise].map((r, i) => (
                <button
                  key={i}
                  onClick={() => cycle(e.exercise, i)}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border text-base font-semibold transition",
                    r === REPS_PER_SET
                      ? "border-accent bg-accent text-accent-foreground"
                      : r === 0
                        ? "border-border bg-muted text-muted-foreground"
                        : "border-warn text-warn",
                  )}
                  style={r > 0 && r < REPS_PER_SET ? { borderColor: "var(--warn)" } : undefined}
                  aria-label={`${EXERCISE_LABELS[e.exercise]} set ${i + 1}: ${r} reps`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button className="mt-5 w-full" onClick={finish} disabled={pending}>
        {pending ? "Saving…" : saved ? "Saved ✓" : "Finish workout"}
      </Button>
      {saved && (
        <p className="mt-2 text-center text-sm text-accent">
          Logged. Targets updated for next time.
        </p>
      )}
    </Card>
  );
}
