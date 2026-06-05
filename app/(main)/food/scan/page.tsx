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
  const [servingSize, setServingSize] = React.useState("100");
  const [servingUnit, setServingUnit] = React.useState("g");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [pending, start] = useTransition();

  const lookup = React.useCallback(async (code: string) => {
    setStatus("looking");
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`);
      const data: LookupResult = res.ok
        ? ((await res.json()) as LookupResult)
        : { found: false, barcode: code };
      setResult(data);
      if (data.found) {
        setServingSize(String(data.product.servingSize));
        setServingUnit(data.product.servingUnit);
        setQty("1");
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
    const quantity = Number(qty) || 1;

    start(async () => {
      setAddError(null);
      let foodId: number;
      if (inLibraryId) {
        foodId = inLibraryId;
      } else {
        const newServing = Number(servingSize) || product.servingSize;
        const factor = product.servingSize > 0 ? newServing / product.servingSize : 1;
        const sc = (n: number | null | undefined) =>
          n == null ? null : Math.round(n * factor * 10) / 10;
        foodId = await upsertScannedFood({
          ...product,
          servingSize: newServing,
          servingUnit: servingUnit || product.servingUnit,
          kcal: sc(product.kcal) ?? 0,
          protein: sc(product.protein) ?? 0,
          carbs: sc(product.carbs) ?? 0,
          fat: sc(product.fat) ?? 0,
          fiber: sc(product.fiber),
          sugar: sc(product.sugar),
          saturatedFat: sc(product.saturatedFat),
          salt: sc(product.salt),
          sodium: sc(product.sodium),
        });
      }
      const logResult = await addLogEntry(date, meal, foodId, quantity);
      if (!logResult.ok) {
        setAddError(logResult.error);
        return;
      }
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

          {!result.inLibraryId && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Serving / portion size">
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={servingSize}
                  onChange={(e) => setServingSize(e.target.value)}
                />
              </Field>
              <Field label="Unit">
                <Input value={servingUnit} onChange={(e) => setServingUnit(e.target.value)} />
              </Field>
            </div>
          )}

          <Field
            label={`Quantity (× ${
              result.inLibraryId
                ? `${result.product.servingSize}${result.product.servingUnit}`
                : `${servingSize || result.product.servingSize}${servingUnit}`
            })`}
          >
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
          {addError && <p className="text-sm text-danger">{addError}</p>}
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
