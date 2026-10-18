"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { DeleteButton } from "@/components/DeleteButton";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { trimNum } from "@/lib/format";
import { searchFoods } from "@/lib/food-search-actions";
import { createMeal, deleteMeal, updateMeal } from "@/lib/meal-actions";
import type { MealWithItems } from "@/lib/meal-data";
import type { Food } from "@/db/schema";

type DraftItem = {
  foodId: number;
  quantity: number;
  name: string;
  servingSize: number;
  servingUnit: string;
  kcal: number;
};

/** Food-page section to create, edit and delete saved meals (reusable sets of
 *  library foods). Adding a meal to a day happens from the Today page. */
export function MealManager({ meals }: { meals: MealWithItems[] }) {
  // `"new"` = create sheet; a meal = edit sheet; null = closed.
  const [editing, setEditing] = React.useState<MealWithItems | "new" | null>(null);
  const router = useRouter();

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Meals</h2>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1 text-sm font-medium text-accent"
        >
          <PlusIcon className="h-4 w-4" /> New meal
        </button>
      </div>

      {meals.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          No meals yet. Build one from your foods — e.g. a chili from mince, beans and tomatoes —
          then add it to any day in one tap.
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {meals.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-4 py-3">
              <button onClick={() => setEditing(m)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{m.name}</span>
                  <Badge className="shrink-0 bg-accent/15 text-accent">Meal</Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.items.length} item{m.items.length === 1 ? "" : "s"} · {m.totalKcal} kcal · P
                  {m.totalProtein}
                  {m.items.length ? ` · ${m.items.map((i) => i.name).join(", ")}` : ""}
                </div>
              </button>
              <DeleteButton
                onDelete={async () => {
                  await deleteMeal(m.id);
                  router.refresh();
                }}
                label="Delete meal"
              />
            </div>
          ))}
        </Card>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New meal" : "Edit meal"}
      >
        {editing != null && (
          <MealBuilder
            key={editing === "new" ? "new" : editing.id}
            meal={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function MealBuilder({ meal, onClose }: { meal: MealWithItems | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState(meal?.name ?? "");
  const [items, setItems] = React.useState<DraftItem[]>(
    meal?.items.map((i) => ({
      foodId: i.foodId,
      quantity: i.quantity,
      name: i.name,
      servingSize: i.servingSize,
      servingUnit: i.servingUnit,
      kcal: i.kcal,
    })) ?? [],
  );

  // Ingredient search.
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Food[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(
      () => {
        searchFoods(q).then((rows) => {
          if (!cancelled) setResults(rows);
        });
      },
      q.trim() ? 200 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const totalKcal = Math.round(items.reduce((s, i) => s + i.kcal * i.quantity, 0));

  function addFood(f: Food) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.foodId === f.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: Number((next[i].quantity + 1).toFixed(2)) };
        return next;
      }
      return [
        ...prev,
        {
          foodId: f.id,
          quantity: 1,
          name: f.name,
          servingSize: f.servingSize,
          servingUnit: f.servingUnit,
          kcal: f.kcal,
        },
      ];
    });
    setQ("");
  }

  function setQty(foodId: number, quantity: number) {
    const clean = Number(quantity.toFixed(2));
    if (!Number.isFinite(clean) || clean <= 0) return;
    setItems((prev) => prev.map((x) => (x.foodId === foodId ? { ...x, quantity: clean } : x)));
  }

  function removeItem(foodId: number) {
    setItems((prev) => prev.filter((x) => x.foodId !== foodId));
  }

  function save() {
    start(async () => {
      setError(null);
      const payload = items.map((i) => ({ foodId: i.foodId, quantity: i.quantity }));
      const r = meal
        ? await updateMeal(meal.id, name, payload)
        : await createMeal(name, payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Meal name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chili" />
      </Field>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ingredients {items.length > 0 && `· ${totalKcal} kcal`}
        </p>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-3 text-center text-sm text-muted-foreground">
            Add foods below to build the meal.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {items.map((i) => (
              <div key={i.foodId} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{i.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {trimNum(i.quantity)} × {i.servingSize}
                    {i.servingUnit} · {Math.round(i.kcal * i.quantity)} kcal
                  </div>
                </div>
                <div className="flex items-center rounded-lg border border-border text-sm">
                  <button
                    onClick={() => setQty(i.foodId, i.quantity - (i.quantity > 1 ? 1 : 0.5))}
                    className="px-2 py-1 text-muted-foreground hover:text-foreground"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-8 text-center tabular-nums">{trimNum(i.quantity)}</span>
                  <button
                    onClick={() => setQty(i.foodId, i.quantity + 1)}
                    className="px-2 py-1 text-muted-foreground hover:text-foreground"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => removeItem(i.foodId)}
                  className="p-1.5 text-muted-foreground hover:text-danger"
                  aria-label={`Remove ${i.name}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <Input
          placeholder="Search your foods to add…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {results.length > 0 && (
          <div className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
            {results.map((f) => (
              <button
                key={f.id}
                onClick={() => addFood(f)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {Math.round(f.kcal)} kcal / {f.servingSize}
                    {f.servingUnit} · P{Math.round(f.protein)} C{Math.round(f.carbs)} F
                    {Math.round(f.fat)}
                  </span>
                </span>
                <PlusIcon className="h-5 w-5 shrink-0 text-accent" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Button className="w-full" onClick={save} disabled={pending || !name.trim() || items.length === 0}>
        {pending ? "Saving…" : meal ? "Save changes" : "Create meal"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
