import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { projectGoalEta, type WeighInPoint } from "./goal-eta";
import { addDays } from "./date";

/** Build a weigh-in series losing `perDay` kg/day from `startWeight`. */
function series(startWeight: number, perDay: number, days: number, from = "2026-01-01"): WeighInPoint[] {
  const out: WeighInPoint[] = [];
  for (let i = 0; i < days; i++) {
    out.push({ date: addDays(from, i), weight: Math.round((startWeight + perDay * i) * 10) / 10 });
  }
  return out;
}

describe("projectGoalEta", () => {
  it("projects a future date when trending toward the goal", () => {
    // 100 kg losing 0.1 kg/day for 30 days → ~97 kg now; goal 90 → ~70 more days
    const w = series(100, -0.1, 30);
    const today = w[w.length - 1].date;
    const eta = projectGoalEta(w, 90, today);
    assert.ok(eta, "expected an ETA");
    assert.ok(eta!.kgPerWeek < 0, "rate should be negative (losing)");
    assert.ok(eta!.date > today, "ETA should be in the future");
    // ~0.7 kg/wk, ~7 kg to go → roughly 10 weeks out (allow a wide band)
    assert.ok(eta!.days > 40 && eta!.days < 120, `unexpected days: ${eta!.days}`);
  });

  it("returns null when the trend moves away from the goal", () => {
    const w = series(100, +0.1, 30); // gaining, but goal is below
    assert.equal(projectGoalEta(w, 90, w[w.length - 1].date), null);
  });

  it("returns null when essentially stalled (ETA too far)", () => {
    const w = series(100, -0.001, 30); // ~0.007 kg/wk → centuries away
    assert.equal(projectGoalEta(w, 90, w[w.length - 1].date), null);
  });

  it("returns null without enough data", () => {
    assert.equal(projectGoalEta(series(100, -0.1, 4), 90, "2026-01-04"), null);
  });
});
