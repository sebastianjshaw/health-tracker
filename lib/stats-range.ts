import { addDays } from "./date";

/** Shared time-range control for the Stats page. */
export type Range = "7d" | "30d" | "90d" | "1y" | "all";

export const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "1y", label: "1y" },
  { key: "all", label: "All" },
];

const RANGE_DAYS: Record<Range, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
  all: null,
};

export type Granularity = "day" | "week" | "month";

export function granularityFor(range: Range): Granularity {
  if (range === "7d" || range === "30d") return "day";
  if (range === "90d") return "week";
  return "month"; // 1y, all
}

/** Inclusive start date for a range ending at `end`; null for "all". */
export function cutoffFor(range: Range, end: string): string | null {
  const d = RANGE_DAYS[range];
  return d == null ? null : addDays(end, -(d - 1));
}

/** Keep rows on/after the cutoff (no-op when cutoff is null = "all"). */
export function withinRange<T extends { date: string }>(
  rows: T[],
  cutoff: string | null,
): T[] {
  return cutoff == null ? rows : rows.filter((r) => r.date >= cutoff);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

/** Which bucket a date falls in, for the given granularity. */
export function bucketKey(g: Granularity, date: string): string {
  if (g === "day") return date;
  if (g === "week") return mondayOf(date);
  return date.slice(0, 7); // month: YYYY-MM
}

export function bucketLabel(g: Granularity, key: string): string {
  if (g === "month") {
    const [y, m] = key.split("-");
    return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
  }
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

/** Ordered bucket keys spanning [start, end] inclusive. */
export function bucketKeysBetween(g: Granularity, start: string, end: string): string[] {
  const keys: string[] = [];
  if (g === "day") {
    for (let d = start; d <= end; d = addDays(d, 1)) keys.push(d);
    return keys;
  }
  if (g === "week") {
    const last = mondayOf(end);
    for (let m = mondayOf(start); m <= last; m = addDays(m, 7)) keys.push(m);
    return keys;
  }
  let y = Number(start.slice(0, 4));
  let mo = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  while (y < ey || (y === ey && mo <= em)) {
    keys.push(`${y}-${String(mo).padStart(2, "0")}`);
    if (++mo > 12) {
      mo = 1;
      y++;
    }
  }
  return keys;
}
