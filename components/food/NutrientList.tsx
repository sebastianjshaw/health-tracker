"use client";

import { Input } from "@/components/ui";
import { PlusIcon, TrashIcon } from "@/components/icons";

export type Extra = { label: string; value: string; unit: string };

/** Editable list of arbitrary nutrients (vitamins, minerals…). Controlled. */
export function NutrientList({
  value,
  onChange,
}: {
  value: Extra[];
  onChange: (next: Extra[]) => void;
}) {
  const update = (i: number, patch: Partial<Extra>) =>
    onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-muted-foreground">
        Other nutrients (vitamins, minerals…)
      </span>
      <div className="space-y-2">
        {value.map((ex, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nutrient name (e.g. Vitamin C)"
                value={ex.label}
                onChange={(e) => update(i, { label: e.target.value })}
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="shrink-0 p-1.5 text-muted-foreground hover:text-danger"
                aria-label="Remove nutrient"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="amount"
                inputMode="decimal"
                value={ex.value}
                onChange={(e) => update(i, { value: e.target.value })}
                className="min-w-0 flex-1"
              />
              <Input
                placeholder="unit"
                value={ex.unit}
                onChange={(e) => update(i, { unit: e.target.value })}
                className="w-24 shrink-0"
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...value, { label: "", value: "", unit: "" }])}
        className="mt-2 flex items-center gap-1 text-sm text-accent"
      >
        <PlusIcon className="h-4 w-4" /> Add nutrient
      </button>
    </div>
  );
}
