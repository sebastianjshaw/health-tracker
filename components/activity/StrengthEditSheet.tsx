"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { nullableNum } from "@/lib/format";
import { updateFreeformLift } from "@/lib/activity-actions";
import type { FreeformLift } from "@/lib/activity-data";

export function StrengthEditSheet({
  entry,
  onClose,
}: {
  entry: FreeformLift | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={entry != null} onClose={onClose} title="Edit strength entry">
      {entry && <EditForm key={entry.id} entry={entry} onClose={onClose} />}
    </Sheet>
  );
}

function EditForm({ entry, onClose }: { entry: FreeformLift; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setError(null);
      const r = await updateFreeformLift({
        id: entry.id,
        date: String(fd.get("date") ?? entry.date),
        exercise: String(fd.get("exercise") ?? "").trim(),
        sets: nullableNum(fd.get("sets")),
        repsPerSet: nullableNum(fd.get("reps")),
        weightKg: nullableNum(fd.get("weight")),
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {entry.source !== "manual" && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Imported from {entry.source}. Edits stick unless you re-run that import.
        </p>
      )}
      <Field label="Exercise">
        <Input name="exercise" defaultValue={entry.exercise} required />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sets">
          <Input name="sets" type="number" inputMode="numeric" defaultValue={entry.sets ?? ""} />
        </Field>
        <Field label="Reps">
          <Input name="reps" type="number" inputMode="numeric" defaultValue={entry.repsPerSet ?? ""} />
        </Field>
        <Field label="Weight (kg)">
          <Input name="weight" type="number" step="any" inputMode="decimal" defaultValue={entry.weightKg ?? ""} />
        </Field>
      </div>
      <Field label="Date">
        <Input name="date" type="date" defaultValue={entry.date} />
      </Field>
      <Field label="Notes">
        <Input name="notes" defaultValue={entry.notes ?? ""} placeholder="optional" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
