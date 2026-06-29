"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { TrashIcon } from "@/components/icons";
import { INJECTION_SITE_LABELS, MED_DRUG_LABELS, type InjectionSite, type MedDrug } from "@/lib/constants";
import { prettyDate, relativeLabel } from "@/lib/date";
import { deleteDose } from "@/lib/medication-actions";
import type { MedicationDose } from "@/db/schema";

function drugLabel(drug: string): string {
  return MED_DRUG_LABELS[drug as MedDrug] ?? drug;
}
function siteLabel(site: string | null): string | null {
  if (!site) return null;
  return INJECTION_SITE_LABELS[site as InjectionSite] ?? site;
}

export function MedDoseList({ doses }: { doses: MedicationDose[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (doses.length === 0) {
    return <EmptyState>No injections logged yet.</EmptyState>;
  }

  function remove(id: number) {
    start(async () => {
      await deleteDose(id);
      router.refresh();
    });
  }

  return (
    <ul className="space-y-2">
      {doses.map((d) => {
        const when = relativeLabel(d.date) ?? prettyDate(d.date);
        const site = siteLabel(d.site);
        return (
          <li key={d.id}>
            <Card className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {drugLabel(d.drug)}
                  {d.doseMg != null && <span className="text-accent"> · {d.doseMg} mg</span>}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {when}
                  {d.time ? ` (${d.time})` : ""}
                  {site ? ` · ${site}` : ""}
                  {d.notes ? ` · ${d.notes}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(d.id)}
                disabled={pending}
                aria-label="Delete injection"
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-danger disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
