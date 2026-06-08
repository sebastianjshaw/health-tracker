"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  EXERCISE_LABELS,
  Exercise,
  LIFT_PROGRAM_NAME,
  REPS_PER_SET,
} from "@/lib/constants";
import { trimNum } from "@/lib/format";
import { completeLiftWorkout, updateLiftWeights } from "@/lib/activity-actions";
import type { NextLiftWorkout } from "@/lib/activity-data";

// Reps cycle 0 → MAX_REPS then wrap back to 0. Colour zones flag overwork:
// 1–5 on target (green), 6–8 amber, 9–10 red.
const MAX_REPS = 10;
function repClass(r: number): string {
  if (r <= 0) return "border-border bg-muted text-muted-foreground";
  if (r <= REPS_PER_SET) return "border-accent bg-accent text-accent-foreground";
  if (r <= 8) return "border-transparent bg-warn text-white";
  return "border-transparent bg-danger text-white";
}

export function LiftTracker({
  next,
  date,
}: {
  next: NextLiftWorkout;
  date: string;
}) {
  const [reps, setReps] = React.useState<Record<string, number[]>>(() =>
    Object.fromEntries(
      next.exercises.map((e) => [e.exercise, Array(e.sets).fill(0)]),
    ),
  );
  const [weights, setWeights] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(next.exercises.map((e) => [e.exercise, e.targetWeightKg])),
  );
  const [editing, setEditing] = React.useState(false);
  const [pending, start] = useTransition();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const finished = saved;

  function cycle(ex: Exercise, i: number) {
    if (finished) return;
    setSaved(false);
    setReps((prev) => {
      const arr = [...prev[ex]];
      arr[i] = arr[i] >= MAX_REPS ? 0 : arr[i] + 1;
      return { ...prev, [ex]: arr };
    });
  }

  function adjustWeight(ex: Exercise, delta: number) {
    setWeights((p) => ({
      ...p,
      [ex]: Math.max(0, Number((p[ex] + delta).toFixed(2))),
    }));
  }

  function saveWeights() {
    start(async () => {
      await updateLiftWeights(weights);
      setEditing(false);
    });
  }

  function finish() {
    if (finished || pending) return;
    start(async () => {
      setError(null);
      const result = await completeLiftWorkout({
        date,
        workout: next.workout,
        entries: next.exercises.map((e) => ({
          exercise: e.exercise,
          targetWeightKg: weights[e.exercise],
          reps: reps[e.exercise],
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">Workout {next.workout}</h2>
        <span className="text-sm text-muted-foreground">{LIFT_PROGRAM_NAME}</span>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {editing
            ? "Set your working weights (± 2.5 kg)."
            : finished
              ? "Workout saved for today."
              : "Tap each set to count reps (0→10). Green = on target; amber/red flags overwork."}
        </p>
        {!finished && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs font-medium text-accent"
          >
            {editing ? "Done" : "Adjust weights"}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {next.exercises.map((e) => (
          <div key={e.exercise}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-medium">{EXERCISE_LABELS[e.exercise]}</span>
              {editing ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => adjustWeight(e.exercise, -2.5)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground"
                    aria-label="Decrease weight"
                  >
                    −
                  </button>
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={weights[e.exercise]}
                    onChange={(ev) =>
                      setWeights((p) => ({
                        ...p,
                        [e.exercise]: parseFloat(ev.target.value) || 0,
                      }))
                    }
                    className="h-9 w-20 text-center"
                  />
                  <button
                    onClick={() => adjustWeight(e.exercise, 2.5)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground"
                    aria-label="Increase weight"
                  >
                    +
                  </button>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {trimNum(weights[e.exercise])} kg × {e.sets}×{REPS_PER_SET}
                </span>
              )}
            </div>

            {!editing && (
              <div className="flex flex-wrap gap-2">
                {reps[e.exercise].map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={finished || pending}
                    onClick={() => cycle(e.exercise, i)}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full border text-base font-semibold transition",
                      repClass(r),
                      (finished || pending) && "pointer-events-none opacity-60",
                    )}
                    aria-label={`${EXERCISE_LABELS[e.exercise]} set ${i + 1}: ${r} reps`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {editing ? (
        <Button className="mt-5 w-full" onClick={saveWeights} disabled={pending}>
          {pending ? "Saving…" : "Save weights"}
        </Button>
      ) : (
        <>
          <Button
            className="mt-5 w-full"
            onClick={finish}
            disabled={finished || pending}
          >
            {pending ? "Saving…" : finished ? "Saved ✓" : "Finish workout"}
          </Button>
          {finished && (
            <p className="mt-2 text-center text-sm text-accent">
              Logged. Targets updated for next time.
            </p>
          )}
          {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}
        </>
      )}
    </Card>
  );
}
