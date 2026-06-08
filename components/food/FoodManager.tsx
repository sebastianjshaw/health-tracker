"use client";

import * as React from "react";
import { useTransition } from "react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { ChevronLeft, ChevronRight, PlusIcon, TrashIcon } from "@/components/icons";
import { ManualFoodForm } from "./ManualFoodForm";
import {
  addRecurring,
  deleteFood,
  removeRecurringById,
} from "@/app/(main)/food/actions";
import {
  CATEGORIES,
  CATEGORY_LABELS,
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
  const [editFood, setEditFood] = React.useState<Food | null>(null);
  const [pending, start] = useTransition();

  function handleDelete(f: Food) {
    if (confirm(`Delete "${f.name}"?`)) {
      start(async () => deleteFood(f.id));
    }
  }

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
                  {MEAL_LABELS[r.meal]} · {SCHEDULE_LABELS[r.schedule]} · from{" "}
                  {r.startDate}
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
      <FoodLibrary
        foods={foods}
        pending={pending}
        onEdit={setEditFood}
        onSetDefault={setDefaultFor}
        onDelete={handleDelete}
      />

      <SetDefaultSheet
        food={defaultFor}
        onClose={() => setDefaultFor(null)}
        existing={recurring}
      />

      <Sheet
        open={!!editFood}
        onClose={() => setEditFood(null)}
        title={editFood ? `Edit ${editFood.name}` : ""}
      >
        {editFood && (
          <ManualFoodForm
            key={editFood.id}
            food={editFood}
            onSaved={() => setEditFood(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

const PAGE_SIZE = 30;

type SortKey = "recent" | "az";

// Friendlier labels for the stored `source` values.
const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  openfoodfacts: "Barcode",
  ai: "AI",
  mcp: "MCP",
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;
const createdMs = (f: Food) => (f.createdAt ? new Date(f.createdAt).getTime() : 0);

function FoodLibrary({
  foods,
  pending,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  foods: Food[];
  pending: boolean;
  onEdit: (f: Food) => void;
  onSetDefault: (f: Food) => void;
  onDelete: (f: Food) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [category, setCategory] = React.useState("all");
  const [source, setSource] = React.useState("all");
  const [page, setPage] = React.useState(1);

  // Source values actually present, for the filter dropdown.
  const sources = React.useMemo(
    () => [...new Set(foods.map((f) => f.source))].sort(),
    [foods],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = foods.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (source !== "all" && f.source !== source) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.brand ?? "").toLowerCase().includes(q)
      );
    });
    list.sort(
      sort === "az"
        ? (a, b) => a.name.localeCompare(b.name)
        : (a, b) => createdMs(b) - createdMs(a) || b.id - a.id,
    );
    return list;
  }, [foods, query, sort, category, source]);

  // Any change to the result set snaps back to the first page.
  const setFilter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Food library</h2>
        <span className="text-xs text-muted-foreground">{foods.length} items</span>
      </div>

      {foods.length > 0 && (
        <div className="mt-3 space-y-2">
          <Input
            type="search"
            inputMode="search"
            placeholder="Search by name or brand…"
            value={query}
            onChange={(e) => setFilter(setQuery)(e.target.value)}
            aria-label="Search food library"
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sort">
              <Select
                value={sort}
                onChange={(e) => setFilter(setSort)(e.target.value as SortKey)}
              >
                <option value="recent">Recently added</option>
                <option value="az">Name (A–Z)</option>
              </Select>
            </Field>
            <Field label="Type">
              <Select
                value={category}
                onChange={(e) => setFilter(setCategory)(e.target.value)}
              >
                <option value="all">All types</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            {sources.length > 1 && (
              <Field label="Source">
                <Select
                  value={source}
                  onChange={(e) => setFilter(setSource)(e.target.value)}
                >
                  <option value="all">All sources</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {sourceLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 divide-y divide-border">
        {foods.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No foods yet.</p>
        )}
        {foods.length > 0 && filtered.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No matching foods.</p>
        )}
        {visible.map((f) => (
          <div key={f.id} className="flex items-center gap-2 py-2.5">
            <button
              type="button"
              onClick={() => onEdit(f)}
              className="min-w-0 flex-1 text-left"
              aria-label={`Edit ${f.name}`}
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{f.name}</span>
                {f.source !== "manual" && <Badge>{sourceLabel(f.source)}</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {f.brand ? `${f.brand} · ` : ""}
                {Math.round(f.kcal)} kcal / {f.servingSize}
                {f.servingUnit} · P{Math.round(f.protein)} C{Math.round(f.carbs)} F
                {Math.round(f.fat)}
              </div>
            </button>
            <Button size="sm" variant="secondary" onClick={() => onSetDefault(f)}>
              Default
            </Button>
            <button
              onClick={() => onDelete(f)}
              disabled={pending}
              className="p-1.5 text-muted-foreground hover:text-danger"
              aria-label={`Delete ${f.name}`}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="tabular-nums">
              {safePage} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={safePage >= pageCount}
              className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
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
