"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { disconnectGoogle, syncNow } from "@/lib/integrations/sync-actions";

export function Connections({
  configured,
  connected,
  lastSync,
}: {
  configured: boolean;
  connected: boolean;
  lastSync: string | null;
}) {
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = useTransition();

  function doSync(full = false) {
    setMsg(full ? "Full resync running…" : null);
    start(async () => {
      const r = await syncNow(full);
      setMsg(r.ok ? (r.message ?? "Synced.") : r.error);
    });
  }
  function doDisconnect() {
    start(async () => {
      await disconnectGoogle();
      setMsg(null);
    });
  }

  return (
    <Card className="p-4">
      <h2 className="font-semibold">Connections</h2>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">Google Health</div>
          <div className="text-sm text-muted-foreground">
            Heart rate, activities &amp; sleep
            {connected && (
              <> · synced through {lastSync ?? "—"}</>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            connected ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {!configured ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this.
        </p>
      ) : connected ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => doSync(false)} disabled={pending} className="flex-1">
              {pending ? "Syncing…" : "Sync now"}
            </Button>
            <Button variant="outline" onClick={() => doSync(true)} disabled={pending}>
              Full resync
            </Button>
            <Button variant="outline" onClick={doDisconnect} disabled={pending}>
              Disconnect
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sync pulls the recent window; a full resync re-imports the entire history.
          </p>
        </>
      ) : (
        <a href="/api/integrations/google/start" className="mt-3 block">
          <Button className="w-full">Connect Google Health</Button>
        </a>
      )}

      {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
    </Card>
  );
}
