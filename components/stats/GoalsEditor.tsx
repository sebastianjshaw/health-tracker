"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { MEALS, MEAL_LABELS, Meal } from "@/lib/constants";
import { saveGoals } from "@/lib/body-actions";

export function GoalsEditor({
  kcal,
  protein,
  goalWeight,
  mealSplit,
}: {
  kcal: number;
  protein: number;
  goalWeight: number | null;
  mealSplit: Record<Meal, number>;
}) {
  const [k, setK] = React.useState(String(kcal));
  const [p, setP] = React.useState(String(protein));
  const [gw, setGw] = React.useState(goalWeight != null ? String(goalWeight) : "");
  const [split, setSplit] = React.useState<Record<Meal, number>>(mealSplit);
  const [saved, setSaved] = React.useState(false);
  const [pending, start] = useTransition();

  const splitSum = MEALS.reduce((s, m) => s + (split[m] || 0), 0);

  function touch() {
    setSaved(false);
  }

  function save() {
    start(async () => {
      await saveGoals({
        kcal: Number(k) || 0,
        protein: Number(p) || 0,
        goalWeight: gw.trim() === "" ? null : Number(gw),
        mealSplit: split,
      });
      setSaved(true);
    });
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Daily goals</h2>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Calories">
          <Input type="number" inputMode="numeric" value={k} onChange={(e) => { setK(e.target.value); touch(); }} />
        </Field>
        <Field label="Protein (g)">
          <Input type="number" inputMode="numeric" value={p} onChange={(e) => { setP(e.target.value); touch(); }} />
        </Field>
        <Field label="Goal weight">
          <Input type="number" step="any" inputMode="decimal" placeholder="kg" value={gw} onChange={(e) => { setGw(e.target.value); touch(); }} />
        </Field>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">
            Meal calorie split (%)
          </label>
          <span className={`text-xs ${splitSum === 100 ? "text-muted-foreground" : "text-warn"}`}>
            sums to {splitSum}%
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {MEALS.map((m) => (
            <div key={m}>
              <span className="mb-1 block text-center text-xs text-muted-foreground">
                {MEAL_LABELS[m].slice(0, 1)}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                value={split[m]}
                onChange={(e) => {
                  setSplit((s) => ({ ...s, [m]: parseInt(e.target.value) || 0 }));
                  touch();
                }}
                className="text-center"
                aria-label={`${MEAL_LABELS[m]} percent`}
              />
            </div>
          ))}
        </div>
      </div>

      <Button className="mt-4 w-full" onClick={save} disabled={pending}>
        {pending ? "Saving…" : saved ? "Saved ✓" : "Save goals"}
      </Button>
    </Card>
  );
}
