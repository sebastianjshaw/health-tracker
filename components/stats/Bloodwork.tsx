"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { prettyDate, todayISO } from "@/lib/date";
import { nullableNum, trimNum } from "@/lib/format";
import { addBloodMarker, deleteBloodMarker } from "@/lib/blood-actions";
import type { BloodMarker } from "@/db/schema";
import type { BloodPanel } from "@/lib/blood-data";

function statusOf(m: BloodMarker): "low" | "high" | "ok" | "unknown" {
  if (m.refLow == null && m.refHigh == null) return "unknown";
  if (m.refLow != null && m.value < m.refLow) return "low";
  if (m.refHigh != null && m.value > m.refHigh) return "high";
  return "ok";
}

const STATUS_CLASS: Record<string, string> = {
  low: "text-warn",
  high: "text-danger",
  ok: "text-accent",
  unknown: "",
};

export function Bloodwork({ panels }: { panels: BloodPanel[] }) {
  const [open, setOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const marker = String(fd.get("marker") ?? "").trim();
    const value = nullableNum(fd.get("value"));
    if (!marker || value == null) return;
    start(async () => {
      await addBloodMarker({
        date: String(fd.get("date") || todayISO()),
        clinic: String(fd.get("clinic") ?? "").trim() || null,
        category: String(fd.get("category") ?? "").trim() || null,
        marker,
        value,
        unit: String(fd.get("unit") ?? "").trim() || null,
        refLow: nullableNum(fd.get("refLow")),
        refHigh: nullableNum(fd.get("refHigh")),
      });
      formRef.current?.reset();
    });
  }

  return (
    <div className="space-y-2">
      <Card className="p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between font-semibold"
        >
          <span>Add blood / lab result</span>
          <span className="text-muted-foreground">{open ? "–" : "+"}</span>
        </button>
        {open && (
          <form ref={formRef} onSubmit={submit} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Test date">
                <Input name="date" type="date" defaultValue={todayISO()} />
              </Field>
              <Field label="Clinic (optional)">
                <Input name="clinic" placeholder="e.g. Werlabs" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Marker">
                <Input name="marker" placeholder="e.g. Total cholesterol" required />
              </Field>
              <Field label="Category (optional)">
                <Input name="category" placeholder="e.g. Lipids" />
              </Field>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Field label="Value">
                <Input name="value" type="number" step="any" inputMode="decimal" required />
              </Field>
              <Field label="Unit">
                <Input name="unit" placeholder="mmol/L" />
              </Field>
              <Field label="Ref low">
                <Input name="refLow" type="number" step="any" inputMode="decimal" />
              </Field>
              <Field label="Ref high">
                <Input name="refHigh" type="number" step="any" inputMode="decimal" />
              </Field>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Add result"}
            </Button>
          </form>
        )}
      </Card>

      {panels.map((panel) => (
        <Card key={panel.date} className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">{prettyDate(panel.date)}</span>
            {panel.clinic && (
              <span className="text-xs text-muted-foreground">{panel.clinic}</span>
            )}
          </div>
          <div className="divide-y divide-border">
            {panel.markers.map((m) => {
              const status = statusOf(m);
              const range =
                m.refLow != null || m.refHigh != null
                  ? `${m.refLow != null ? trimNum(m.refLow) : ""}–${m.refHigh != null ? trimNum(m.refHigh) : ""}`
                  : null;
              return (
                <div key={m.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.marker}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.category ? `${m.category}` : ""}
                      {range ? `${m.category ? " · " : ""}ref ${range} ${m.unit}` : ""}
                    </div>
                  </div>
                  <div className={`text-right text-sm font-semibold ${STATUS_CLASS[status]}`}>
                    {trimNum(m.value)} {m.unit}
                    {status === "high" && " ↑"}
                    {status === "low" && " ↓"}
                  </div>
                  <DeleteButton
                    onDelete={() => deleteBloodMarker(m.id)}
                    label={`Delete ${m.marker}`}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
