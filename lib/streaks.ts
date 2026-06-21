import { addDays } from "./date";

/**
 * Consistency metrics from a daily true/false signal (e.g. "logged food",
 * "hit the calorie target"). A current streak is the run of consecutive days up
 * to today — or yesterday, since today may simply not be logged yet — that hold.
 */

export type DayFlag = { date: string; value: boolean };

/** Run of consecutive true days ending at `today` (falling back to `today-1` so
 * an as-yet-unlogged today doesn't break the streak). */
export function currentStreak(days: DayFlag[], today: string): number {
  const flag = new Map(days.map((d) => [d.date, d.value]));
  const start = flag.get(today) ? today : addDays(today, -1);
  let streak = 0;
  for (let d = start; flag.get(d); d = addDays(d, -1)) streak++;
  return streak;
}

/** Longest run of consecutive true days anywhere in the series. */
export function longestStreak(days: DayFlag[]): number {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let best = 0;
  let run = 0;
  let prevDate: string | null = null;
  for (const d of sorted) {
    if (!d.value) {
      run = 0;
    } else if (prevDate != null && addDays(prevDate, 1) === d.date && run > 0) {
      run += 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prevDate = d.date;
  }
  return best;
}
