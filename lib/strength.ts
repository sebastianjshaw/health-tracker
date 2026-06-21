/**
 * Strength analytics from logged sets: estimated one-rep max, total tonnage, and
 * personal records. e1RM lets you compare a heavy triple against a light set of
 * ten on one scale; tonnage (Σ weight × reps) tracks total work done.
 */

export type LiftSet = {
  date: string;
  exercise: string;
  weightKg: number;
  reps: number | null;
};

/** Epley estimated 1RM. Reps ≤ 1 (or unknown) → the lifted weight itself, which
 * is a safe floor (a single is already ~a 1RM). Capped at 12 reps where the
 * formula starts to overestimate. */
export function estimated1RM(weightKg: number, reps: number | null): number {
  if (!reps || reps <= 1) return Math.round(weightKg);
  return Math.round(weightKg * (1 + Math.min(reps, 12) / 30));
}

export type LiftStat = {
  exercise: string;
  /** Best estimated 1RM ever, and when. */
  best1RM: number;
  bestDate: string;
  /** Most recent session's best estimated 1RM. */
  latest1RM: number;
  latestDate: string;
  /** Total tonnage (kg) across all logged sets with reps. */
  tonnageKg: number;
};

/** Per-exercise strength summary from raw sets. Sets without reps still
 * contribute their weight to e1RM (as a floor) but not to tonnage. */
export function liftStats(sets: LiftSet[]): LiftStat[] {
  const byExercise = new Map<string, LiftSet[]>();
  for (const s of sets) {
    (byExercise.get(s.exercise) ?? byExercise.set(s.exercise, []).get(s.exercise)!).push(s);
  }

  const out: LiftStat[] = [];
  for (const [exercise, exSets] of byExercise) {
    let best1RM = 0;
    let bestDate = "";
    let tonnageKg = 0;
    // latest = the chronologically newest date present
    const latestDate = exSets.reduce((d, s) => (s.date > d ? s.date : d), "");
    let latest1RM = 0;
    for (const s of exSets) {
      const e = estimated1RM(s.weightKg, s.reps);
      if (e > best1RM) {
        best1RM = e;
        bestDate = s.date;
      }
      if (s.date === latestDate) latest1RM = Math.max(latest1RM, e);
      if (s.reps && s.reps > 0) tonnageKg += s.weightKg * s.reps;
    }
    out.push({ exercise, best1RM, bestDate, latest1RM, latestDate, tonnageKg: Math.round(tonnageKg) });
  }
  return out.sort((a, b) => b.best1RM - a.best1RM);
}
