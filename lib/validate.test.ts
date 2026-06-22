import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isFiniteNum, isFiniteOrNull } from "./validate";

describe("isFiniteNum", () => {
  it("accepts real numbers", () => {
    assert.equal(isFiniteNum(0), true);
    assert.equal(isFiniteNum(-3.5), true);
  });
  it("rejects NaN, Infinity and non-numbers", () => {
    assert.equal(isFiniteNum(NaN), false);
    assert.equal(isFiniteNum(Infinity), false);
    assert.equal(isFiniteNum(-Infinity), false);
    assert.equal(isFiniteNum("5"), false);
    assert.equal(isFiniteNum(null), false);
  });
});

describe("isFiniteOrNull", () => {
  it("allows absent values but not garbage numbers", () => {
    assert.equal(isFiniteOrNull(null), true);
    assert.equal(isFiniteOrNull(undefined), true);
    assert.equal(isFiniteOrNull(42), true);
    assert.equal(isFiniteOrNull(NaN), false);
    assert.equal(isFiniteOrNull(Infinity), false);
  });
});
