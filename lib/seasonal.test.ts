import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthlyAverages, yearlyAverages } from "./seasonal";

const data = [
  { date: "2024-01-10", weight: 110 },
  { date: "2024-01-20", weight: 112 },
  { date: "2024-06-10", weight: 100 },
  { date: "2025-01-15", weight: 108 },
];

describe("monthlyAverages", () => {
  it("averages by calendar month across years, ordered Jan→Dec", () => {
    const m = monthlyAverages(data);
    assert.deepEqual(
      m.map((x) => x.month),
      [1, 6],
    );
    const jan = m.find((x) => x.month === 1)!;
    assert.equal(jan.label, "Jan");
    assert.equal(jan.count, 3); // 110, 112, 108
    assert.equal(jan.avgWeight, 110); // (110+112+108)/3
  });
});

describe("yearlyAverages", () => {
  it("gives mean/min/max per year, ascending", () => {
    const y = yearlyAverages(data);
    assert.deepEqual(
      y.map((x) => x.year),
      [2024, 2025],
    );
    const y24 = y[0];
    assert.equal(y24.min, 100);
    assert.equal(y24.max, 112);
    assert.equal(y24.count, 3);
  });
});
