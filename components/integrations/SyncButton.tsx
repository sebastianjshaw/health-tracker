"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui";
import { SyncIcon } from "@/components/icons";
import { syncNow } from "@/lib/integrations/sync-actions";

/** Small icon button that pulls the latest Google Health data and refreshes. */
export function SyncButton({ variant }: { variant?: ButtonProps["variant"] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(true);

  function doSync() {
    setMsg(null);
    start(async () => {
      const r = await syncNow();
      setOk(r.ok);
      setMsg(r.ok ? (r.message ?? "Synced.") : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="icon"
        variant={variant}
        className="h-9 w-9"
        onClick={doSync}
        disabled={pending}
        aria-label="Sync Google Health"
        title="Sync Google Health"
      >
        <SyncIcon width={18} height={18} className={pending ? "animate-spin" : undefined} />
      </Button>
      {msg && (
        <span className={`text-xs ${ok ? "text-muted-foreground" : "text-danger"}`}>{msg}</span>
      )}
    </div>
  );
}
