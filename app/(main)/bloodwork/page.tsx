import { PageHeader } from "@/components/PageHeader";
import { Bloodwork } from "@/components/stats/Bloodwork";
import { getBloodPanels } from "@/lib/blood-data";

export default async function BloodworkPage() {
  const panels = await getBloodPanels();

  return (
    <div className="space-y-4">
      <PageHeader title="Blood & lab results" subtitle="Dated panels with reference ranges" />
      <Bloodwork panels={panels} />
    </div>
  );
}
