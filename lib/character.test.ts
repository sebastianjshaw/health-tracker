import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCharacter, type CharacterInput } from "./character";

const base: CharacterInput = {
  sex: "male",
  age: 40,
  heightCm: 180,
  weightKg: 90,
  bmi: 27.8,
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

  it("levels up with logged effort and stays in 1–20", () => {
    const c = buildCharacter({ ...base, workoutCount: 40, cardioCount: 30, bloodPanels: 3 });
    assert.ok(c.level >= 1 && c.level <= 20);
    assert.ok(c.level > buildCharacter(base).level);
  });

  it("names a standout and a dump stat", () => {
    assert.match(buildCharacter(base).dmNote, /Standout stat:.*Dump stat:/);
  });
});
