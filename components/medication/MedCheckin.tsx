"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  APPETITE_LABELS,
  SEVERITY_LABELS,
  SIDE_EFFECTS,
  SIDE_EFFECT_LABELS,
} from "@/lib/constants";
import { setCheckin, type SideEffectEntry } from "@/lib/medication-actions";

const SEVERITY_CLASS: Record<number, string> = {
  0: "border-border bg-transparent text-muted-foreground",
  1: "border-transparent bg-amber-500/20 text-amber-200",
  2: "border-transparent bg-orange-500/30 text-orange-200",
  3: "border-transparent bg-danger/30 text-foreground",
};

export function MedCheckin({
  date,
  appetite: initialAppetite,
  sideEffects: initialEffects,
  notes: initialNotes,
}: {
  date: string;
  appetite: number | null;
  sideEffects: SideEffectEntry[];
  notes: string | null;
}) {
  const [appetite, setAppetite] = React.useState<number | null>(initialAppetite);
  const [severity, setSeverity] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(initialEffects.map((e) => [e.type, e.severity])),
  );
  const [notes, setNotes] = React.useState(initialNotes ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = React.useState(false);

  function cycle(type: string) {
    setSaved(false);
    setSeverity((s) => ({ ...s, [type]: ((s[type] ?? 0) + 1) % 4 }));
  }

  function save() {
    start(async () => {
      const sideEffects: SideEffectEntry[] = Object.entries(severity)
        .filter(([, sev]) => sev > 0)
        .map(([type, sev]) => ({ type, severity: sev }));
      await setCheckin({ date, appetite, sideEffects, notes: notes.trim() || null });
      setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-medium text-muted-foreground">Appetite today</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setSaved(false);
                setAppetite((cur) => (cur === n ? null : n));
              }}
              aria-pressed={appetite === n}
              className={cn(
                "flex h-11 flex-1 flex-col items-center justify-center rounded-xl border text-xs transition",
                appetite === n
                  ? "border-accent bg-accent/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="text-sm font-semibold">{n}</span>
              <span>{APPETITE_LABELS[n]}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-muted-foreground">
          Side effects <span className="font-normal">(tap to cycle severity)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {SIDE_EFFECTS.map((type) => {
            const sev = severity[type] ?? 0;
            return (
              <button
                key={type}
                type="button"
                onClick={() => cycle(type)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  SEVERITY_CLASS[sev],
                )}
              >
                {SIDE_EFFECT_LABELS[type]}
                {sev > 0 && <span className="ml-1 opacity-80">· {SEVERITY_LABELS[sev]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <Input
        value={notes}
        onChange={(e) => {
          setSaved(false);
          setNotes(e.target.value);
        }}
        placeholder="Notes (optional)"
      />

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save check-in"}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved ✓</span>}
      </div>
    </div>
  );
}
