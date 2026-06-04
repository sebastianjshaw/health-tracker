"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { NutrientList, type Extra } from "./NutrientList";
import {
  createFood,
  updateFood,
  type FoodFormState,
} from "@/app/(main)/food/actions";
import type { Food } from "@/db/schema";

const initialState: FoodFormState = { error: null };

function parseExtras(json: string | null | undefined): Extra[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      return arr.map((e) => ({
        label: String(e?.label ?? ""),
        value: String(e?.value ?? ""),
        unit: String(e?.unit ?? ""),
      }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

type CreateDefaults = Partial<{
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

export function ManualFoodForm({
  food,
  defaults,
  onSaved,
}: {
  food?: Food;
  defaults?: CreateDefaults;
  onSaved?: () => void;
}) {
  const editing = !!food;
  const action = editing ? updateFood : createFood;
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(action, initialState);

  const [extras, setExtras] = React.useState<Extra[]>(() =>
    parseExtras(food?.extras ?? null),
  );
  const hasExtended = !!(
    food &&
    (food.fiber != null ||
      food.sugar != null ||
      food.saturatedFat != null ||
      food.salt != null ||
      food.sodium != null ||
      parseExtras(food.extras).length > 0)
  );
  const [more, setMore] = React.useState(hasExtended);

  React.useEffect(() => {
    if (state.ok) {
      if (!editing) formRef.current?.reset();
      onSaved?.();
    }
  }, [state.ok, editing, onSaved]);

  const dv = {
    name: food?.name ?? defaults?.name ?? "",
    brand: food?.brand ?? defaults?.brand ?? "",
    barcode: food?.barcode ?? defaults?.barcode ?? "",
    servingSize: food?.servingSize ?? defaults?.servingSize ?? 100,
    servingUnit: food?.servingUnit ?? defaults?.servingUnit ?? "g",
    kcal: food?.kcal ?? defaults?.kcal ?? "",
    protein: food?.protein ?? defaults?.protein ?? "",
    carbs: food?.carbs ?? defaults?.carbs ?? "",
    fat: food?.fat ?? defaults?.fat ?? "",
    fiber: food?.fiber ?? "",
    sugar: food?.sugar ?? "",
    saturatedFat: food?.saturatedFat ?? "",
    salt: food?.salt ?? "",
    sodium: food?.sodium ?? "",
    source: food?.source ?? defaults?.source ?? "manual",
  };

  const cleanExtras = extras
    .filter((e) => e.label.trim() !== "")
    .map((e) => ({ label: e.label.trim(), value: e.value.trim(), unit: e.unit.trim() }));

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {editing && <input type="hidden" name="id" value={food!.id} />}
      <input type="hidden" name="source" value={dv.source} />
      <input type="hidden" name="barcode" value={dv.barcode} />
      <input type="hidden" name="extras" value={cleanExtras.length ? JSON.stringify(cleanExtras) : ""} />

      <Field label="Name">
        <Input name="name" defaultValue={dv.name} placeholder="e.g. Oat milk" required />
      </Field>
      <Field label="Brand (optional)">
        <Input name="brand" defaultValue={dv.brand} placeholder="e.g. Oatly" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Serving size">
          <Input name="servingSize" type="number" step="any" inputMode="decimal" defaultValue={dv.servingSize} />
        </Field>
        <Field label="Unit">
          <Input name="servingUnit" defaultValue={dv.servingUnit} placeholder="g, ml, serving" />
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">Nutrition per serving:</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories (kcal)">
          <Input name="kcal" type="number" step="any" inputMode="decimal" defaultValue={dv.kcal} />
        </Field>
        <Field label="Protein (g)">
          <Input name="protein" type="number" step="any" inputMode="decimal" defaultValue={dv.protein} />
        </Field>
        <Field label="Carbs (g)">
          <Input name="carbs" type="number" step="any" inputMode="decimal" defaultValue={dv.carbs} />
        </Field>
        <Field label="Fat (g)">
          <Input name="fat" type="number" step="any" inputMode="decimal" defaultValue={dv.fat} />
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        className="text-sm font-medium text-accent"
      >
        {more ? "Less ▴" : "More nutrition ▾"}
      </button>

      {more && (
        <div className="space-y-3 rounded-xl bg-muted/50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fibre (g)">
              <Input name="fiber" type="number" step="any" inputMode="decimal" defaultValue={dv.fiber} />
            </Field>
            <Field label="Sugars (g)">
              <Input name="sugar" type="number" step="any" inputMode="decimal" defaultValue={dv.sugar} />
            </Field>
            <Field label="Saturated fat (g)">
              <Input name="saturatedFat" type="number" step="any" inputMode="decimal" defaultValue={dv.saturatedFat} />
            </Field>
            <Field label="Salt (g)">
              <Input name="salt" type="number" step="any" inputMode="decimal" defaultValue={dv.salt} />
            </Field>
            <Field label="Sodium (mg)">
              <Input name="sodium" type="number" step="any" inputMode="decimal" defaultValue={dv.sodium} />
            </Field>
          </div>

          <NutrientList value={extras} onChange={setExtras} />
        </div>
      )}

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : editing ? "Save changes" : "Save food"}
      </Button>
    </form>
  );
}
