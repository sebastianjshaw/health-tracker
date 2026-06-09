import { PageHeader } from "@/components/PageHeader";
import { Connections } from "@/components/settings/Connections";
import { ContingencyEditor } from "@/components/stats/ContingencyEditor";
import { getContingency } from "@/lib/settings";
import { getCursor, isConfigured, isConnected } from "@/lib/integrations/google-health";

export default async function SettingsPage() {
  const [contingency, configured, connected, lastSync] = await Promise.all([
    getContingency(),
    Promise.resolve(isConfigured()),
    isConnected(),
    getCursor(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="App preferences" />
      <Connections configured={configured} connected={connected} lastSync={lastSync} />
      <ContingencyEditor contingency={contingency} />
    </div>
  );
}
