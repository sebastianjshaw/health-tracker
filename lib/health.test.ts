import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ageFrom, waistToHeight, whtrClass } from "./health";

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
