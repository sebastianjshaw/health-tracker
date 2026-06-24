import { PageHeader } from "@/components/PageHeader";
import { BodyForm } from "@/components/stats/BodyForm";
import { BodyHistory } from "@/components/stats/BodyHistory";
import { BodyInsights } from "@/components/measurements/BodyInsights";
import { ageFrom } from "@/lib/health";
import { latestBodyComposition } from "@/lib/metabolic-age";
import { monthlyAverages, yearlyAverages } from "@/lib/seasonal";
import { getProfile } from "@/lib/settings";
import { getBodyMetrics, getWeightSeries } from "@/lib/stats-data";

export default async function MeasurementsPage() {
  const [metrics, weights, profile] = await Promise.all([
    getBodyMetrics(),
    getWeightSeries(),
    getProfile(),
  ]);

  const bodyComp = latestBodyComposition(
    // metrics are newest-first already
    metrics.map((m) => ({
      date: m.date,
      weightKg: m.weightKg,
      bodyFatPct: m.bodyFatPct,
      leanMassKg: m.leanMassKg,
      muscleMassKg: m.muscleMassKg,
      boneMassKg: m.boneMassKg,
      hydrationKg: m.hydrationKg,
    })),
    { heightCm: profile.heightCm, sex: profile.sex },
  );
  const weighIns = weights.map((w) => ({ date: w.date, weight: w.weight }));

  return (
    <div className="space-y-4">
      <PageHeader title="Measurements" subtitle="Weight, body fat, waist, resting HR" />
      <BodyForm />
      <BodyInsights
        bodyComp={bodyComp}
        yearly={yearlyAverages(weighIns)}
        monthly={monthlyAverages(weighIns)}
        age={profile.dob ? ageFrom(profile.dob) : null}
      />
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">History</h3>
        <BodyHistory metrics={metrics} />
      </div>
    </div>
  );
}
