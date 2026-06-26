/**
 * Race / interval splits stored as JSON in cardio_sessions.splits, plus small
 * time/pace formatters shared by the activity UI.
 */
export type Split = {
  label: string;
  cumulativeSec: number;
  splitSec: number;
  paceSecPerKm: number | null;
  kmh: number | null;
};

export function parseSplits(json: string | null | undefined): Split[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json) as { rows?: Split[] };
    return Array.isArray(data?.rows) ? data.rows : [];
  } catch {
    return [];
  }
}

/** Seconds → "H:MM:SS" (or "M:SS" under an hour). */
export function formatClock(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Pace in sec/km → "M:SS" (per km). */
export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = String(Math.round(secPerKm % 60)).padStart(2, "0");
  return `${m}:${s}`;
}
