/**
 * Pure parsing for the Withings Measure `getmeas` response — no network, no
 * server-only deps, so it's unit-testable (the network/OAuth half lives in
 * withings.ts). Withings encodes each measure as an integer mantissa + a
 * power-of-ten exponent: real = value·10^unit (e.g. 111595·10^-3 = 111.595 kg).
 */

/** Measure `type` codes we request from getmeas (category=1, real measures). */
export const MEASURE_TYPES = {
  weight: 1,
  fatFreeMass: 5, // lean mass (kg)
  fatRatio: 6, // body-fat %
  fatMass: 8, // (kg) — derivable, requested for completeness/cross-check
  muscleMass: 76, // (kg)
  hydration: 77, // total body water (kg)
  boneMass: 88, // (kg)
} as const;

export type Measure = { value: number; type: number; unit: number };
export type MeasureGroup = {
  grpid: number;
  date: number; // epoch seconds (UTC)
  category: number;
  measures: Measure[];
};

/** A scale weigh-in folded to its real-valued fields (kg / %), keyed by local day. */
export type WithingsReading = {
  date: string; // YYYY-MM-DD in the account timezone
  at: number; // grp epoch seconds, for "latest in day wins"
  weightKg: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  boneMassKg: number | null;
  hydrationKg: number | null;
};

/** Convert an epoch-seconds instant to a YYYY-MM-DD calendar day in `tz`. */
function localDay(epochSeconds: number, tz: string): string {
  // en-CA renders as YYYY-MM-DD; timeZone anchors it to the account's locale day.
  return new Date(epochSeconds * 1000).toLocaleDateString("en-CA", { timeZone: tz });
}

const real = (m: Measure) => m.value * Math.pow(10, m.unit);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Reduce raw getmeas groups to the latest reading per local day, decoding each
 * measure (value·10^unit) into real kg/%. Pure (no network) so it's unit-tested.
 */
export function groupsToReadings(groups: MeasureGroup[], tz: string): WithingsReading[] {
  // Keep the latest group per day (a day can have several weigh-ins).
  const byDay = new Map<string, MeasureGroup>();
  for (const g of groups) {
    const day = localDay(g.date, tz);
    const cur = byDay.get(day);
    if (!cur || g.date > cur.date) byDay.set(day, g);
  }

  const pick = (g: MeasureGroup, type: number): number | null => {
    const m = g.measures.find((x) => x.type === type);
    return m ? round1(real(m)) : null;
  };

  const readings: WithingsReading[] = [];
  for (const [date, g] of byDay) {
    readings.push({
      date,
      at: g.date,
      weightKg: pick(g, MEASURE_TYPES.weight),
      bodyFatPct: pick(g, MEASURE_TYPES.fatRatio),
      leanMassKg: pick(g, MEASURE_TYPES.fatFreeMass),
      muscleMassKg: pick(g, MEASURE_TYPES.muscleMass),
      boneMassKg: pick(g, MEASURE_TYPES.boneMass),
      hydrationKg: pick(g, MEASURE_TYPES.hydration),
    });
  }
  readings.sort((a, b) => (a.date < b.date ? -1 : 1));
  return readings;
}
