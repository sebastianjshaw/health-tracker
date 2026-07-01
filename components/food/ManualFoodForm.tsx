"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EVOLUTIONS,
  EVOLUTION_LABELS,
  Evolution,
  evolutionForSource,
} from "@/lib/constants";
import { inferCategory } from "@/lib/food-category";
import { num, trimNum } from "@/lib/format";
import { NutrientList, type Extra } from "./NutrientList";
import {
  createFood,
  updateFood,
  type FoodFormState,
} from "@/app/(main)/food/actions";
import type { Food } from "@/db/schema";

const initialState: FoodFormState = { error: null };

// Nutrition is stored per serving, but most labels quote per 100 g/ml — so for
// mass/volume foods the form takes values per 100 and scales them to the serving
// size on save (and back when editing). Discrete units (e.g. "serving", "piece")
// keep per-serving entry, where "per 100" is meaningless.
const PER100_UNITS = new Set(["g", "ml"]);
const isPer100Unit = (unit: string) => PER100_UNITS.has(unit.trim().toLowerCase());

/** Per-serving nutrient fields that scale with the serving size. */
const SCALED_FIELDS = [
  "kcal",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "saturatedFat",
  "salt",
  "sodium",
] as const;

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
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // The stored values were saved per serving; convert them back to per-100 for
  // display when the food is measured by mass/volume, so the form round-trips.
  const baseSize = food?.servingSize ?? defaults?.servingSize ?? 100;
  const baseUnit = food?.servingUnit ?? defaults?.servingUnit ?? "g";
  const showPer100 = isPer100Unit(baseUnit) && baseSize > 0 && baseSize !== 100;
  const toPer100 = (v: number | string | null | undefined): number | string => {
    if (v === "" || v == null) return "";
    // Only rescale mass/volume foods, and only genuine numbers — free-text extra
    // values ("trace", "1,5", …) and non-per-100 foods pass through untouched so
    // nothing is rounded away or turned into "NaN".
    const n = Number(v);
    if (!showPer100 || !Number.isFinite(n)) return v;
    return trimNum((n * 100) / baseSize);
  };

  const [unit, setUnit] = React.useState<string>(baseUnit);

  const [extras, setExtras] = React.useState<Extra[]>(() =>
    parseExtras(food?.extras ?? null).map((e) =>
      showPer100 && e.value.trim() !== ""
        ? { ...e, value: String(toPer100(e.value)) }
        : e,
    ),
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

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Inputs are per 100 g/ml for mass/volume foods — scale to per serving (the
    // stored convention) so logged totals come out right for the serving size.
    const size = num(fd.get("servingSize"), 100);
    const enteredUnit = String(fd.get("servingUnit") ?? "").trim() || "g";
    if (isPer100Unit(enteredUnit) && size > 0 && size !== 100) {
      const factor = size / 100;
      for (const key of SCALED_FIELDS) {
        const raw = fd.get(key);
        const n = Number(raw);
        if (raw != null && String(raw).trim() !== "" && Number.isFinite(n)) {
          fd.set(key, String(n * factor));
        }
      }
      if (cleanExtras.length) {
        fd.set(
          "extras",
          JSON.stringify(
            cleanExtras.map((ex) => {
              const n = Number(ex.value);
              // Leave blank or non-numeric extra values (e.g. "trace") as-is.
              return ex.value.trim() === "" || !Number.isFinite(n)
                ? ex
                : { ...ex, value: String(n * factor) };
            }),
          ),
        );
      }
    }
    const action = editing ? updateFood : createFood;
    start(async () => {
      setError(null);
      const result = await action(initialState, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!editing) formRef.current?.reset();
      onSaved?.();
    });
  }

  const dv = {
    name: food?.name ?? defaults?.name ?? "",
    brand: food?.brand ?? defaults?.brand ?? "",
    barcode: food?.barcode ?? defaults?.barcode ?? "",
    servingSize: food?.servingSize ?? defaults?.servingSize ?? 100,
    servingUnit: baseUnit,
    // Nutrient defaults are shown per 100 g/ml (see toPer100); stored per serving.
    kcal: toPer100(food?.kcal ?? defaults?.kcal ?? ""),
    protein: toPer100(food?.protein ?? defaults?.protein ?? ""),
    carbs: toPer100(food?.carbs ?? defaults?.carbs ?? ""),
    fat: toPer100(food?.fat ?? defaults?.fat ?? ""),
    fiber: toPer100(food?.fiber ?? ""),
    sugar: toPer100(food?.sugar ?? ""),
    saturatedFat: toPer100(food?.saturatedFat ?? ""),
    salt: toPer100(food?.salt ?? ""),
    sodium: toPer100(food?.sodium ?? ""),
    source: food?.source ?? defaults?.source ?? "manual",
  };
  const defaultCategory =
    food?.category ?? inferCategory(String(dv.servingUnit), String(dv.name));
  const defaultEvolution: Evolution =
    (food?.evolution as Evolution) ?? evolutionForSource(String(dv.source));

  const cleanExtras = extras
    .filter((e) => e.label.trim() !== "")
    .map((e) => ({ label: e.label.trim(), value: e.value.trim(), unit: e.unit.trim() }));

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3">
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
          <Input
            name="servingUnit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="g, ml, serving"
          />
        </Field>
      </div>

      <Field label="Category">
        <Select name="category" defaultValue={defaultCategory}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Calorie confidence (contingency)">
        <Select name="evolution" defaultValue={defaultEvolution}>
          {EVOLUTIONS.map((e) => (
            <option key={e} value={e}>
              {EVOLUTION_LABELS[e]}
            </option>
          ))}
        </Select>
      </Field>

      <p className="text-xs text-muted-foreground">
        {isPer100Unit(unit)
          ? `Nutrition per 100 ${unit.trim().toLowerCase()} — as printed on the label. We scale it to your serving size when logging.`
          : "Nutrition per serving:"}
      </p>
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

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : editing ? "Save changes" : "Save food"}
      </Button>
    </form>
  );
}
