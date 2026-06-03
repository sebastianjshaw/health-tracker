"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { saveTargets } from "@/lib/body-actions";

export function GoalsEditor({ kcal, protein }: { kcal: number; protein: number }) {
  const [k, setK] = React.useState(String(kcal));
  const [p, setP] = React.useState(String(protein));
  const [saved, setSaved] = React.useState(false);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      await saveTargets(Number(k) || 0, Number(p) || 0);
      setSaved(true);
    });
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Daily goals</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories">
          <Input
            type="number"
            inputMode="numeric"
            value={k}
            onChange={(e) => { setK(e.target.value); setSaved(false); }}
          />
        </Field>
        <Field label="Protein (g)">
          <Input
            type="number"
            inputMode="numeric"
            value={p}
            onChange={(e) => { setP(e.target.value); setSaved(false); }}
          />
        </Field>
      </div>
      <Button className="mt-3 w-full" onClick={save} disabled={pending}>
        {pending ? "Saving…" : saved ? "Saved ✓" : "Save goals"}
      </Button>
    </Card>
  );
}
