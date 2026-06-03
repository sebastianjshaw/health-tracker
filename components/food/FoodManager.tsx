"use client";

import * as React from "react";
import { useTransition } from "react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { ManualFoodForm } from "./ManualFoodForm";
import {
  addRecurring,
  deleteFood,
  removeRecurringById,
} from "@/app/(main)/food/actions";
import {
  MEALS,
  MEAL_LABELS,
  Meal,
  SCHEDULES,
  SCHEDULE_LABELS,
  Schedule,
} from "@/lib/constants";
import type { Food } from "@/db/schema";
import type { RecurringWithFood } from "@/lib/food-data";

export function FoodManager({
  foods,
  recurring,
}: {
  foods: Food[];
  recurring: RecurringWithFood[];
}) {
  const [showAdd, setShowAdd] = React.useState(foods.length === 0);
  const [defaultFor, setDefaultFor] = React.useState<Food | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      {/* Add food */}
      <Card className="p-4">
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex w-full items-center justify-between font-semibold"
        >
          <span>Add a food</span>
          <span className="text-muted-foreground">{showAdd ? "–" : "+"}</span>
        </button>
        {showAdd && (
          <div className="mt-4">
            <ManualFoodForm onSaved={() => setShowAdd(false)} />
          </div>
        )}
      </Card>

      {/* Recurring defaults */}
      <Card className="p-4">
        <h2 className="font-semibold">Recurring defaults</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          These appear automatically on matching days and can be removed per day.
        </p>
        <div className="mt-3 space-y-2">
          {recurring.length === 0 && (
            <p className="text-sm text-muted-foreground">
              None yet. Tap “Default” on any food below.
            </p>
          )}
          {recurring.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {MEAL_LABELS[r.meal]} · {SCHEDULE_LABELS[r.schedule]}
                </div>
              </div>
              <button
                onClick={() => start(async () => removeRecurringById(r.id))}
                disabled={pending}
                className="p-1.5 text-muted-foreground hover:text-danger"
                aria-label="Remove default"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Library */}
      <Card className="p-4">
        <h2 className="font-semibold">Food library</h2>
        <div className="mt-3 divide-y divide-border">
          {foods.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">No foods yet.</p>
          )}
          {foods.map((f) => (
            <div key={f.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{f.name}</span>
                  {f.source !== "manual" && <Badge>{f.source}</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {f.brand ? `${f.brand} · ` : ""}
                  {Math.round(f.kcal)} kcal / {f.servingSize}
                  {f.servingUnit} · P{Math.round(f.protein)} C{Math.round(f.carbs)} F
                  {Math.round(f.fat)}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setDefaultFor(f)}>
                Default
              </Button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${f.name}"?`)) {
                    start(async () => deleteFood(f.id));
                  }
                }}
                disabled={pending}
                className="p-1.5 text-muted-foreground hover:text-danger"
                aria-label={`Delete ${f.name}`}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <SetDefaultSheet
        food={defaultFor}
        onClose={() => setDefaultFor(null)}
        existing={recurring}
      />
    </div>
  );
}

function SetDefaultSheet({
  food,
  onClose,
  existing,
}: {
  food: Food | null;
  onClose: () => void;
  existing: RecurringWithFood[];
}) {
  const [meal, setMeal] = React.useState<Meal>("breakfast");
  const [schedule, setSchedule] = React.useState<Schedule>("everyday");
  const [qty, setQty] = React.useState("1");
  const [pending, start] = useTransition();

  const already =
    food &&
    existing.some(
      (r) => r.foodId === food.id && r.meal === meal && r.schedule === schedule,
    );

  function submit() {
    if (!food) return;
    start(async () => {
      await addRecurring(food.id, meal, schedule, Number(qty) || 1);
      onClose();
    });
  }

  return (
    <Sheet
      open={!!food}
      onClose={onClose}
      title={food ? `Default: ${food.name}` : ""}
    >
      <div className="space-y-3">
        <Field label="Meal">
          <Select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="When">
          <Select
            value={schedule}
            onChange={(e) => setSchedule(e.target.value as Schedule)}
          >
            {SCHEDULES.map((s) => (
              <option key={s} value={s}>
                {SCHEDULE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity (servings)">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </Field>

        {already && (
          <p className="text-sm text-warn">This default already exists.</p>
        )}

        <Button
          className="w-full"
          onClick={submit}
          disabled={pending || !!already}
        >
          <PlusIcon className="h-4 w-4" /> Add default
        </Button>
      </div>
    </Sheet>
  );
}
