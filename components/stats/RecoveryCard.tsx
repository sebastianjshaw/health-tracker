import { Card, Stat, type StatTone } from "@/components/ui";
import { round1 } from "@/lib/format";
import type { RecoveryPoint } from "@/lib/stats-data";

type Dir = StatTone;

/** Average of a metric over the last `days` (from the newest record), or null. */
function recentAvg(rows: RecoveryPoint[], pick: (r: RecoveryPoint) => number | null, days: number): number | null {
  if (rows.length === 0) return null;
  const end = Date.parse(`${rows[rows.length - 1].date}T00:00:00Z`);
  const cutoff = end - (days - 1) * 86_400_000;
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v == null) continue;
    if (Date.parse(`${r.date}T00:00:00Z`) >= cutoff) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

const r1 = round1;

/** Recovery snapshot: HRV, SpO₂ and resting HR — each as the 7-day average vs a
 * 28-day baseline, so a dip/spike stands out (the classic illness/overtraining
 * signals). Reads the wearable feed (Fitbit → Google Health). */
export function RecoveryCard({ data }: { data: RecoveryPoint[] }) {
  const hrv7 = recentAvg(data, (r) => r.hrvMs, 7);
  const hrv28 = recentAvg(data, (r) => r.hrvMs, 28);
  const spo27 = recentAvg(data, (r) => r.spo2, 7);
  const rhr7 = recentAvg(data, (r) => r.restingBpm, 7);
  const rhr28 = recentAvg(data, (r) => r.restingBpm, 28);

  if (hrv7 == null && spo27 == null && rhr7 == null) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Recovery metrics (HRV, blood oxygen) appear here once a wearable syncs them.
      </Card>
    );
  }

  // HRV: higher = better recovered. RHR: lower = better. SpO₂: <95% worth noting.
  const hrvTone: Dir = hrv7 == null || hrv28 == null ? "none" : hrv7 >= hrv28 * 1.02 ? "good" : hrv7 <= hrv28 * 0.9 ? "bad" : "even";
  const rhrTone: Dir = rhr7 == null || rhr28 == null ? "none" : rhr7 <= rhr28 - 1 ? "good" : rhr7 >= rhr28 + 2 ? "bad" : "even";
  const spo2Tone: Dir = spo27 == null ? "none" : spo27 >= 95 ? "good" : spo27 >= 92 ? "even" : "bad";

  const delta = (a: number | null, b: number | null, unit: string) =>
    a != null && b != null ? `${a - b >= 0 ? "+" : ""}${r1(a - b)} ${unit} vs 28d` : "baseline forming";

  return (
    <Card className="grid grid-cols-3 gap-2 p-3">
      <Stat
        label="HRV (RMSSD)"
        value={hrv7 != null ? `${r1(hrv7)}` : "—"}
        unit="ms"
        sub={delta(hrv7, hrv28, "ms")}
        tone={hrvTone}
      />
      <Stat
        label="Blood oxygen"
        value={spo27 != null ? `${r1(spo27)}` : "—"}
        unit="%"
        sub={spo27 != null ? (spo27 >= 95 ? "normal" : "below 95%") : "no data"}
        tone={spo2Tone}
      />
      <Stat
        label="Resting HR"
        value={rhr7 != null ? `${Math.round(rhr7)}` : "—"}
        unit="bpm"
        sub={delta(rhr7, rhr28, "bpm")}
        tone={rhrTone}
      />
    </Card>
  );
}
