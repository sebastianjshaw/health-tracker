"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { CARDIO_TYPES, CardioType } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { logCardio } from "@/lib/activity-actions";

const TYPE_LABELS: Record<CardioType, string> = {
  run: "Run",
  bike: "Bike",
  row: "Row",
  walk: "Walk",
  swim: "Swim",
  other: "Other",
};

function num(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function CardioForm() {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [type, setType] = React.useState<CardioType>("run");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await logCardio({
        date: todayISO(),
        type,
        durationMin: num(String(fd.get("duration") ?? "")),
        distanceKm: num(String(fd.get("distance") ?? "")),
        avgHr: num(String(fd.get("avgHr") ?? "")),
        kcal: num(String(fd.get("kcal") ?? "")),
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
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
                {TYPE_LABELS[t]}
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
      </form>
    </Card>
  );
}
