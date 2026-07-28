import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ageFrom,
  proteinForLeanMass,
  suggestedProtein,
  waistToHeight,
  whtrClass,
} from "./health";

describe("proteinForLeanMass", () => {
  it("applies 2.2 g/kg lean, rounded to 5 g", () => {
    assert.equal(proteinForLeanMass(77.3), 170); // 77.3 × 2.2 = 170.06 → 170
    assert.equal(proteinForLeanMass(80), 175); // 176 → 175
  });
  it("is null without a positive lean mass", () => {
    assert.equal(proteinForLeanMass(null), null);
    assert.equal(proteinForLeanMass(0), null);
  });
});

describe("suggestedProtein", () => {
  it("uses lean mass (2.2 g/kg) when body fat is known", () => {
    // 112 kg @ 31% bf → lean 77.3 kg × 2.2 ≈ 170 g (not the ~225 g per-bodyweight gives)
    assert.equal(suggestedProtein(112, 31, 180), 170);
  });
  it("caps at a reference weight when body fat is unknown (no over-prescribing from fat)", () => {
    // no bf → reference = min(112, BMI-25 weight 81 kg) = 81 × 2.0 = 162 → 160 g
    assert.equal(suggestedProtein(112, null, 180), 160);
    // a much heavier person is capped at the same 81 kg reference, not scaled up
    assert.equal(suggestedProtein(150, null, 180), 160);
  });
  it("uses actual weight when already within the healthy BMI range", () => {
    // 80 kg @ 1.80 m is under the 81 kg BMI-25 cap → 80 × 2.0 = 160 g
    assert.equal(suggestedProtein(80, null, 180), 160);
  });
  it("falls back to a moderate per-bodyweight figure without a height", () => {
    // can't form a reference → 112 × 1.6 = 179.2 → 180 g
    assert.equal(suggestedProtein(112, null, null), 180);
  });
  it("is null without a weight", () => {
    assert.equal(suggestedProtein(null), null);
    assert.equal(suggestedProtein(0), null);
  });
});

describe("ageFrom", () => {
  it("rejects impossible dates instead of silently rolling them forward", () => {
    assert.equal(ageFrom("2026-02-30"), null); // Feb 30 used to roll to Mar 2
    assert.equal(ageFrom("2026-13-01"), null);
    assert.equal(ageFrom("not-a-date"), null);
  });
  it("computes a plausible age for a valid dob", () => {
    const age = ageFrom("1980-01-01");
    assert.ok(age != null && age >= 40 && age < 60);
  });
});

describe("waistToHeight", () => {
  it("computes the ratio", () => {
    assert.equal(waistToHeight(90, 180), 0.5);
    assert.equal(waistToHeight(102, 180), 0.57);
  });
  it("is null without both measurements", () => {
    assert.equal(waistToHeight(null, 180), null);
    assert.equal(waistToHeight(90, null), null);
  });
  it("bands risk against the 0.5 threshold", () => {
    assert.equal(whtrClass(0.45), "Healthy");
    assert.equal(whtrClass(0.57), "Increased risk");
    assert.equal(whtrClass(0.62), "High risk");
    assert.equal(whtrClass(null), "");
  });
});
