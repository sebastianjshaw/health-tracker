import { ReportControls } from "@/components/report/ReportControls";
import { WeightChart } from "@/components/stats/charts-lazy";
import { markerStatus } from "@/lib/blood-data";
import { addDays, isValidISO, prettyDate, todayISO } from "@/lib/date";
import { trimNum } from "@/lib/format";
import { getReportData } from "@/lib/report-data";

const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  "": "—",
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-border pb-1 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function flag(status: "low" | "high" | "ok" | "unknown") {
  if (status === "high") return <span className="font-semibold text-danger"> (H)</span>;
  if (status === "low") return <span className="font-semibold text-warn"> (L)</span>;
  return null;
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const to = sp.to && isValidISO(sp.to) ? sp.to : todayISO();
  const from = sp.from && isValidISO(sp.from) ? sp.from : addDays(to, -29);

  const r = await getReportData(from, to);
  const { summary: s, vitals: v, nutrition: n, activity: a, profile: p } = r;

  return (
    <>
      <ReportControls from={from} to={to} />

      <article className="report-light mx-auto max-w-2xl rounded-2xl bg-card p-6 text-foreground shadow-sm print:rounded-none print:p-0 print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-border pb-3">
          <div>
            <h1 className="text-2xl font-bold">{p.name || "Health summary"}</h1>
            <div className="text-sm text-muted-foreground">
              {[
                r.age != null ? `${r.age} y` : null,
                p.sex ? SEX_LABEL[p.sex] : null,
                p.heightCm ? `${trimNum(p.heightCm)} cm` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Weight-loss program"}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>Period: {prettyDate(from)} – {prettyDate(to)}</div>
            <div>Generated {prettyDate(r.generatedOn)}</div>
          </div>
        </header>

        {/* Program summary */}
        <Section title="Program summary">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Baseline"
              value={s.baseline ? `${trimNum(s.baseline.weight)} kg` : "—"}
              sub={s.baseline ? prettyDate(s.baseline.date) : undefined}
            />
            <Stat
              label="Current"
              value={s.current ? `${trimNum(s.current.weight)} kg` : "—"}
              sub={s.current ? prettyDate(s.current.date) : undefined}
            />
            <Stat
              label="Change"
              value={
                s.changeKg != null
                  ? `${s.changeKg > 0 ? "+" : ""}${trimNum(s.changeKg)} kg`
                  : "—"
              }
              sub={
                s.changePct != null
                  ? `${s.changePct > 0 ? "+" : ""}${trimNum(s.changePct)}%${s.kgPerWeek != null ? ` · ${trimNum(s.kgPerWeek)} kg/wk` : ""}`
                  : undefined
              }
            />
            <Stat
              label="Goal"
              value={s.goalWeight != null ? `${trimNum(s.goalWeight)} kg` : "—"}
              sub={s.toGoalKg != null ? `${trimNum(Math.abs(s.toGoalKg))} kg to go` : undefined}
            />
            <Stat
              label="BMI (baseline)"
              value={s.baselineBmi != null ? `${trimNum(s.baselineBmi)}` : "—"}
              sub={s.baselineBmiClass || undefined}
            />
            <Stat
              label="BMI (current)"
              value={s.currentBmi != null ? `${trimNum(s.currentBmi)}` : "—"}
              sub={s.currentBmiClass || (p.heightCm ? undefined : "set height")}
            />
          </div>

          {r.weightSeries.length > 1 && (
            <div className="mt-3">
              <WeightChart data={r.weightSeries} goalWeight={s.goalWeight} />
            </div>
          )}
        </Section>

        {/* Anthropometrics & vitals */}
        <Section title="Anthropometrics & vitals">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-1.5 text-muted-foreground">Waist</td>
                <td className="py-1.5 text-right">
                  {v.latestWaist ? `${trimNum(v.latestWaist.value)} cm` : "—"}
                  {v.baselineWaist && v.latestWaist && v.baselineWaist.date !== v.latestWaist.date
                    ? ` (from ${trimNum(v.baselineWaist.value)} cm)`
                    : ""}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-muted-foreground">Body fat</td>
                <td className="py-1.5 text-right">
                  {v.latestBodyFat ? `${trimNum(v.latestBodyFat.value)} %` : "—"}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-muted-foreground">Resting heart rate</td>
                <td className="py-1.5 text-right">
                  {v.latestRestingHr ? `${v.latestRestingHr.value} bpm` : "—"}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-muted-foreground">Blood pressure</td>
                <td className="py-1.5 text-right">
                  {v.bp ? `${v.bp.systolic}/${v.bp.diastolic} mmHg (${prettyDate(v.bp.date)})` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* Bloodwork */}
        <Section title="Blood & lab results">
          {r.labs.panels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lab results recorded.</p>
          ) : (
            <>
              {r.labs.trends.length > 0 && (
                <table className="mb-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-1 font-medium">Marker (trend)</th>
                      <th className="py-1 text-right font-medium">First</th>
                      <th className="py-1 text-right font-medium">Latest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.labs.trends.map((t) => (
                      <tr key={t.marker}>
                        <td className="py-1.5">{t.marker}</td>
                        <td className="py-1.5 text-right text-muted-foreground">
                          {trimNum(t.first.value)} {t.unit}
                        </td>
                        <td className="py-1.5 text-right">
                          {trimNum(t.latest.value)} {t.unit}
                          {flag(t.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {r.labs.panels.map((panel) => (
                <div key={panel.date} className="mb-3 break-inside-avoid">
                  <div className="mb-1 flex items-center justify-between text-sm font-medium">
                    <span>{prettyDate(panel.date)}</span>
                    {panel.clinic && (
                      <span className="text-xs text-muted-foreground">{panel.clinic}</span>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {panel.markers.map((m) => {
                        const status = markerStatus(m);
                        const ref =
                          m.refLow != null || m.refHigh != null
                            ? `${m.refLow != null ? trimNum(m.refLow) : ""}–${m.refHigh != null ? trimNum(m.refHigh) : ""}`
                            : "";
                        return (
                          <tr key={m.id}>
                            <td className="py-1 text-muted-foreground">{m.marker}</td>
                            <td className="py-1 text-right">
                              {trimNum(m.value)} {m.unit}
                              {flag(status)}
                            </td>
                            <td className="w-24 py-1 text-right text-xs text-muted-foreground">
                              {ref ? `ref ${ref}` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </Section>

        {/* Nutrition */}
        <Section title="Nutrition (selected period)">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Avg calories"
              value={n.avgKcal != null ? `${n.avgKcal} kcal` : "—"}
              sub={`target ${n.targetKcal}`}
            />
            <Stat
              label="Avg protein"
              value={n.avgProtein != null ? `${n.avgProtein} g` : "—"}
              sub={`target ${n.targetProtein}`}
            />
            <Stat
              label="Days logged"
              value={`${n.daysLogged} / ${n.daysInRange}`}
              sub="in period"
            />
          </div>
        </Section>

        {/* Activity */}
        <Section title="Physical activity (selected period)">
          <p className="text-sm">
            <span className="font-medium">Cardio:</span> {a.cardio.total} session
            {a.cardio.total === 1 ? "" : "s"}
            {a.cardio.total > 0 ? ` (~${trimNum(a.cardio.perWeek)}/week)` : ""}
            {a.cardio.byType.length > 0 && (
              <>
                {" — "}
                {a.cardio.byType
                  .map(
                    (t) =>
                      `${t.count}× ${t.type}${t.totalKm > 0 ? ` ${trimNum(t.totalKm)} km` : ""}${t.totalMin > 0 ? ` ${t.totalMin} min` : ""}`,
                  )
                  .join(", ")}
              </>
            )}
          </p>
          {a.lifts.length > 0 && (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 font-medium">Lift</th>
                  <th className="py-1 text-right font-medium">Start</th>
                  <th className="py-1 text-right font-medium">Latest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {a.lifts.map((l) => (
                  <tr key={l.exercise}>
                    <td className="py-1.5">{l.label}</td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {trimNum(l.first)} kg
                    </td>
                    <td className="py-1.5 text-right">{trimNum(l.latest)} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Goals & plan */}
        <Section title="Goals & plan">
          <ul className="list-disc pl-5 text-sm">
            <li>Goal weight: {s.goalWeight != null ? `${trimNum(s.goalWeight)} kg` : "not set"}</li>
            <li>Daily targets: {n.targetKcal} kcal, {n.targetProtein} g protein</li>
            {p.medications && <li>Medications: {p.medications}</li>}
            {p.conditions && <li>Conditions / notes: {p.conditions}</li>}
          </ul>
        </Section>

        <footer className="mt-6 border-t border-border pt-2 text-xs text-muted-foreground">
          Self-reported data from the Health Tracker app. Nutrition and activity
          figures are user-entered estimates. Generated {prettyDate(r.generatedOn)}.
        </footer>
      </article>
    </>
  );
}
