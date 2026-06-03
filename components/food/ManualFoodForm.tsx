"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { createFood, type FoodFormState } from "@/app/(main)/food/actions";

const initial: FoodFormState = { error: null };

export function ManualFoodForm({
  defaults,
  onSaved,
}: {
  defaults?: Partial<{
    name: string;
    brand: string;
    barcode: string;
    servingSize: number;
    servingUnit: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    source: string;
  }>;
  onSaved?: () => void;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(createFood, initial);

  React.useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onSaved?.();
    }
  }, [state.ok, onSaved]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="source" defaultValue={defaults?.source ?? "manual"} />
      <input type="hidden" name="barcode" defaultValue={defaults?.barcode ?? ""} />

      <Field label="Name">
        <Input name="name" defaultValue={defaults?.name ?? ""} placeholder="e.g. Oat milk" required />
      </Field>
      <Field label="Brand (optional)">
        <Input name="brand" defaultValue={defaults?.brand ?? ""} placeholder="e.g. Oatly" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Serving size">
          <Input
            name="servingSize"
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={defaults?.servingSize ?? 100}
          />
        </Field>
        <Field label="Unit">
          <Input name="servingUnit" defaultValue={defaults?.servingUnit ?? "g"} placeholder="g, ml, serving" />
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">Nutrition per serving:</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories (kcal)">
          <Input name="kcal" type="number" step="any" inputMode="decimal" defaultValue={defaults?.kcal ?? ""} />
        </Field>
        <Field label="Protein (g)">
          <Input name="protein" type="number" step="any" inputMode="decimal" defaultValue={defaults?.protein ?? ""} />
        </Field>
        <Field label="Carbs (g)">
          <Input name="carbs" type="number" step="any" inputMode="decimal" defaultValue={defaults?.carbs ?? ""} />
        </Field>
        <Field label="Fat (g)">
          <Input name="fat" type="number" step="any" inputMode="decimal" defaultValue={defaults?.fat ?? ""} />
        </Field>
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save food"}
      </Button>
    </form>
  );
}
