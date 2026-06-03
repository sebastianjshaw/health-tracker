"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button, Card, Select, Textarea } from "@/components/ui";
import { SparkIcon } from "@/components/icons";
import { MEALS, MEAL_LABELS, Meal } from "@/lib/constants";
import { prettyDate, todayISO } from "@/lib/date";
import { addQuickEntry } from "@/lib/log-actions";

type ParsedItem = {
  name: string;
  meal: Meal;
  quantity: number;
  unit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  include: boolean;
};

const EXAMPLES = [
  "two boiled eggs and a slice of rye toast with butter",
  "chicken caesar salad and a flat white for lunch",
  "a banana and a handful of almonds",
];

export default function LogPage() {
  const router = useRouter();
  const date = todayISO();
  const [text, setText] = React.useState("");
  const [items, setItems] = React.useState<ParsedItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [adding, startAdding] = useTransition();

  async function parse() {
    setLoading(true);
    setError(null);
    setItems(null);
    try {
      const res = await fetch("/api/ai/parse-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      const parsed: ParsedItem[] = (data.items ?? []).map(
        (i: Omit<ParsedItem, "include">) => ({ ...i, include: true }),
      );
      if (parsed.length === 0) setError("No foods detected. Try adding more detail.");
      else setItems(parsed);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function update(i: number, patch: Partial<ParsedItem>) {
    setItems((prev) =>
      prev ? prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) : prev,
    );
  }

  function addAll() {
    if (!items) return;
    const chosen = items.filter((i) => i.include);
    startAdding(async () => {
      for (const i of chosen) {
        await addQuickEntry(date, i.meal, {
          name: i.name,
          quantity: 1,
          kcal: Math.round(i.kcal),
          protein: Math.round(i.protein),
          carbs: Math.round(i.carbs),
          fat: Math.round(i.fat),
          servingSize: i.quantity,
          servingUnit: i.unit,
          source: "ai",
        });
      }
      router.push("/");
    });
  }

  const chosenCount = items?.filter((i) => i.include).length ?? 0;

  return (
    <>
      <PageHeader title="Ask AI" subtitle={`Describe what you ate — ${prettyDate(date)}`} />

      <Card className="space-y-3 p-4">
        <Textarea
          rows={3}
          placeholder="e.g. two boiled eggs and a slice of rye toast"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
        <Button className="w-full" onClick={parse} disabled={loading || !text.trim()}>
          <SparkIcon className="h-4 w-4" />
          {loading ? "Thinking…" : "Parse with Claude"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Card>

      {items && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            Review and adjust, then add to your day:
          </p>
          {items.map((item, i) => (
            <Card
              key={i}
              className={`p-3 ${item.include ? "" : "opacity-50"}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={item.include}
                  onChange={(e) => update(i, { include: e.target.checked })}
                  className="mt-1 h-5 w-5 accent-[var(--accent)]"
                  aria-label={`Include ${item.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} · {Math.round(item.kcal)} kcal · P
                    {Math.round(item.protein)} C{Math.round(item.carbs)} F
                    {Math.round(item.fat)}
                  </div>
                </div>
                <Select
                  value={item.meal}
                  onChange={(e) => update(i, { meal: e.target.value as Meal })}
                  className="h-9 w-auto text-sm"
                >
                  {MEALS.map((m) => (
                    <option key={m} value={m}>
                      {MEAL_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </div>
            </Card>
          ))}

          <Button className="w-full" onClick={addAll} disabled={adding || chosenCount === 0}>
            {adding
              ? "Adding…"
              : `Add ${chosenCount} item${chosenCount === 1 ? "" : "s"} to today`}
          </Button>
        </div>
      )}
    </>
  );
}
