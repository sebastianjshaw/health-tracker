import { desc } from "drizzle-orm";
import { db } from "@/db";
import { bodyMetrics } from "@/db/schema";
import { PageHeader } from "@/components/PageHeader";
import { Connections } from "@/components/settings/Connections";
import {
  getCursor as googleCursor,
  isConfigured as googleConfigured,
  isConnected as googleConnected,
} from "@/lib/integrations/google-health";
import {
  isConfigured as withingsConfigured,
  isConnected as withingsConnected,
} from "@/lib/integrations/withings";

export default async function SettingsPage() {
  const [gConfigured, gConnected, gLastSync, wConfigured, wConnected, latestBody] = await Promise.all([
    Promise.resolve(googleConfigured()),
    googleConnected(),
    googleCursor(),
    Promise.resolve(withingsConfigured()),
    withingsConnected(),
    // Withings' cursor is an epoch; show its freshness as the latest body date.
    db.select({ date: bodyMetrics.date }).from(bodyMetrics).orderBy(desc(bodyMetrics.date)).limit(1).get(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="App preferences" />
      <Connections
        google={{ configured: gConfigured, connected: gConnected, lastSync: gLastSync }}
        withings={{
          configured: wConfigured,
          connected: wConnected,
          lastSync: latestBody?.date ?? null,
        }}
      />
    </div>
  );
}
