/**
 * Loose matching to reuse an existing library food instead of creating a
 * near-identical new one. The food log accumulated ~35 duplicates because the
 * MCP logger minted a fresh food for every wording of the same item ("Coke",
 * "Coke, 330ml", "Coca-Cola (330ml can)" …). Reuse requires BOTH a related name
 * and matching per-serving nutrition: logging against a reused food snapshots
 * *that food's* values, so the nutrition must equal the portion or the logged
 * calories would be wrong.
 */

export type MacroPortion = { kcal: number; protein: number; carbs: number; fat: number };

/** Lowercased, entity- and punctuation-stripped, whitespace-collapsed. */
export function normalizeFoodName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Do two normalized names plausibly refer to the same item? Equal, one contained
 * in the other (both ≥4 chars, so "coke" ⊂ "coke 330ml"), or ≥60% token overlap.
 * Deliberately loose — a nutrition match is always required alongside it — but not
 * so loose it merges different items that happen to share a word (e.g. "A&W Root
 * Beer" vs "A&W Sarsaparilla" share only "a"/"w", well under the threshold).
 */
export function namesRelated(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  const ta = a.split(" ").filter(Boolean);
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.length === 0 || tb.size === 0) return false;
  const inter = ta.filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return inter / union >= 0.6;
}

/**
 * Is `candidate`'s per-serving nutrition close enough to `portion` that logging
 * one serving reproduces it? kcal within 5% (min 8 kcal), macros within a few
 * grams. Tight on purpose: a different portion of the same food (e.g. "Coke x2")
 * won't match, so it stays its own entry rather than being mislogged.
 */
export function nutritionMatches(portion: MacroPortion, candidate: MacroPortion): boolean {
  const kcalTol = Math.max(8, portion.kcal * 0.05);
  return (
    Math.abs(candidate.kcal - portion.kcal) <= kcalTol &&
    Math.abs(candidate.protein - portion.protein) <= 3 &&
    Math.abs(candidate.carbs - portion.carbs) <= 5 &&
    Math.abs(candidate.fat - portion.fat) <= 3
  );
}

/** A library food is reusable for a portion when the name is related AND the
 *  per-serving nutrition matches. */
export function isReusableFoodMatch(
  portion: MacroPortion & { name: string },
  candidate: MacroPortion & { name: string },
): boolean {
  return (
    namesRelated(normalizeFoodName(portion.name), normalizeFoodName(candidate.name)) &&
    nutritionMatches(portion, candidate)
  );
}
