import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summariseWeights, type WeighIn } from "./report-summary";

const series: WeighIn[] = [
  { date: "2026-01-01", weight: 120, bodyFat: null },
  { date: "2026-04-05", weight: 114, bodyFat: null },
  { date: "2026-06-03", weight: 113, bodyFat: null },
  { date: "2026-06-21", weight: 112, bodyFat: null },
];

describe("summariseWeights", () => {
  it("scopes the chart series and baseline→current to the range (the report bug)", () => {
    const s = summariseWeights(series, "2026-04-01", "2026-06-21");
    // Out-of-range Jan 1 must be excluded from both the chart and the baseline.
    assert.deepEqual(
      s.series.map((w) => w.date),
      ["2026-04-05", "2026-06-03", "2026-06-21"],
    );
    assert.equal(s.baseline?.date, "2026-04-05");
    assert.equal(s.current?.date, "2026-06-21");
    assert.equal(s.changeKg, -2); // 112 − 114
  });

  it("computes change %, kg/week over the in-range span", () => {
    const s = summariseWeights(series, "2026-01-01", "2026-06-21");
    assert.equal(s.baseline?.weight, 120);
    assert.equal(s.changeKg, -8);
    assert.equal(s.changePct, -6.7);
    assert.ok(s.kgPerWeek != null && s.kgPerWeek < 0);
  });

  it("returns nulls when the range has no weigh-ins", () => {
    const s = summariseWeights(series, "2025-01-01", "2025-12-31");
    assert.equal(s.series.length, 0);
    assert.equal(s.baseline, null);
    assert.equal(s.current, null);
    assert.equal(s.changeKg, null);
  });
});
