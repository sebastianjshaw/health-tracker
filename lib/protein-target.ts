import "server-only";
import { proteinForLeanMass, suggestedProtein } from "./health";
import { getProfile, getTargets, setTargets } from "./settings";
import { getWeightSeries } from "./stats-data";

/** Threshold (g) below which a recomputed suggestion isn't worth a new entry. */
const MIN_PROTEIN_MOVE = 5;

/**
 * Keep the protein target tracking body composition. Re-derives the lean-mass
 * protein suggestion and, if it has moved by ≥5 g from the current target,
 * appends a NEW effective-dated target (today, same calories). Because targets
 * are dated and adherence is judged via targetForDate, past days stay graded
 * against the entry in effect then — the moving target never retroactively marks
 * a prior day missed or hit. No-ops (cheap) otherwise.
 *
 * Prefers a scale-MEASURED lean mass (Withings fat-free mass) when the latest
 * weigh-in has one; otherwise falls back to the weight×(1−bf) estimate.
 *
 * Called after a sync, so a new scale reading nudges the target automatically.
 */
export async function maybeUpdateProteinTarget(): Promise<void> {
  const [weights, profile, targets] = await Promise.all([
    getWeightSeries(),
    getProfile(),
    getTargets(),
  ]);
  if (weights.length === 0) return;
  const latestWeight = weights[weights.length - 1].weight;
  const latestBodyFat = [...weights].reverse().find((w) => w.bodyFat != null)?.bodyFat ?? null;
  const latestLean = [...weights].reverse().find((w) => w.leanMass != null)?.leanMass ?? null;

  const suggested =
    proteinForLeanMass(latestLean) ?? suggestedProtein(latestWeight, latestBodyFat, profile.heightCm);
  if (suggested == null || Math.abs(suggested - targets.protein) < MIN_PROTEIN_MOVE) return;

  // Append-only via setTargets (effective today), carrying calories forward.
  await setTargets(targets.kcal, suggested);
}
