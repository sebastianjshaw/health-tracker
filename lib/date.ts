// All dates are handled as local YYYY-MM-DD strings to avoid timezone drift.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISO(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, delta: number): string {
  const d = parseISO(date);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export function isValidISO(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = parseISO(date);
  if (Number.isNaN(parsed.getTime())) return false;
  return toISODate(parsed) === date;
}

/** true for Saturday/Sunday. */
export function isWeekend(date: string): boolean {
  const day = parseISO(date).getDay();
  return day === 0 || day === 6;
}

/** Which recurring schedules apply on this date. */
export function schedulesFor(date: string): ("everyday" | "weekday" | "weekend")[] {
  return isWeekend(date) ? ["everyday", "weekend"] : ["everyday", "weekday"];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(date: string): string {
  const d = parseISO(date);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function relativeLabel(date: string): string | null {
  if (date === todayISO()) return "Today";
  if (date === addDays(todayISO(), -1)) return "Yesterday";
  if (date === addDays(todayISO(), 1)) return "Tomorrow";
  return null;
}

/**
 * "HH:MM" (24h) from an ISO datetime's wall-clock portion. Reads the recorded
 * time directly from the string rather than converting timezones, so it's
 * stable between server and client render. Null if there's no time part.
 */
export function timeOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : null;
}
