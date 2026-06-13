"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { CARDIO_LABELS, CARDIO_TYPES, CardioType } from "@/lib/constants";
import { timeOf } from "@/lib/date";
import { nullableNum } from "@/lib/format";
import { updateCardio } from "@/lib/activity-actions";
import type { CardioSession } from "@/db/schema";

export function CardioEditSheet({
  session,
  onClose,
}: {
  session: CardioSession | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={session != null} onClose={onClose} title="Edit activity">
      {session && <EditForm key={session.id} session={session} onClose={onClose} />}
    </Sheet>
  );
}

function EditForm({ session, onClose }: { session: CardioSession; onClose: () => void }) {
  const router = useRouter();
  const imported = session.source !== "manual";
  const [type, setType] = React.useState<CardioType>(session.type as CardioType);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const notes = String(fd.get("notes") ?? "").trim() || null;
    const time = String(fd.get("time") ?? "").trim();
    start(async () => {
      setError(null);
      const r = await updateCardio(
        imported
          ? { id: session.id, notes }
          : {
              id: session.id,
              type,
              startedAt: time ? `${session.date}T${time}` : null,
              durationMin: nullableNum(fd.get("duration")),
              distanceKm: nullableNum(fd.get("distance")),
              avgHr: nullableNum(fd.get("avgHr")),
              kcal: nullableNum(fd.get("kcal")),
              notes,
            },
      );
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
      {imported && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Imported from Google Health — only notes can be edited.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select
            value={type}
            disabled={imported}
            onChange={(e) => setType(e.target.value as CardioType)}
          >
            {CARDIO_TYPES.map((t) => (
              <option key={t} value={t}>
                {CARDIO_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time">
          <Input
            name="time"
            type="time"
            defaultValue={timeOf(session.startedAt) ?? ""}
            disabled={imported}
          />
        </Field>
        <Field label="Duration (min)">
          <Input
            name="duration"
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={session.durationMin ?? ""}
            disabled={imported}
          />
        </Field>
        <Field label="Distance (km)">
          <Input
            name="distance"
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={session.distanceKm ?? ""}
            disabled={imported}
          />
        </Field>
        <Field label="Avg HR (bpm)">
          <Input
            name="avgHr"
            type="number"
            inputMode="numeric"
            defaultValue={session.avgHr ?? ""}
            disabled={imported}
          />
        </Field>
        <Field label="Calories">
          <Input
            name="kcal"
            type="number"
            inputMode="numeric"
            defaultValue={session.kcal != null ? Math.round(session.kcal) : ""}
            disabled={imported}
          />
        </Field>
      </div>
      <Field label="Notes">
        <Input name="notes" defaultValue={session.notes ?? ""} placeholder="optional" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
