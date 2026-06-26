"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { logFreeformLift } from "@/lib/activity-actions";
import { nullableNum } from "@/lib/format";

/** Log a free-form strength entry (anything outside the 5×5 program). */
export function StrengthForm({ date }: { date: string }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setError(null);
      const result = await logFreeformLift({
        date,
        exercise: String(fd.get("exercise") ?? "").trim(),
        sets: nullableNum(fd.get("sets")),
        repsPerSet: nullableNum(fd.get("reps")),
        weightKg: nullableNum(fd.get("weight")),
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Log strength</h2>
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <Field label="Exercise">
          <Input name="exercise" placeholder="e.g. Dumbbell bench press" required />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sets">
            <Input name="sets" type="number" inputMode="numeric" />
          </Field>
          <Field label="Reps">
            <Input name="reps" type="number" inputMode="numeric" />
          </Field>
          <Field label="Weight (kg)">
            <Input name="weight" type="number" step="any" inputMode="decimal" />
          </Field>
        </div>
        <Field label="Notes">
          <Input name="notes" placeholder="optional" />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save entry"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Card>
  );
}
