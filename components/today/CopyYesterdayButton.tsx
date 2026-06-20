"use client";

import * as React from "react";
import { useTransition } from "react";
import { copyMealFromYesterday } from "@/lib/log-actions";
import type { Meal } from "@/lib/constants";

/** Re-logs yesterday's manually-added entries for this meal onto the day. */
export function CopyYesterdayButton({ date, meal }: { date: string; meal: Meal }) {
  const [pending, start] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function copy() {
    start(async () => {
      setError(null);
      const result = await copyMealFromYesterday(date, meal);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="mt-1.5 text-center">
      <button
        onClick={copy}
        disabled={pending}
        className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {pending ? "Copying…" : "Copy from yesterday"}
      </button>
      {error && <p className="mt-1 text-xs text-muted-foreground">{error}</p>}
    </div>
  );
}
