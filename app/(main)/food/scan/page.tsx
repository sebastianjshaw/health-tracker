"use client";

import * as React from "react";
import { Suspense, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BarcodeScanner } from "@/components/barcode/BarcodeScanner";
import { ManualFoodForm } from "@/components/food/ManualFoodForm";
import { Button, Card, Field, Input } from "@/components/ui";
import { MEAL_LABELS, MEALS, Meal } from "@/lib/constants";
import { isValidISO, todayISO } from "@/lib/date";
import { addLogEntry } from "@/lib/log-actions";
import { upsertScannedFood, type ScannedFoodInput } from "@/app/(main)/food/actions";

type LookupResult =
  | { found: true; inLibraryId?: number; product: ScannedFoodInput }
  | { found: false; barcode: string };

function ScanInner() {
  const params = useSearchParams();
  const router = useRouter();

  const mealParam = params.get("meal");
  const meal: Meal = MEALS.includes(mealParam as Meal) ? (mealParam as Meal) : "snacks";
  const dParam = params.get("d");
  const date = dParam && isValidISO(dParam) ? dParam : todayISO();

  const [status, setStatus] = React.useState<"scanning" | "looking" | "done">("scanning");
  const [result, setResult] = React.useState<LookupResult | null>(null);
  const [manualCode, setManualCode] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const [pending, start] = useTransition();

  const lookup = React.useCallback(async (code: string) => {
    setStatus("looking");
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`);
      if (res.ok) {
        setResult((await res.json()) as LookupResult);
      } else if (res.status === 404) {
        setResult({ found: false, barcode: code });
      } else {
        setResult({ found: false, barcode: code });
      }
    } catch {
      setResult({ found: false, barcode: code });
    }
    setStatus("done");
  }, []);

  function backToDay() {
    router.push(date === todayISO() ? "/" : `/?d=${date}`);
  }

  function addToDay() {
    if (!result || !result.found) return;
    const product = result.product;
    const inLibraryId = result.inLibraryId;
    start(async () => {
      const foodId = inLibraryId ?? (await upsertScannedFood(product));
      await addLogEntry(date, meal, foodId, Number(qty) || 1);
      backToDay();
    });
  }

  function rescan() {
    setResult(null);
    setStatus("scanning");
  }

  return (
    <>
      <PageHeader
        title="Scan barcode"
        subtitle={`Add to ${MEAL_LABELS[meal]}`}
        action={
          <button onClick={backToDay} className="text-sm text-muted-foreground">
            Cancel
          </button>
        }
      />

      {status === "scanning" && (
        <div className="space-y-4">
          <BarcodeScanner active onDetected={lookup} />
          <Card className="p-4">
            <Field label="Or enter barcode manually">
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 7310865004703"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                />
                <Button onClick={() => manualCode && lookup(manualCode)}>Look up</Button>
              </div>
            </Field>
          </Card>
        </div>
      )}

      {status === "looking" && (
        <p className="py-10 text-center text-sm text-muted-foreground">Looking up…</p>
      )}

      {status === "done" && result?.found && (
        <Card className="space-y-3 p-4">
          <div>
            <div className="text-lg font-semibold">{result.product.name}</div>
            <div className="text-sm text-muted-foreground">
              {result.product.brand ? `${result.product.brand} · ` : ""}
              {Math.round(result.product.kcal)} kcal / {result.product.servingSize}
              {result.product.servingUnit} · P{Math.round(result.product.protein)} C
              {Math.round(result.product.carbs)} F{Math.round(result.product.fat)}
            </div>
            {result.inLibraryId && (
              <p className="mt-1 text-xs text-accent">Already in your library</p>
            )}
          </div>
          <Field label={`Quantity (× ${result.product.servingSize}${result.product.servingUnit})`}>
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={rescan}>
              Scan again
            </Button>
            <Button onClick={addToDay} disabled={pending}>
              {pending ? "Adding…" : `Add to ${MEAL_LABELS[meal]}`}
            </Button>
          </div>
        </Card>
      )}

      {status === "done" && result && !result.found && (
        <div className="space-y-4">
          <Card className="p-4">
            <p className="text-sm">
              No product found for <span className="font-mono">{result.barcode}</span>.
              Add it manually below — it’ll be saved with this barcode for next time.
            </p>
          </Card>
          <Card className="p-4">
            <ManualFoodForm
              defaults={{ barcode: result.barcode, source: "manual" }}
              onSaved={backToDay}
            />
          </Card>
          <Button variant="outline" className="w-full" onClick={rescan}>
            Scan again
          </Button>
        </div>
      )}
    </>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}>
      <ScanInner />
    </Suspense>
  );
}
