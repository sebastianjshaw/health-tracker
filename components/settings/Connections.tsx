"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { disconnectGoogle, disconnectWithings, syncNow } from "@/lib/integrations/sync-actions";

type ProviderState = {
  configured: boolean;
  connected: boolean;
  lastSync: string | null;
};

export function Connections({
  google,
  withings,
}: {
  google: ProviderState;
  withings: ProviderState;
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
  function doDisconnect(which: "google" | "withings") {
    start(async () => {
      await (which === "google" ? disconnectGoogle() : disconnectWithings());
      setMsg(null);
    });
  }

  const anyConnected = google.connected || withings.connected;

  return (
    <Card className="p-4">
      <h2 className="font-semibold">Connections</h2>

      <Provider
        name="Google Health"
        detail="Activities, sleep & resting heart rate"
        state={google}
        startHref="/api/integrations/google/start"
        connectLabel="Connect Google Health"
        notConfigured="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this."
        onDisconnect={() => doDisconnect("google")}
        pending={pending}
      />

      <Provider
        name="Withings"
        detail="Weight & body composition, straight from the scale"
        state={withings}
        startHref="/api/integrations/withings/start"
        connectLabel="Connect Withings"
        notConfigured="Set WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET to enable this."
        onDisconnect={() => doDisconnect("withings")}
        pending={pending}
      />

      {anyConnected && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button onClick={() => doSync(false)} disabled={pending} className="flex-1">
              {pending ? "Syncing…" : "Sync now"}
            </Button>
            <Button variant="outline" onClick={() => doSync(true)} disabled={pending}>
              Full resync
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sync pulls the recent window from each connected source; a full resync re-imports the
            entire history.
          </p>
        </>
      )}

      {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
    </Card>
  );
}

function Provider({
  name,
  detail,
  state,
  startHref,
  connectLabel,
  notConfigured,
  onDisconnect,
  pending,
}: {
  name: string;
  detail: string;
  state: ProviderState;
  startHref: string;
  connectLabel: string;
  notConfigured: string;
  onDisconnect: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-3 border-t border-border pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{name}</div>
          <div className="text-sm text-muted-foreground">
            {detail}
            {state.connected && <> · synced through {state.lastSync ?? "—"}</>}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            state.connected ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
          }`}
        >
          {state.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {!state.configured ? (
        <p className="mt-2 text-sm text-muted-foreground">{notConfigured}</p>
      ) : state.connected ? (
        <Button variant="outline" size="sm" onClick={onDisconnect} disabled={pending} className="mt-2">
          Disconnect
        </Button>
      ) : (
        <a href={startHref} className="mt-2 block">
          <Button className="w-full">{connectLabel}</Button>
        </a>
      )}
    </div>
  );
}
