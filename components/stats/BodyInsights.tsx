import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { trimNum } from "@/lib/format";
import type { BodyComposition } from "@/lib/metabolic-age";
import type { MonthlyAverage, YearlyAverage } from "@/lib/seasonal";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Card-styled native disclosure — closed by default, no client JS. The marker
 * is hidden and replaced with a rotating chevron driven by [open]. */
function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
        {title}
        <span className="transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
      </summary>
      <div className="px-4 pb-3">{children}</div>
    </details>
  );
}

/** Compact CSS bars of mean weight per calendar month (no chart lib needed). */
function SeasonalBars({ months }: { months: MonthlyAverage[] }) {
  const avgs = months.map((m) => m.avgWeight);
  const lo = Math.min(...avgs);
  const hi = Math.max(...avgs);
  const span = hi - lo || 1;
  return (
    <div className="space-y-1">
      {months.map((m) => (
        <div key={m.label} className="flex items-center gap-2 text-xs">
          <span className="w-8 shrink-0 text-muted-foreground">{m.label}</span>
          <div className="h-2.5 flex-1 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${20 + ((m.avgWeight - lo) / span) * 80}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums">{trimNum(m.avgWeight)}</span>
        </div>
      ))}
    </div>
  );
}

/** Derived body-composition summary + long-horizon weight views for the
 * Measurements page (the natural home — it's all about body metrics). */
export function BodyInsights({
  bodyComp,
  yearly,
  monthly,
  age,
}: {
  bodyComp: BodyComposition | null;
  yearly: YearlyAverage[];
  monthly: MonthlyAverage[];
  age: number | null;
}) {
  return (
    <div className="space-y-4">
      {bodyComp && (
        <Card className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          <Tile
            label="Lean mass"
            value={`${trimNum(bodyComp.leanMassKg)} kg`}
            sub={bodyComp.measured ? "scale-measured" : "estimated"}
          />
          {bodyComp.fatMassKg != null && (
            <Tile label="Fat mass" value={`${trimNum(bodyComp.fatMassKg)} kg`} />
          )}
          {bodyComp.muscleMassKg != null && (
            <Tile label="Muscle mass" value={`${trimNum(bodyComp.muscleMassKg)} kg`} />
          )}
          {bodyComp.boneMassKg != null && (
            <Tile label="Bone mass" value={`${trimNum(bodyComp.boneMassKg)} kg`} />
          )}
          {bodyComp.hydrationKg != null && (
            <Tile
              label="Hydration"
              value={`${trimNum(bodyComp.hydrationKg)} kg`}
              sub={
                bodyComp.weightKg != null
                  ? `${Math.round((bodyComp.hydrationKg / bodyComp.weightKg) * 100)}% of mass`
                  : "total body water"
              }
            />
          )}
          {bodyComp.ffmi != null && (
            <Tile label="FFMI" value={`${trimNum(bodyComp.ffmi)}`} sub="lean ÷ height²" />
          )}
          {bodyComp.metabolicAge != null && (
            <Tile
              label="Metabolic age"
              value={`${bodyComp.metabolicAge} yr`}
              sub={age != null ? `vs ${age} actual` : "estimated"}
            />
          )}
        </Card>
      )}

      {yearly.length > 1 && (
        <Collapsible title="Weight by year">
          <div className="-mx-4 divide-y divide-border border-t border-border">
            {yearly.map((y) => (
              <div key={y.year} className="flex items-baseline justify-between px-4 py-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{y.year}</span>
                <span className="tabular-nums">
                  <span className="font-medium">{trimNum(y.avgWeight)} kg</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {trimNum(y.min)}–{trimNum(y.max)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {monthly.length >= 6 && (
        <Collapsible title="Weight by month (seasonality)">
          <SeasonalBars months={monthly} />
        </Collapsible>
      )}
    </div>
  );
}
