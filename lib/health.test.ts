import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { waistToHeight, whtrClass } from "./health";

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
