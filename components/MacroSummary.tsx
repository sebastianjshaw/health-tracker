import { Card } from "@/components/ui";
import type { Macros } from "@/lib/nutrition";

function pct(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, (value / target) * 100);
}

function MacroStat({
  label,
  grams,
  color,
}: {
  label: string;
  grams: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-semibold">{Math.round(grams)}g</div>
    </div>
  );
}

export function MacroSummary({
  totals,
  targets,
  adjustedKcal,
}: {
  totals: Macros;
  targets: { kcal: number; protein: number };
  /** Contingency-adjusted calories; falls back to raw logged when omitted. */
  adjustedKcal?: number;
}) {
  const shownKcal = Math.round(adjustedKcal ?? totals.kcal);
  const buffer = shownKcal - Math.round(totals.kcal);
  const kcalLeft = targets.kcal - shownKcal;

  return (
    <Card className="p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-semibold leading-none">
            {shownKcal}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / {targets.kcal} kcal
            </span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {kcalLeft >= 0
              ? `${kcalLeft} kcal left`
              : `${Math.abs(kcalLeft)} kcal over`}
            {buffer > 0 && (
              <span className="text-warn">
                {" "}
                · {Math.round(totals.kcal)} logged +{buffer} contingency
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <span style={{ color: "var(--protein)" }} className="font-medium">
            {Math.round(totals.protein)}
          </span>
          {" / "}
          {targets.protein}g protein
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct(shownKcal, targets.kcal)}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
        <MacroStat label="Protein" grams={totals.protein} color="var(--protein)" />
        <MacroStat label="Carbs" grams={totals.carbs} color="var(--carbs)" />
        <MacroStat label="Fat" grams={totals.fat} color="var(--fat)" />
      </div>
    </Card>
  );
}
