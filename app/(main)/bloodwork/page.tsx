import { PageHeader } from "@/components/PageHeader";
import { Bloodwork } from "@/components/stats/Bloodwork";
import { getBloodPanels } from "@/lib/blood-data";
import { getWeightSeries } from "@/lib/stats-data";

export default async function BloodworkPage() {
  const [panels, weights] = await Promise.all([getBloodPanels(), getWeightSeries()]);
  const weight = weights.map((w) => ({ date: w.date, weight: w.weight }));

  return (
    <div className="space-y-4">
      <PageHeader title="Blood & lab results" subtitle="Dated panels with reference ranges" />
      <Bloodwork panels={panels} weight={weight} />
    </div>
  );
}
