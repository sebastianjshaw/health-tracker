import { PageHeader } from "@/components/PageHeader";
import { BodyForm } from "@/components/stats/BodyForm";
import { BodyHistory } from "@/components/stats/BodyHistory";
import { getBodyMetrics } from "@/lib/stats-data";

export default async function MeasurementsPage() {
  const metrics = await getBodyMetrics();

  return (
    <div className="space-y-4">
      <PageHeader title="Measurements" subtitle="Weight, body fat, waist, resting HR" />
      <BodyForm />
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">History</h3>
        <BodyHistory metrics={metrics} />
      </div>
    </div>
  );
}
