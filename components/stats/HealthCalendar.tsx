"use client";

import * as React from "react";
import { Card } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { HEALTH_STATUS_LABELS, HealthStatus } from "@/lib/constants";
import { addDays } from "@/lib/date";

// Square colour per status. Healthy (the default) is a faint base square.
const CELL: Record<HealthStatus, string> = {
  healthy: "bg-muted",
  unwell: "bg-warn",
  injured: "bg-danger",
  vacation: "bg-vacation",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const WINDOW_WEEKS = 26; // ~6 months per page
const MAX_PAGE = 1; // we fetch ~1 year of data → two 6-month windows

/** 0 = Mon … 6 = Sun, for week alignment. */
function mondayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}
function mondayOf(iso: string): string {
  return addDays(iso, -mondayIndex(iso));
}
function monthYear(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-[3px] ${className}`} />
      {label}
    </span>
  );
}

type Cell = { date: string; status: HealthStatus } | null;

/** Paginated 6-month health heat-grid (newest window first, fits width — no scroll). */
export function HealthCalendar({
  statuses,
  end,
}: {
  statuses: Record<string, HealthStatus>;
  /** Today (ISO) from the server, so the newest window ends on today. */
  end: string;
}) {
  const [page, setPage] = React.useState(0); // 0 = most recent window

  const { weeks, monthCols, rangeLabel, unwell, injured, vacation } = React.useMemo(() => {
    const lastDay = addDays(end, -page * WINDOW_WEEKS * 7);
    const firstMonday = addDays(mondayOf(lastDay), -(WINDOW_WEEKS - 1) * 7);

    const weeks: Cell[][] = [];
    let unwell = 0;
    let injured = 0;
    let vacation = 0;
    for (let w = 0; w < WINDOW_WEEKS; w++) {
      const week: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(firstMonday, w * 7 + d);
        if (date > end) {
          week.push(null);
          continue;
        }
        const status = statuses[date] ?? "healthy";
        if (status === "unwell") unwell++;
        if (status === "injured") injured++;
        if (status === "vacation") vacation++;
        week.push({ date, status });
      }
      weeks.push(week);
    }

    // Month label per week column (shown when the column's Monday changes month).
    const monthCols = weeks.map((wk, i) => {
      const monday = addDays(firstMonday, i * 7);
      const m = Number(monday.slice(5, 7)) - 1;
      const prevM =
        i > 0 ? Number(addDays(firstMonday, (i - 1) * 7).slice(5, 7)) - 1 : -1;
      return m !== prevM ? MONTHS[m] : "";
    });

    return {
      weeks,
      monthCols,
      rangeLabel: `${monthYear(firstMonday)} – ${monthYear(lastDay)}`,
      unwell,
      injured,
      vacation,
    };
  }, [statuses, end, page]);

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">Health</h3>
        <span className="text-xs text-muted-foreground">
          {unwell} unwell · {injured} injured · {vacation} vacation
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{rangeLabel}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.min(MAX_PAGE, p + 1))}
            disabled={page >= MAX_PAGE}
            className="rounded-lg p-1 hover:bg-muted disabled:opacity-40"
            aria-label="Earlier 6 months"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page <= 0}
            className="rounded-lg p-1 hover:bg-muted disabled:opacity-40"
            aria-label="Later 6 months"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Month labels aligned to the week columns below. */}
      <div
        className="mt-3 grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${WINDOW_WEEKS}, minmax(0, 1fr))` }}
      >
        {monthCols.map((label, i) => (
          <span key={i} className="relative h-3">
            {label && (
              <span className="absolute left-0 top-0 whitespace-nowrap text-[10px] leading-3 text-muted-foreground">
                {label}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* 7 rows (Mon→Sun) × WINDOW_WEEKS columns, scaled to fit width. */}
      <div
        className="mt-1 grid gap-[3px]"
        style={{
          gridTemplateRows: "repeat(7, minmax(0, 1fr))",
          gridAutoFlow: "column",
          gridTemplateColumns: `repeat(${WINDOW_WEEKS}, minmax(0, 1fr))`,
        }}
      >
        {weeks.flatMap((week, wi) =>
          week.map((cell, di) =>
            cell ? (
              <span
                key={cell.date}
                title={`${cell.date} · ${HEALTH_STATUS_LABELS[cell.status]}`}
                className={`aspect-square rounded-[2px] ${CELL[cell.status]}`}
              />
            ) : (
              <span key={`b-${wi}-${di}`} className="aspect-square" />
            ),
          ),
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Swatch className={CELL.healthy} label="Healthy" />
        <Swatch className={CELL.unwell} label="Unwell" />
        <Swatch className={CELL.injured} label="Injured" />
        <Swatch className={CELL.vacation} label="Vacation" />
      </div>
    </Card>
  );
}
