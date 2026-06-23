"use client";

import * as React from "react";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import {
  HEALTH_STATUSES,
  HEALTH_STATUS_LABELS,
  HealthStatus,
} from "@/lib/constants";
import { setDayHealth } from "@/lib/day-actions";

const DOT: Record<HealthStatus, string> = {
  healthy: "bg-accent",
  unwell: "bg-warn",
  injured: "bg-danger",
  vacation: "bg-vacation",
};

export function DayHealthControl({
  date,
  status,
}: {
  date: string;
  status: HealthStatus;
}) {
  // Caller remounts via key={date}, so initial state stays correct per day.
  const [value, setValue] = React.useState<HealthStatus>(status);
  const [pending, start] = useTransition();

  function change(next: HealthStatus) {
    setValue(next);
    start(async () => {
      await setDayHealth(date, next);
    });
  }

  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-sm",
        pending && "opacity-60",
      )}
    >
      <span className={cn("h-2.5 w-2.5 rounded-full", DOT[value])} aria-hidden />
      <span className="text-muted-foreground">Feeling</span>
      <select
        value={value}
        onChange={(e) => change(e.target.value as HealthStatus)}
        disabled={pending}
        className="bg-transparent font-medium text-foreground focus-visible:outline-none"
        aria-label="Day health status"
      >
        {HEALTH_STATUSES.map((s) => (
          <option key={s} value={s}>
            {HEALTH_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
