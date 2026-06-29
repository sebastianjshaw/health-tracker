"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import {
  INJECTION_SITES,
  INJECTION_SITE_LABELS,
  MED_DOSE_OPTIONS,
  MED_DRUGS,
  MED_DRUG_LABELS,
  type MedDrug,
} from "@/lib/constants";
import { logDose } from "@/lib/medication-actions";
import { nullableNum } from "@/lib/format";

export function MedDoseForm({ today, defaultDrug }: { today: string; defaultDrug?: MedDrug }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [drug, setDrug] = React.useState<MedDrug>(defaultDrug ?? "tirzepatide");
  const [pending, start] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setError(null);
      const r = await logDose({
        date: String(fd.get("date") ?? today),
        time: String(fd.get("time") ?? "").trim() || null,
        drug,
        doseMg: nullableNum(fd.get("doseMg")),
        site: String(fd.get("site") ?? "").trim() || null,
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      formRef.current?.reset();
      setDrug(defaultDrug ?? "tirzepatide");
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input name="date" type="date" defaultValue={today} max={today} />
        </Field>
        <Field label="Time (optional)">
          <Input name="time" type="time" />
        </Field>
        <Field label="Drug">
          <Select value={drug} onChange={(e) => setDrug(e.target.value as MedDrug)}>
            {MED_DRUGS.map((d) => (
              <option key={d} value={d}>
                {MED_DRUG_LABELS[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dose (mg)">
          <Input name="doseMg" type="number" step="any" inputMode="decimal" list="dose-options" />
          <datalist id="dose-options">
            {MED_DOSE_OPTIONS[drug].map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <Field label="Injection site">
          <Select name="site" defaultValue="">
            <option value="">—</option>
            {INJECTION_SITES.map((s) => (
              <option key={s} value={s}>
                {INJECTION_SITE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes">
          <Input name="notes" placeholder="optional" />
        </Field>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Log injection"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
