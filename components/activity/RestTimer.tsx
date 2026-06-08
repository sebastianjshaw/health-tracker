"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

const PRESETS = [60, 90, 180]; // seconds

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Between-sets rest countdown. Timestamp-based so it stays accurate if the
 * screen sleeps; buzzes (vibration) when it reaches zero. */
export function RestTimer() {
  const [endsAt, setEndsAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => {
      if (Date.now() >= endsAt) {
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          /* no haptics */
        }
        setEndsAt(null);
      } else {
        setNow(Date.now());
      }
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const left = endsAt == null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));

  function start(secs: number) {
    // Read the clock inside updaters (the purity lint disallows it in the
    // handler body, but allows it here — same place +30s reads it).
    setNow(() => Date.now());
    setEndsAt(() => Date.now() + secs * 1000);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
      {left == null ? (
        <>
          <span className="text-sm font-medium text-muted-foreground">Rest</span>
          <div className="ml-auto flex gap-1.5">
            {PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => start(s)}
                aria-label={`Rest ${fmt(s)}`}
                className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-muted"
              >
                {fmt(s)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <span
            className={cn(
              "min-w-[3.25rem] text-lg font-semibold tabular-nums",
              left <= 10 ? "text-warn" : "text-accent",
            )}
            aria-live="polite"
          >
            {fmt(left)}
          </span>
          <div className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={() => setEndsAt((e) => (e ?? Date.now()) + 30_000)}
              aria-label="Add 30 seconds"
              className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-muted"
            >
              +30s
            </button>
            <button
              type="button"
              onClick={() => setEndsAt(null)}
              aria-label="Stop rest timer"
              className="rounded-lg border border-border px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted"
            >
              Stop
            </button>
          </div>
        </>
      )}
    </div>
  );
}
