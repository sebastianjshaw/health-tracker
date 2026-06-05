"use client";

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { Button, Input } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { addLogEntry } from "@/lib/log-actions";
import { searchFoods } from "@/lib/food-search-actions";
import type { Meal } from "@/lib/constants";
import { MEAL_LABELS } from "@/lib/constants";
import type { Food } from "@/db/schema";

export function AddFoodButton({ date, meal }: { date: string; meal: Meal }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [foods, setFoods] = React.useState<Food[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = useTransition();

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timer = setTimeout(
      () => {
        setLoading(true);
        searchFoods(q)
          .then((rows) => {
            if (!cancelled) setFoods(rows);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      q.trim() ? 200 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, q]);

  function add(foodId: number) {
    start(async () => {
      setError(null);
      const result = await addLogEntry(date, meal, foodId, 1);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setQ("");
      setFoods([]);
    });
  }

  function close() {
    setOpen(false);
    setQ("");
    setFoods([]);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <PlusIcon className="h-4 w-4" /> Add food
      </button>

      <Sheet open={open} onClose={close} title={`Add to ${MEAL_LABELS[meal]}`}>
        <Input
          placeholder="Search your foods…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />

        <div className="mt-3 space-y-0.5">
          {loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {!loading && foods.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {q.trim() ? "No matches." : "No foods yet."}{" "}
              <Link href="/food" className="text-accent">
                Add one →
              </Link>
            </p>
          )}
          {!loading &&
            foods.map((f) => (
              <button
                key={f.id}
                disabled={pending}
                onClick={() => add(f.id)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{f.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {f.brand ? `${f.brand} · ` : ""}
                    {Math.round(f.kcal)} kcal / {f.servingSize}
                    {f.servingUnit} · P{Math.round(f.protein)} C{Math.round(f.carbs)} F
                    {Math.round(f.fat)}
                  </span>
                </span>
                <PlusIcon className="h-5 w-5 shrink-0 text-accent" />
              </button>
            ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/food">
            <Button variant="outline" className="w-full">
              New food
            </Button>
          </Link>
          <Link href={`/food/scan?meal=${meal}&d=${date}`}>
            <Button variant="outline" className="w-full">
              Scan barcode
            </Button>
          </Link>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Sheet>
    </>
  );
}
