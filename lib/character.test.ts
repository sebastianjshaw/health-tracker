import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCharacter, type CharacterInput } from "./character";

const base: CharacterInput = {
  sex: "male",
  age: 40,
  heightCm: 180,
  weightKg: 90,
  bmi: 27.8,
  bodyFatPct: null,
  liftTotalKg: 0,
  restingHr: null,
  avgSleepH: null,
  weeklyKm: null,
  bestRunPace: null,
  calorieAdherencePct: null,
  proteinAdherencePct: null,
  trackingPct: 0,
  domainsCovered: 0,
  workoutCount: 0,
  cardioCount: 0,
  bloodPanels: 0,
};

describe("buildCharacter", () => {
  it("always returns six abilities with correct D&D modifiers", () => {
    const c = buildCharacter(base);
    assert.equal(c.abilities.length, 6);
    for (const a of c.abilities) {
      assert.equal(a.modifier, Math.floor((a.score - 10) / 2));
      assert.ok(a.score >= 3 && a.score <= 20);
    }
  });

  it("rewards a big relative lift total with high STR and a martial class", () => {
    const c = buildCharacter({ ...base, weightKg: 90, liftTotalKg: 450 }); // 5× bodyweight
    const str = c.abilities.find((a) => a.key === "str")!;
    assert.ok(str.score >= 16, `expected strong STR, got ${str.score}`);
    assert.ok(["Fighter", "Barbarian"].includes(c.className));
  });

  it("a low resting HR + good sleep lifts CON", () => {
    const lowHr = buildCharacter({ ...base, restingHr: 48, avgSleepH: 8 }).abilities.find((a) => a.key === "con")!;
    const highHr = buildCharacter({ ...base, restingHr: 72, avgSleepH: 5 }).abilities.find((a) => a.key === "con")!;
    assert.ok(lowHr.score > highHr.score);
  });

  it("never blames short sleep when sleep was actually adequate (CON note honesty)", () => {
    // HR drags CON below 10, but 7.2h sleep is a bonus — the note must not cite it.
    const con = buildCharacter({ ...base, restingHr: 78, avgSleepH: 7.2 }).abilities.find(
      (a) => a.key === "con",
    )!;
    assert.ok(con.score < 10, `expected sub-average CON, got ${con.score}`);
    assert.match(con.note, /elevated resting pulse/);
    assert.doesNotMatch(con.note, /short sleep/);
  });

  it("does cite short sleep when sleep genuinely dragged CON down", () => {
    const con = buildCharacter({ ...base, restingHr: 70, avgSleepH: 5 }).abilities.find(
      (a) => a.key === "con",
    )!;
    assert.match(con.note, /short sleep/);
  });

  it("levels up with logged effort and stays in 1–20", () => {
    const c = buildCharacter({ ...base, workoutCount: 40, cardioCount: 30, bloodPanels: 3 });
    assert.ok(c.level >= 1 && c.level <= 20);
    assert.ok(c.level > buildCharacter(base).level);
  });

  it("ties Charisma to body composition (leaner = higher), via body fat then BMI", () => {
    const cha = (i: Partial<CharacterInput>) =>
      buildCharacter({ ...base, ...i }).abilities.find((a) => a.key === "cha")!.score;
    // leaner body fat scores higher than higher body fat
    assert.ok(cha({ bodyFatPct: 12 }) > cha({ bodyFatPct: 30 }));
    // falls back to BMI when no body fat: a high BMI sits below average (10)
    assert.ok(cha({ bmi: 34, bodyFatPct: null }) < 10);
    assert.ok(cha({ bmi: 22, bodyFatPct: null }) >= 10);
  });

  it("Charisma scale reaches the top at stage-lean body fat (male)", () => {
    const cha = (bf: number) =>
      buildCharacter({ ...base, sex: "male", bodyFatPct: bf }).abilities.find((a) => a.key === "cha")!
        .score;
    assert.equal(cha(20), 10); // average → midpoint
    assert.equal(cha(6), 18); // stage-lean → max (was unreachable before)
    assert.equal(cha(13), 14);
    // monotonic: leaner never scores lower
    assert.ok(cha(6) > cha(10) && cha(10) > cha(16) && cha(16) > cha(30));
  });

  it("names a standout and a dump stat", () => {
    assert.match(buildCharacter(base).dmNote, /Standout stat:.*Dump stat:/);
  });
});
