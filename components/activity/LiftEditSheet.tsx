"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { cn } from "@/lib/cn";
import { EXERCISE_LABELS, Exercise, REPS_PER_SET } from "@/lib/constants";
import { deleteLiftSession, updateLiftSession } from "@/lib/activity-actions";
import type { LiftHistoryEntry } from "@/lib/activity-data";

// Mirrors LiftTracker: reps cycle 0 → 10; green on target, amber/red flag overwork.
const MAX_REPS = 10;
function repClass(r: number): string {
  if (r <= 0) return "border-border bg-muted text-muted-foreground";
  if (r <= REPS_PER_SET) return "border-accent bg-accent text-accent-foreground";
  if (r <= 8) return "border-transparent bg-warn text-white";
  return "border-transparent bg-danger text-white";
}

/** Group a session's flat set list into ordered per-exercise weight + reps. */
function groupByExercise(sets: LiftHistoryEntry["sets"]) {
  const byEx = new Map<Exercise, { weight: number; reps: number[] }>();
  for (const s of sets) {
    const cur = byEx.get(s.exercise);
    if (cur) cur.reps.push(s.repsDone ?? 0);
    else byEx.set(s.exercise, { weight: s.targetWeightKg, reps: [s.repsDone ?? 0] });
  }
  return [...byEx.entries()].map(([exercise, v]) => ({ exercise, ...v }));
}

export function LiftEditSheet({
  entry,
  onClose,
}: {
  entry: LiftHistoryEntry | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={entry != null} onClose={onClose} title={entry ? `Edit workout ${entry.workout}` : "Edit workout"}>
      {entry && <EditForm key={entry.id} entry={entry} onClose={onClose} />}
    </Sheet>
  );
}

function EditForm({ entry, onClose }: { entry: LiftHistoryEntry; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [date, setDate] = React.useState(entry.date);
  const [notes, setNotes] = React.useState(entry.notes ?? "");
  const grouped = React.useMemo(() => groupByExercise(entry.sets), [entry]);
  const [weights, setWeights] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(grouped.map((g) => [g.exercise, g.weight])),
  );
  const [reps, setReps] = React.useState<Record<string, number[]>>(() =>
    Object.fromEntries(grouped.map((g) => [g.exercise, [...g.reps]])),
  );

  function cycle(ex: Exercise, i: number) {
    setReps((prev) => {
      const arr = [...prev[ex]];
      arr[i] = arr[i] >= MAX_REPS ? 0 : arr[i] + 1;
      return { ...prev, [ex]: arr };
    });
  }

  function adjustWeight(ex: Exercise, delta: number) {
    setWeights((p) => ({ ...p, [ex]: Math.max(0, Number((p[ex] + delta).toFixed(2))) }));
  }

  function save() {
    start(async () => {
      setError(null);
      const r = await updateLiftSession({
        id: entry.id,
        date,
        notes: notes.trim() || null,
        entries: grouped.map((g) => ({
          exercise: g.exercise,
          targetWeightKg: weights[g.exercise],
          reps: reps[g.exercise],
        })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      await deleteLiftSession(entry.id);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <div className="space-y-4">
        {grouped.map((g) => (
          <div key={g.exercise}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-medium">{EXERCISE_LABELS[g.exercise]}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustWeight(g.exercise, -2.5)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground"
                  aria-label={`Decrease ${EXERCISE_LABELS[g.exercise]} weight`}
                >
                  −
                </button>
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={weights[g.exercise]}
                  onChange={(ev) =>
                    setWeights((p) => ({ ...p, [g.exercise]: parseFloat(ev.target.value) || 0 }))
                  }
                  className="h-9 w-20 text-center"
                  aria-label={`${EXERCISE_LABELS[g.exercise]} weight (kg)`}
                />
                <button
                  type="button"
                  onClick={() => adjustWeight(g.exercise, 2.5)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground"
                  aria-label={`Increase ${EXERCISE_LABELS[g.exercise]} weight`}
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {reps[g.exercise].map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => cycle(g.exercise, i)}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border text-base font-semibold transition",
                    repClass(r),
                  )}
                  aria-label={`${EXERCISE_LABELS[g.exercise]} set ${i + 1}: ${r} reps — tap to change`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Field label="Notes">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
      </Field>

      <Button className="w-full" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
      <Button variant="danger" className="w-full" onClick={remove} disabled={pending}>
        Delete workout
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
