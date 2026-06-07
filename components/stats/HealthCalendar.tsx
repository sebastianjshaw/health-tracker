import { Card } from "@/components/ui";
import { HEALTH_STATUS_LABELS, HealthStatus } from "@/lib/constants";
import { addDays, todayISO } from "@/lib/date";

// Square colour per status. Healthy (the default) is a faint base square.
const CELL: Record<HealthStatus, string> = {
  healthy: "bg-muted",
  unwell: "bg-warn",
  injured: "bg-danger",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 0 = Mon … 6 = Sun, for week alignment. */
function mondayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-[3px] ${className}`} />
      {label}
    </span>
  );
}

/** Past-year heat-strip of daily health status (one square per day). */
export function HealthCalendar({ statuses }: { statuses: Record<string, HealthStatus> }) {
  const end = todayISO();
  const rangeStart = addDays(end, -363);
  const start = addDays(rangeStart, -mondayIndex(rangeStart)); // back up to a Monday

  // Build week columns (Mon→Sun) up to today; pad the final week with blanks.
  const weeks: ({ date: string; status: HealthStatus } | null)[][] = [];
  let cursor = start;
  while (cursor <= end) {
    const week: ({ date: string; status: HealthStatus } | null)[] = [];
    for (let i = 0; i < 7; i++) {
      if (cursor <= end) {
        week.push({ date: cursor, status: statuses[cursor] ?? "healthy" });
        cursor = addDays(cursor, 1);
      } else {
        week.push(null);
      }
    }
    weeks.push(week);
  }

  const unwell = Object.values(statuses).filter((s) => s === "unwell").length;
  const injured = Object.values(statuses).filter((s) => s === "injured").length;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">Health (past year)</h3>
        <span className="text-xs text-muted-foreground">
          {unwell} unwell · {injured} injured
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          {/* Month labels aligned to week columns */}
          <div className="flex gap-[3px] pl-0">
            {weeks.map((w, i) => {
              const first = w.find(Boolean);
              const month = first ? Number(first.date.slice(5, 7)) - 1 : -1;
              const prev = i > 0 ? weeks[i - 1].find(Boolean) : null;
              const prevMonth = prev ? Number(prev.date.slice(5, 7)) - 1 : -1;
              const show = month >= 0 && month !== prevMonth;
              return (
                <span key={i} className="relative h-3 w-3">
                  {show && (
                    <span className="absolute left-0 top-0 text-[10px] leading-3 text-muted-foreground">
                      {MONTHS[month]}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          <div className="flex gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((cell, di) =>
                  cell ? (
                    <span
                      key={cell.date}
                      title={`${cell.date} · ${HEALTH_STATUS_LABELS[cell.status]}`}
                      className={`h-3 w-3 rounded-[3px] ${CELL[cell.status]}`}
                    />
                  ) : (
                    <span key={`b-${wi}-${di}`} className="h-3 w-3" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Swatch className={CELL.healthy} label="Healthy" />
        <Swatch className={CELL.unwell} label="Unwell" />
        <Swatch className={CELL.injured} label="Injured" />
      </div>
    </Card>
  );
}
