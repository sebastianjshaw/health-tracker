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
  let dex: number;
  let dexBasis: string;
  if (input.bestRunPace != null) {
    dex = clamp(r(11 + (6.0 - input.bestRunPace) * 2), 3, 20);
    dexBasis = `best pace ${input.bestRunPace.toFixed(1)} min/km`;
    if (input.weeklyKm != null) dexBasis += `, ~${r(input.weeklyKm)} km/wk`;
  } else if (input.weeklyKm != null && input.weeklyKm > 0) {
    dex = clamp(r(8 + input.weeklyKm * 0.2), 3, 18);
    dexBasis = `~${r(input.weeklyKm)} km/wk cardio`;
  } else {
    dex = 8;
    dexBasis = "no cardio logged yet";
  }

  // ---- CON: resting HR (lower = better) + sleep ----
  let con: number;
  let conBasis: string;
  if (input.restingHr != null) {
    let s = 11 + (60 - input.restingHr) * 0.3;
    if (input.avgSleepH != null) s += input.avgSleepH >= 7.5 ? 2 : input.avgSleepH >= 7 ? 1 : input.avgSleepH < 6 ? -2 : 0;
    con = clamp(r(s), 3, 20);
    conBasis = `resting HR ${input.restingHr} bpm${input.avgSleepH != null ? `, ${input.avgSleepH.toFixed(1)} h sleep` : ""}`;
  } else if (input.avgSleepH != null) {
    con = clamp(r(9 + (input.avgSleepH - 7) * 2), 3, 16);
    conBasis = `${input.avgSleepH.toFixed(1)} h sleep (no resting HR)`;
  } else {
    con = 9;
    conBasis = "no resting HR or sleep logged";
  }

  // ---- INT: self-knowledge = tracking breadth + consistency ----
  const int = clamp(r(4 + input.trackingPct * 0.1 + input.domainsCovered * 1), 3, 20);
  const intBasis = `${r(input.trackingPct)}% of days logged, ${input.domainsCovered}/6 data domains`;

  // ---- WIS: discipline = adherence to targets ----
  let wis: number;
  let wisBasis: string;
  const adh = [input.calorieAdherencePct, input.proteinAdherencePct].filter(
    (x): x is number => x != null,
  );
  if (adh.length) {
    const a = adh.reduce((s, x) => s + x, 0) / adh.length;
    wis = clamp(r(4 + a * 0.14), 3, 20);
    wisBasis =
      `${input.calorieAdherencePct != null ? `${r(input.calorieAdherencePct)}% on calories` : ""}` +
      `${input.proteinAdherencePct != null ? `${input.calorieAdherencePct != null ? ", " : ""}${r(input.proteinAdherencePct)}% on protein` : ""}`;
  } else {
    wis = 10;
    wisBasis = "no target adherence to judge yet";
  }

  // ---- CHA: not really measurable — a proxy for vitality & showing up ----
  let chaAdj = 0;
  if (input.bmi != null) {
    chaAdj += input.bmi >= 18.5 && input.bmi < 25 ? 3 : input.bmi < 30 ? 0 : input.bmi < 35 ? -2 : -3;
  }
  if (input.avgSleepH != null && input.avgSleepH >= 7) chaAdj += 1;
  const cha = clamp(r(10 + chaAdj + input.trackingPct * 0.02), 3, 18);
  const chaBasis = `vitality proxy${input.bmi != null ? ` (BMI ${input.bmi})` : ""} — charisma isn't something a scale can read`;

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
      "Cardio is more theory than practice right now.",
      "Reasonably nimble — you can chase a bus without regret.",
      "Quick and conditioned; you'd take the parkrun sprint finish.",
    ],
    con: [
      "Resting pulse and/or sleep suggest the engine works hard at idle.",
      "Solid constitution — holds up to a normal week.",
      "Runs cool and steady: low resting pulse, good recovery.",
    ],
    int: [
      "Flying partly blind — the data's patchy.",
      "Tracks the essentials, with gaps.",
      "Meticulous logger; you know your own numbers cold.",
    ],
    wis: [
      "Targets are more of a guideline than a rule lately.",
      "Mostly on plan, with the occasional detour.",
      "Disciplined — hits the targets set, most days.",
    ],
    cha: [
      "Low on the proxy: tired engine, inconsistent showing-up.",
      "Average presence — fed, rested enough, present.",
      "High energy and consistency reading through.",
    ],
  };

  const abilities: Ability[] = (Object.keys(raw) as AbilityKey[]).map((key) => ({
    key,
    label: ABILITY_LABELS[key],
    score: raw[key].score,
    modifier: modifier(raw[key].score),
    basis: raw[key].basis,
    note: band(raw[key].score, NOTES[key][0], NOTES[key][1], NOTES[key][2]),
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
