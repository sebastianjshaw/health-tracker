"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { ScaleIcon } from "@/components/icons";
import { logBody } from "@/lib/body-actions";

/** Small icon button on the weight chart that opens a weight-only quick log. */
export function LogWeightButton({
  date,
  current,
}: {
  date: string;
  current?: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function openModal() {
    setError(null);
    setValue(current != null ? String(current) : "");
    setOpen(true);
  }

  function save() {
    const kg = Number(value);
    if (value.trim() === "" || !Number.isFinite(kg) || kg <= 0) {
      setError("Enter a valid weight in kg.");
      return;
    }
    start(async () => {
      const r = await logBody({ date, weightKg: kg });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="icon"
        className="h-9 w-9"
        aria-label="Log weight"
        title="Log weight"
        onClick={openModal}
      >
        <ScaleIcon width={18} height={18} />
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Log weight">
        <div className="space-y-3">
          <Field label="Weight (kg)">
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button className="w-full" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save weight"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
