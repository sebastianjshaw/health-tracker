"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { todayISO } from "@/lib/date";
import { logBody } from "@/lib/body-actions";
import { nullableNum } from "@/lib/format";

export function BodyForm() {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [more, setMore] = React.useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // No client-side "is anything filled?" guard — logBody validates and returns
    // a clear message (covers all fields, incl. chest/hips/notes).
    start(async () => {
      setError(null);
      const result = await logBody({
        date: todayISO(),
        weightKg: nullableNum(fd.get("weightKg")),
        bodyFatPct: nullableNum(fd.get("bodyFatPct")),
        waistCm: nullableNum(fd.get("waistCm")),
        chestCm: nullableNum(fd.get("chestCm")),
        hipsCm: nullableNum(fd.get("hipsCm")),
        restingHr: nullableNum(fd.get("restingHr")),
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setMore(false);
    });
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Log weight & vitals</h2>
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (kg)">
            <Input name="weightKg" type="number" step="any" inputMode="decimal" autoComplete="off" />
          </Field>
          <Field label="Body fat (%)">
            <Input name="bodyFatPct" type="number" step="any" inputMode="decimal" />
          </Field>
        </div>

        {more && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Waist (cm)">
              <Input name="waistCm" type="number" step="any" inputMode="decimal" />
            </Field>
            <Field label="Resting HR">
              <Input name="restingHr" type="number" inputMode="numeric" />
            </Field>
            <Field label="Chest (cm)">
              <Input name="chestCm" type="number" step="any" inputMode="decimal" />
            </Field>
            <Field label="Hips (cm)">
              <Input name="hipsCm" type="number" step="any" inputMode="decimal" />
            </Field>
            <Field label="Notes" className="col-span-2">
              <Input name="notes" placeholder="optional" />
            </Field>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setMore((v) => !v)}>
            {more ? "Less" : "More"}
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Card>
  );
}
