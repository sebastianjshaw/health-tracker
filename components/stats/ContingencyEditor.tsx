"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { Contingency } from "@/lib/constants";
import { saveContingency } from "@/lib/body-actions";

export function ContingencyEditor({ contingency }: { contingency: Contingency }) {
  const [open, setOpen] = React.useState(false);
  const [product, setProduct] = React.useState(String(contingency.product));
  const [estimated, setEstimated] = React.useState(String(contingency.estimated));
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveContingency({
        product: Number(product),
        estimated: Number(estimated),
      });
      setMsg(r.ok ? "Saved." : r.error);
    });
  }

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold">Calorie contingency</span>
        <span className="text-sm text-muted-foreground">
          {open ? "–" : `+${contingency.product}% / +${contingency.estimated}%`}
        </span>
      </button>

      {!open ? null : (
        <>
      <p className="mt-3 text-sm text-muted-foreground">
        Buffer added to logged calories by confidence — packaged/measured items stay
        exact, restaurant and eyeballed home meals get an uplift for under-reporting.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Restaurant / product (%)">
          <Input
            type="number"
            inputMode="numeric"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          />
        </Field>
        <Field label="Estimated home-cooked (%)">
          <Input
            type="number"
            inputMode="numeric"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
          />
        </Field>
      </div>
      {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
      <Button className="mt-3 w-full" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save contingency"}
      </Button>
        </>
      )}
    </Card>
  );
}
