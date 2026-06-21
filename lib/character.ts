/**
 * Turns real tracked stats into a (tongue-in-cheek but honest) D&D-style
 * character sheet. Pure + deterministic so it's testable; the server gatherer
 * feeds it. Ability scores use the D&D 3–20 scale where 10 is average.
 */

export type CharacterInput = {
  sex: string;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  /** squat + bench + deadlift working weights (kg). */
  liftTotalKg: number;
  restingHr: number | null;
  avgSleepH: number | null;
  weeklyKm: number | null;
  /** Best running pace seen (min/km), if any. */
  bestRunPace: number | null;
  /** % of recent days at/under the calorie target. */
  calorieAdherencePct: number | null;
  /** % of recent days hitting the protein target. */
  proteinAdherencePct: number | null;
  /** % of recent days with anything logged. */
  trackingPct: number;
  /** How many data domains have any data (0–6): weight, lifts, cardio, sleep, hr, blood. */
  domainsCovered: number;
  workoutCount: number;
  cardioCount: number;
  bloodPanels: number;
};

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type Ability = {
  key: AbilityKey;
  label: string;
  score: number;
  modifier: number;
  /** The real numbers behind the score. */
  basis: string;
  /** Honest one-liner for the score band. */
  note: string;
};

export type Character = {
  className: string;
  level: number;
  title: string;
  hp: number;
  ac: number;
  proficiency: number;
  abilities: Ability[];
  dmNote: string;
  derivedFrom: string[];
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const r = (n: number) => Math.round(n);
const modifier = (score: number) => Math.floor((score - 10) / 2);
export const fmtMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);

function band<T>(score: number, low: T, mid: T, high: T): T {
  if (score >= 15) return high;
  if (score >= 10) return mid;
  return low;
}

const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const HIT_DIE: Record<string, number> = {
  Barbarian: 12,
  Fighter: 10,
  Ranger: 10,
  Paladin: 10,
  Monk: 8,
  Cleric: 8,
  Wizard: 6,
};

