import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leanBodyMass, metabolicAge } from "./metabolic-age";

describe("leanBodyMass", () => {
  it("subtracts fat mass", () => {
    assert.equal(leanBodyMass(100, 25), 75);
  });
  it("is null without a valid body-fat reading", () => {
    assert.equal(leanBodyMass(100, null), null);
    assert.equal(leanBodyMass(100, 100), null);
    assert.equal(leanBodyMass(null, 20), null);
  });
});

describe("metabolicAge", () => {
  const base = { weightKg: 112.4, heightCm: 180, sex: "male" };

  it("estimates from body composition (higher fat reads older)", () => {
    const lean = metabolicAge({ ...base, bodyFatPct: 18 })!;
    const fat = metabolicAge({ ...base, bodyFatPct: 31 })!;
    assert.ok(fat > lean, `expected ${fat} > ${lean}`);
  });

  it("returns a plausible figure for real inputs", () => {
    const age = metabolicAge({ ...base, bodyFatPct: 31.1 })!;
    assert.ok(age >= 35 && age <= 50, `got ${age}`);
  });

  it("clamps to the 18–80 range", () => {
    assert.equal(metabolicAge({ ...base, bodyFatPct: 3 }), 18); // implausibly lean
    assert.ok(metabolicAge({ weightKg: 60, heightCm: 180, sex: "male", bodyFatPct: 55 })! <= 80);
  });

  it("needs height and a body-fat reading", () => {
    assert.equal(metabolicAge({ ...base, bodyFatPct: null }), null);
    assert.equal(metabolicAge({ weightKg: 112, heightCm: null, sex: "male", bodyFatPct: 25 }), null);
  });
});
