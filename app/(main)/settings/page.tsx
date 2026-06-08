import { PageHeader } from "@/components/PageHeader";
import { ContingencyEditor } from "@/components/stats/ContingencyEditor";
import { getContingency } from "@/lib/settings";

export default async function SettingsPage() {
  const contingency = await getContingency();

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="App preferences" />
      <ContingencyEditor contingency={contingency} />
    </div>
  );
}
