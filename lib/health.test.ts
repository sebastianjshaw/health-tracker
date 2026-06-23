import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ageFrom, suggestedProtein, waistToHeight, whtrClass } from "./health";

describe("suggestedProtein", () => {
  it("uses lean mass (2.2 g/kg) when body fat is known", () => {
    // 112 kg @ 31% bf → lean 77.3 kg × 2.2 ≈ 170 g (not the ~225 g per-bodyweight gives)
    assert.equal(suggestedProtein(112, 31, 180), 170);
  });
  it("eases off for an obese BMI when body fat is unknown (~0.6 g/lb)", () => {
    // no bf, BMI 34.6 → 112 × 1.3 ≈ 145 g
    assert.equal(suggestedProtein(112, null, 180), 145);
  });
  it("uses 2.0 g/kg bodyweight for a normal BMI without body fat", () => {
    assert.equal(suggestedProtein(80, null, 180), 160); // BMI ~24.7
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
