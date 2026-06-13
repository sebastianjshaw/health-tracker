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
  suggestedKcal,
  suggestedProtein,
  maintenanceKcal,
  bmrKcal,
}: {
  kcal: number;
  protein: number;
  goalWeight: number | null;
  mealSplit: Record<Meal, number>;
  /** Calculated target from current weight + goal; null if profile incomplete. */
  suggestedKcal?: number | null;
  /** Suggested protein (g) from bodyweight; null if profile incomplete. */
  suggestedProtein?: number | null;
  /** Maintenance (TDEE) kcal; used to flag an over-aggressive deficit. */
  maintenanceKcal?: number | null;
  /** Estimated BMR kcal; eating below this is the hard floor. */
  bmrKcal?: number | null;
}) {
  const [k, setK] = React.useState(String(kcal));
  const [p, setP] = React.useState(String(protein));
  const [gw, setGw] = React.useState(goalWeight != null ? String(goalWeight) : "");
  const [split, setSplit] = React.useState<Record<Meal, number>>(mealSplit);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = useTransition();

  const splitSum = MEALS.reduce((s, m) => s + (split[m] || 0), 0);
  const splitValid = splitSum === 100;

  // "Don't starve" guardrail: eating under BMR is the hard floor; a deficit of
  // more than ~1000 kcal/day below maintenance is steeper than is sustainable.
  const kNum = Number(k) || 0;
  const deficit =
    kNum > 0 && bmrKcal != null && kNum < bmrKcal
      ? {
          tone: "danger" as const,
          text: `Below your estimated BMR (~${bmrKcal} kcal). That's too aggressive — it sheds muscle and stalls your metabolism. Keep it above BMR.`,
        }
      : kNum > 0 && maintenanceKcal != null && kNum <= maintenanceKcal - 1000
        ? {
            tone: "warn" as const,
            text: `That's a steep deficit (>1000 kcal/day below your ~${maintenanceKcal} maintenance). ~500/day gives steadier, more sustainable loss.`,
          }
        : null;

  function touch() {
    setSaved(false);
    setError(null);
  }

  function save() {
    if (!splitValid) return;
    start(async () => {
      setError(null);
      const result = await saveGoals({
        kcal: Number(k) || 0,
        protein: Number(p) || 0,
        goalWeight: gw.trim() === "" ? null : Number(gw),
        mealSplit: split,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
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

      {suggestedKcal != null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Suggested ≈{" "}
          <span className="font-medium text-foreground">{suggestedKcal}</span> kcal/day
          from your current weight &amp; goal.{" "}
          {String(suggestedKcal) !== k && (
            <button
              type="button"
              onClick={() => {
                setK(String(suggestedKcal));
                touch();
              }}
              className="font-medium text-accent"
            >
              Use this
            </button>
          )}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Add height, DOB &amp; sex in your profile to get a suggested calorie target.
        </p>
      )}

      {deficit && (
        <p className={`mt-2 text-xs ${deficit.tone === "danger" ? "text-danger" : "text-warn"}`}>
          {deficit.text}
        </p>
      )}

      {suggestedProtein != null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Suggested protein ≈{" "}
          <span className="font-medium text-foreground">{suggestedProtein}</span> g/day
          (~2 g/kg of bodyweight).{" "}
          {String(suggestedProtein) !== p && (
            <button
              type="button"
              onClick={() => {
                setP(String(suggestedProtein));
                touch();
              }}
              className="font-medium text-accent"
            >
              Use this
            </button>
          )}
        </p>
      )}

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">
            Meal calorie split (%)
          </label>
          <span className={`text-xs ${splitValid ? "text-muted-foreground" : "text-warn"}`}>
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
        {!splitValid && (
          <p className="mt-1 text-xs text-warn">Percentages must add up to 100%.</p>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        New calorie/protein targets apply from today onward — past days keep the
        target that was set then.
      </p>
      <Button className="mt-3 w-full" onClick={save} disabled={pending || !splitValid}>
        {pending ? "Saving…" : saved ? "Saved ✓" : "Save goals"}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
