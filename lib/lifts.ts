import { EXERCISES, Exercise, REPS_PER_SET, SETS_FOR } from "./constants";

export const PROGRESSION_KG = 2.5;
export const DELOAD_FACTOR = 0.9; // -10% after 3 consecutive failures
export const DELOAD_AFTER_FAILS = 3;

export type ExerciseResult = {
  exercise: Exercise;
  // reps achieved per set, in order
  reps: number[];
};

/** An exercise "succeeds" when every set hit the target reps. */
export function exerciseSucceeded(ex: Exercise, reps: number[]): boolean {
  const expectedSets = SETS_FOR[ex];
  if (reps.length < expectedSets) return false;
  return reps.slice(0, expectedSets).every((r) => r >= REPS_PER_SET);
}

/** Round to the nearest loadable increment (2.5 kg). Never below the empty bar (20 kg). */
export function roundLoad(kg: number): number {
  return Math.max(20, Math.round(kg / PROGRESSION_KG) * PROGRESSION_KG);
}

/**
 * Given the current working weight, whether the last attempt succeeded, and the
 * count of consecutive prior failures, return the next target weight.
 */
export function nextWeight(
  current: number,
  succeeded: boolean,
  priorFails: number,
): { weight: number; deloaded: boolean } {
  if (succeeded) {
    return { weight: roundLoad(current + PROGRESSION_KG), deloaded: false };
  }
  // third consecutive failure -> deload
  if (priorFails + 1 >= DELOAD_AFTER_FAILS) {
    return { weight: roundLoad(current * DELOAD_FACTOR), deloaded: true };
  }
  return { weight: current, deloaded: false };
}

export const ALL_EXERCISES = EXERCISES;
