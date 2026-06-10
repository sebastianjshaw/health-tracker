import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CARDIO_MET,
  DEFAULT_WEIGHT_KG,
  estimateCardioKcal,
} from "./cardio-calories";

describe("estimateCardioKcal", () => {
  it("uses kcal = MET × weight × hours", () => {
    // run (9.8 MET), 80 kg, 30 min → 9.8 * 80 * 0.5 = 392
    assert.equal(estimateCardioKcal("run", 30, 80), 392);
  });

  it("scales with duration and type", () => {
    const run60 = estimateCardioKcal("run", 60, 80)!;
    const run30 = estimateCardioKcal("run", 30, 80)!;
    assert.equal(run60, run30 * 2);
    // a walk burns less than a run for the same time/weight
    assert.ok(estimateCardioKcal("walk", 60, 80)! < run60);
  });

  it("falls back to a default weight when none is known", () => {
    assert.equal(
      estimateCardioKcal("bike", 60, null),
      Math.round(CARDIO_MET.bike * DEFAULT_WEIGHT_KG),
    );
  });

  it("returns null without a usable duration", () => {
    assert.equal(estimateCardioKcal("run", null, 80), null);
    assert.equal(estimateCardioKcal("run", 0, 80), null);
  });
});