export function buildCharacter(input: CharacterInput): Character {
  // ---- STR: big-three relative to bodyweight ----
  // Anchored to D&D's scale where 10 is an average human commoner: a novice
  // total (~1.5× bodyweight S+B+D) sits ~9, climbing to elite ~20 near 6×.
  let str: number;
  let strBasis: string;
  if (input.liftTotalKg > 0 && input.weightKg && input.weightKg > 0) {
    const ratio = input.liftTotalKg / input.weightKg;
    str = clamp(r(9 + (ratio - 1.5) * 2.4), 3, 20);
    strBasis = `S+B+D ≈ ${r(input.liftTotalKg)} kg (${ratio.toFixed(1)}× bodyweight)`;
  } else {
    str = 10; // unmeasured ≈ an average human, not weak
    strBasis = "no lifts logged — assumed average";
  }

  // ---- DEX: running pace, else cardio volume ----
  // 10 ≈ an average mover (~7:30/km best effort); faster climbs (~5:00/km ≈ 14).
  let dex: number;
  let dexBasis: string;
  if (input.bestRunPace != null) {
    dex = clamp(r(10 + (7.5 - input.bestRunPace) * 1.5), 3, 20);
    dexBasis = `best pace ${input.bestRunPace.toFixed(1)} min/km`;
    if (input.weeklyKm != null) dexBasis += `, ~${r(input.weeklyKm)} km/wk`;
  } else if (input.weeklyKm != null && input.weeklyKm > 0) {
    dex = clamp(r(10 + input.weeklyKm * 0.15), 3, 18);
    dexBasis = `~${r(input.weeklyKm)} km/wk cardio`;
  } else {
    dex = 10; // unmeasured ≈ average
    dexBasis = "no cardio logged — assumed average";
  }

  // ---- CON: resting HR (lower = fitter) + sleep ----
  // 70 bpm ≈ an average adult's resting pulse → 10; fitter pulses climb.
  let con: number;
  let conBasis: string;
  if (input.restingHr != null) {
    let s = 10 + (70 - input.restingHr) * 0.2;
    if (input.avgSleepH != null) s += input.avgSleepH >= 7.5 ? 2 : input.avgSleepH >= 7 ? 1 : input.avgSleepH < 6 ? -2 : 0;
    con = clamp(r(s), 3, 20);
    conBasis = `resting HR ${input.restingHr} bpm${input.avgSleepH != null ? `, ${input.avgSleepH.toFixed(1)} h sleep` : ""}`;
  } else if (input.avgSleepH != null) {
    con = clamp(r(10 + (input.avgSleepH - 7) * 2), 4, 16);
    conBasis = `${input.avgSleepH.toFixed(1)} h sleep (no resting HR)`;
  } else {
    con = 10; // unmeasured ≈ average
    conBasis = "no resting HR or sleep logged — assumed average";
  }

  // ---- INT: self-knowledge = tracking breadth + consistency ----
  // Mostly upside: minimal tracking sits near average (~9); thoroughness climbs.
  const int = clamp(r(9 + input.trackingPct * 0.04 + input.domainsCovered * 0.8), 3, 20);
  const intBasis = `${r(input.trackingPct)}% of days logged, ${input.domainsCovered}/6 data domains`;

  // ---- WIS: discipline = adherence to targets ----
  let wis: number;
  let wisBasis: string;
  const adh = [input.calorieAdherencePct, input.proteinAdherencePct].filter(
    (x): x is number => x != null,
  );
  if (adh.length) {
    const a = adh.reduce((s, x) => s + x, 0) / adh.length;
    wis = clamp(r(10 + (a - 55) * 0.12), 3, 20); // ~55% adherence ≈ average

    wisBasis =
      `${input.calorieAdherencePct != null ? `${r(input.calorieAdherencePct)}% on calories` : ""}` +
      `${input.proteinAdherencePct != null ? `${input.calorieAdherencePct != null ? ", " : ""}${r(input.proteinAdherencePct)}% on protein` : ""}`;
  } else {
    wis = 10;
    wisBasis = "no target adherence to judge yet";
  }

  // ---- CHA: physical presence, proxied by body composition (measurable).
  // Anchored so 10 = population-average body fat and 18 = stage-lean "peak
  // human". The two sides use different slopes on purpose: there are only ~20
  // body-fat points between average and essential-fat, so the lean side must be
  // steeper to span 10→18 — a single gentle slope would make 18 (and even 16)
  // need impossible sub-zero body fat. The heavy side stays gentle. Sex-aware;
  // BMI is the fallback when body fat isn't measured.
  let cha: number;
  let chaBasis: string;
  if (input.bodyFatPct != null) {
    const avgBf = input.sex === "female" ? 27 : 20; // average body-fat % → CHA 10
    const leanBf = input.sex === "female" ? 14 : 6; // stage-lean "peak human" → CHA 18
    const bf = input.bodyFatPct;
    const raw =
      bf <= avgBf
        ? 10 + (avgBf - bf) * (8 / (avgBf - leanBf)) // lean side: reaches 18 at leanBf
        : 10 - (bf - avgBf) * 0.3; // heavy side: gentle, hits 3 near morbid obesity
    cha = clamp(r(raw), 3, 18);
    chaBasis = `body fat ${input.bodyFatPct}%`;
  } else if (input.bmi != null) {
    let s = 10 + (24 - input.bmi) * 0.5; // ~24 BMI ≈ average build
    if (input.bmi < 18.5) s -= (18.5 - input.bmi) * 0.5; // underweight isn't a bonus
    cha = clamp(r(s), 3, 18);
    chaBasis = `BMI ${input.bmi}`;
  } else {
    cha = 10; // unmeasured ≈ average
    chaBasis = "no body-composition data — assumed average";
  }

  const raw: Record<AbilityKey, { score: number; basis: string }> = {
    str: { score: str, basis: strBasis },
    dex: { score: dex, basis: dexBasis },
    con: { score: con, basis: conBasis },
    int: { score: int, basis: intBasis },
    wis: { score: wis, basis: wisBasis },
    cha: { score: cha, basis: chaBasis },
  };

  const NOTES: Record<AbilityKey, [string, string, string]> = {
    str: [
      "Around an average human's strength — fine for daily life, but no one's calling you to shift their piano.",
      "Solid, practical strength — daily life and then some.",
      "Genuinely strong. The barbell respects you.",
    ],
    dex: [
      "Below an average pace right now — cardio's more theory than practice.",
      "Gets around fine; cardio's ticking over without being a strength.",
      "Quick and well-conditioned — sprint-finish material.",
    ],
    con: [
      "Engine runs a bit hot at rest — elevated resting pulse and/or short sleep.",
      "Steady constitution — holds up to a normal week.",
      "Runs cool and efficient: low resting pulse, strong recovery.",
    ],
    int: [
      "Light on self-data — going partly by feel.",
      "Tracks the essentials and knows the rough shape of things.",
      "Meticulous logger; you know your own numbers cold.",
    ],
    wis: [
      "Targets drift more than they're hit lately.",
      "Mostly on plan, with the odd detour.",
      "Disciplined — hits the targets set, most days.",
    ],
    cha: [
      "Carrying more than average for the frame — composition is the dial here.",
      "An everyday build; composition sits around average.",
      "Lean, athletic composition.",
    ],
  };

  // CON's low-band note is generated from the inputs so it only blames factors
  // that were actually negative — sleep ≥7h is a *bonus*, so it must never be
  // cited as "short sleep" just because the resting pulse dragged the score down.
  let conNote: string | undefined;
  if (con < 10) {
    const factors: string[] = [];
    if (input.restingHr != null && input.restingHr > 70) factors.push("an elevated resting pulse");
    // Sleep only counts against you where the formula actually penalises it:
    // below 6h when paired with HR, or below the 7h recommendation when sleep
    // is the sole input. At ≥7h it's a bonus and must never be blamed here.
    const sleepThreshold = input.restingHr != null ? 6 : 7;
    if (input.avgSleepH != null && input.avgSleepH < sleepThreshold) factors.push("short sleep");
    conNote = factors.length
      ? `Engine runs a bit hot at rest — ${factors.join(" and ")}.`
      : "Constitution sits a touch below average.";
  }

  const noteOverride: Partial<Record<AbilityKey, string>> = { con: conNote };

  const abilities: Ability[] = (Object.keys(raw) as AbilityKey[]).map((key) => ({
    key,
    label: ABILITY_LABELS[key],
    score: raw[key].score,
    modifier: modifier(raw[key].score),
    basis: raw[key].basis,
    note: noteOverride[key] ?? band(raw[key].score, NOTES[key][0], NOTES[key][1], NOTES[key][2]),
  }));

  // ---- class from the dominant *physical/mental* ability (CHA is a proxy) ----
  const core: AbilityKey[] = ["str", "dex", "con", "int", "wis"];
  const scored = core.map((k) => ({ k, s: raw[k].score }));
  const top = scored.reduce((a, b) => (b.s > a.s ? b : a));
  const spread = Math.max(...scored.map((x) => x.s)) - Math.min(...scored.map((x) => x.s));
  let className: string;
  if (spread <= 2) className = "Paladin"; // well-rounded
  else if (top.k === "str") className = top.s >= 15 ? "Barbarian" : "Fighter";
  else if (top.k === "dex") className = "Ranger";
  else if (top.k === "con") className = "Fighter";
  else if (top.k === "int") className = "Wizard";
  else className = "Cleric"; // wis

  // ---- level from logged effort, with diminishing returns ----
  // Deliberate workouts count most; passive auto-imported cardio is capped so a
  // wall of step-tracked walks can't trivially max the level; sqrt flattens it.
  const effort =
    input.workoutCount * 4 +
    Math.min(input.cardioCount, 60) +
    input.bloodPanels * 3 +
    input.trackingPct / 10;
  const level = clamp(1 + Math.floor(Math.sqrt(effort)), 1, 20);

  const conMod = modifier(con);
  const dexMod = modifier(dex);
  const die = HIT_DIE[className] ?? 8;
  const hp = Math.max(1, die + (level - 1) * (Math.floor(die / 2) + 1) + conMod * level);
  const ac = 10 + dexMod;
  const proficiency = 2 + Math.floor((level - 1) / 4);

  const best = abilities.reduce((a, b) => (b.score > a.score ? b : a));
  const worst = abilities.reduce((a, b) => (b.score < a.score ? b : a));
  const dmNote = `Standout stat: ${best.label} (${best.score}). Dump stat: ${worst.label} (${worst.score}). The rest is on you to roll for.`;

  const derivedFrom: string[] = [];
  if (input.age != null) derivedFrom.push(`Age ${input.age}`);
  if (input.heightCm) derivedFrom.push(`${input.heightCm} cm`);
  if (input.weightKg) derivedFrom.push(`${input.weightKg} kg${input.bmi != null ? ` (BMI ${input.bmi})` : ""}`);
  derivedFrom.push(`${input.workoutCount} lifts logged`, `${input.cardioCount} cardio sessions`);

  return { className, level, title: `Level ${level} ${className}`, hp, ac, proficiency, abilities, dmNote, derivedFrom };
}
