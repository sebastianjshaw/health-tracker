import Link from "next/link";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { addDays, prettyDate, relativeLabel, todayISO } from "@/lib/date";

/** Server component: prev/next links that change the ?d= query param. */
export function DateNav({ date, basePath = "/" }: { date: string; basePath?: string }) {
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const rel = relativeLabel(date);
  const isToday = date === todayISO();

  const href = (d: string) => (d === todayISO() ? basePath : `${basePath}?d=${d}`);

  return (
    <div className="mb-4 flex items-center justify-between">
      <Link
        href={href(prev)}
        aria-label="Previous day"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>

      <div className="text-center">
        <div className="font-semibold leading-tight">{rel ?? prettyDate(date)}</div>
        {rel && <div className="text-xs text-muted-foreground">{prettyDate(date)}</div>}
        {!isToday && (
          <Link href={basePath} className="text-xs text-accent">
            Jump to today
          </Link>
        )}
      </div>

      <Link
        href={href(next)}
        aria-label="Next day"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
      >
        <ChevronRight className="h-5 w-5" />
      </Link>
    </div>
  );
}
