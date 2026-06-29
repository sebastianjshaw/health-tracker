import Link from "next/link";
import { Card } from "@/components/ui";
import { MED_DRUG_LABELS, type MedDrug } from "@/lib/constants";
import type { NextDoseInfo } from "@/lib/medication-data";

/** Compact "next dose due" reminder for the Today page; links to /medication. */
export function MedicationCard({ next }: { next: NextDoseInfo }) {
  const { status, days, last } = next;
  const headline =
    status === "due-today"
      ? "💉 Injection due today"
      : status === "overdue"
        ? `💉 Injection overdue by ${-days} day${days === -1 ? "" : "s"}`
        : `💉 Next injection in ${days} day${days === 1 ? "" : "s"}`;
  const tone =
    status === "overdue" ? "text-danger" : status === "due-today" ? "text-accent" : "text-foreground";
  const drug = last ? (MED_DRUG_LABELS[last.drug as MedDrug] ?? last.drug) : null;

  return (
    <Link href="/medication" className="block">
      <Card className="flex items-center justify-between gap-3 p-4 transition hover:bg-muted/40">
        <div className="min-w-0">
          <p className={`font-medium ${tone}`}>{headline}</p>
          {last && (
            <p className="truncate text-xs text-muted-foreground">
              Last: {drug}
              {last.doseMg != null ? ` ${last.doseMg} mg` : ""} · {last.date}
            </p>
          )}
        </div>
        <span className="shrink-0 text-sm text-accent">Log / check-in →</span>
      </Card>
    </Link>
  );
}
