import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entryMacros, round, totals } from "./nutrition";

describe("totals", () => {
  it("sums per-serving values scaled by quantity", () => {
    const result = totals([
      { quantity: 2, kcal: 100, protein: 10, carbs: 5, fat: 3 },
      { quantity: 1, kcal: 50, protein: 2, carbs: 8, fat: 1 },
    ]);
    assert.deepEqual(result, { kcal: 250, protein: 22, carbs: 18, fat: 7 });
  });

  it("returns zeros for an empty list", () => {
    assert.deepEqual(totals([]), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("entryMacros", () => {
  it("scales a single entry", () => {
    assert.deepEqual(
      entryMacros({ quantity: 1.5, kcal: 200, protein: 20, carbs: 10, fat: 5 }),
      { kcal: 300, protein: 30, carbs: 15, fat: 7.5 },
    );
  });
});

describe("round", () => {
  it("rounds to the requested decimal places", () => {
    assert.equal(round(1.234, 2), 1.23);
    assert.equal(round(1.235, 1), 1.2);
  });
});
