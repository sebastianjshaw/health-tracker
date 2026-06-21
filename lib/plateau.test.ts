import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectPlateau } from "./plateau";

function series(kgPerWeek: number) {
  const weighIns: { date: string; weight: number }[] = [];
  for (let i = 0; i < 21; i++) {
    weighIns.push({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      weight: Math.round((100 + (kgPerWeek / 7) * i) * 100) / 100,
    });
  }
  return weighIns;
}
const today = "2026-06-21";

describe("detectPlateau", () => {
  it("flags a flat trend while trying to lose", () => {
    const r = detectPlateau({ weighIns: series(0), today, tryingToLose: true });
    assert.equal(r.plateaued, true);
  });

  it("does not flag steady loss", () => {
    const r = detectPlateau({ weighIns: series(-0.4), today, tryingToLose: true });
    assert.equal(r.plateaued, false);
    assert.ok(r.trendKgPerWeek < 0);
  });

  it("a flat trend is maintenance, not a plateau, when not dieting", () => {
    const r = detectPlateau({ weighIns: series(0), today, tryingToLose: false });
    assert.equal(r.plateaued, false);
  });

  it("needs enough recent weigh-ins", () => {
    const r = detectPlateau({ weighIns: series(0).slice(0, 2), today, tryingToLose: true });
    assert.equal(r.plateaued, false);
  });
});
