"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { CARDIO_LABELS, CARDIO_TYPES, CardioType } from "@/lib/constants";
import { calculateCardioAvgHr, logCardio } from "@/lib/activity-actions";
import { nullableNum } from "@/lib/format";

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CardioForm({ date }: { date: string }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [type, setType] = React.useState<CardioType>("run");
  const [avgHr, setAvgHr] = React.useState("");
  const [maxHr, setMaxHr] = React.useState("");
  const [pending, start] = useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [calcPending, startCalc] = useTransition();
  const [calcMsg, setCalcMsg] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const time = String(fd.get("time") ?? "").trim();
    start(async () => {
      setError(null);
      const result = await logCardio({
        date,
        type,
        startedAt: time ? `${date}T${time}` : null,
        durationMin: nullableNum(fd.get("duration")),
        distanceKm: nullableNum(fd.get("distance")),
        avgHr: nullableNum(fd.get("avgHr")),
        maxHr: nullableNum(fd.get("maxHr")),
        kcal: nullableNum(fd.get("kcal")),
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setType("run");
      setAvgHr("");
      setMaxHr("");
      setCalcMsg(null);
    });
  }

  // Pull the day's Fitbit/Google Health HR samples for the start-time + duration
  // window and fill Avg HR with their mean.
  function calcHr() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const time = String(fd.get("time") ?? "").trim();
    const duration = nullableNum(fd.get("duration"));
    startCalc(async () => {
      setCalcMsg(null);
      const r = await calculateCardioAvgHr({ date, time, durationMin: duration ?? 0 });
      if (!r.ok) {
        setCalcMsg(r.error);
        return;
      }
      setAvgHr(String(r.avgHr));
      setMaxHr(String(r.maxHr));
      setCalcMsg(`Averaged ${r.samples} readings (max ${r.maxHr}).`);
    });
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Log cardio</h2>
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as CardioType)}>
              {CARDIO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CARDIO_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time">
            <Input name="time" type="time" defaultValue={nowHHMM()} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (min)">
            <Input name="duration" type="number" step="any" inputMode="decimal" />
          </Field>
          <Field label="Distance (km)">
            <Input name="distance" type="number" step="any" inputMode="decimal" />
          </Field>
          <Field label="Avg HR (bpm)">
            <div className="flex gap-2">
              <Input
                name="avgHr"
                type="number"
                inputMode="numeric"
                value={avgHr}
                onChange={(e) => setAvgHr(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={calcHr}
                disabled={calcPending}
                className="h-11 shrink-0 px-3 text-sm"
                title="Average heart rate from Google Health for this time window"
              >
                {calcPending ? "…" : "Calc"}
              </Button>
            </div>
          </Field>
          <Field label="Max HR (bpm)">
            <Input
              name="maxHr"
              type="number"
              inputMode="numeric"
              value={maxHr}
              onChange={(e) => setMaxHr(e.target.value)}
            />
          </Field>
          <Field label="Calories">
            <Input name="kcal" type="number" inputMode="numeric" />
          </Field>
        </div>
        {calcMsg && <p className="text-sm text-muted-foreground">{calcMsg}</p>}
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
