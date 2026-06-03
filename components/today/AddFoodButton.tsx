"use client";

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { Button, Input } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { addLogEntry } from "@/lib/log-actions";
import type { Meal } from "@/lib/constants";
import { MEAL_LABELS } from "@/lib/constants";
import type { Food } from "@/db/schema";

export function AddFoodButton({
  date,
  meal,
  foods,
}: {
  date: string;
  meal: Meal;
  foods: Food[];
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [pending, start] = useTransition();

  const term = q.trim().toLowerCase();
  const filtered = term
    ? foods.filter((f) =>
        `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(term),
      )
    : foods;

  function add(foodId: number) {
    start(async () => {
      await addLogEntry(date, meal, foodId, 1);
      setOpen(false);
      setQ("");
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <PlusIcon className="h-4 w-4" /> Add food
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Add to ${MEAL_LABELS[meal]}`}>
        <Input
          placeholder="Search your foods…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />

        <div className="mt-3 space-y-0.5">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {foods.length === 0 ? "No foods yet." : "No matches."}{" "}
              <Link href="/food" className="text-accent">
                Add one →
              </Link>
            </p>
          )}
          {filtered.map((f) => (
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
      </Sheet>
    </>
  );
}
