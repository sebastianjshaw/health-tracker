"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { CARDIO_LABELS, CARDIO_TYPES, CardioType } from "@/lib/constants";
import { logCardio } from "@/lib/activity-actions";
import { nullableNum } from "@/lib/format";

export function CardioForm({ date }: { date: string }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [type, setType] = React.useState<CardioType>("run");
  const [pending, start] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setError(null);
      const result = await logCardio({
        date,
        type,
        durationMin: nullableNum(fd.get("duration")),
        distanceKm: nullableNum(fd.get("distance")),
        avgHr: nullableNum(fd.get("avgHr")),
        kcal: nullableNum(fd.get("kcal")),
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setType("run");
    });
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Log cardio</h2>
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as CardioType)}>
            {CARDIO_TYPES.map((t) => (
              <option key={t} value={t}>
                {CARDIO_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (min)">
            <Input name="duration" type="number" step="any" inputMode="decimal" />
          </Field>
          <Field label="Distance (km)">
            <Input name="distance" type="number" step="any" inputMode="decimal" />
          </Field>
          <Field label="Avg HR (bpm)">
            <Input name="avgHr" type="number" inputMode="numeric" />
          </Field>
          <Field label="Calories">
            <Input name="kcal" type="number" inputMode="numeric" />
          </Field>
        </div>
        <Field label="Notes">
          <Input name="notes" placeholder="optional" />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save session"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Card>
  );
}
