import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { netPassiveKm, passiveWalkKcal } from "./passive-activity";

describe("netPassiveKm", () => {
  it("subtracts session distance from the daily total", () => {
    assert.equal(netPassiveKm(6, 2), 4);
  });
  it("never goes negative (session ≥ daily total)", () => {
    assert.equal(netPassiveKm(3, 5), 0);
  });
});

describe("passiveWalkKcal", () => {
  it("scales with net distance and bodyweight", () => {
    // 4 km × 100 kg × 0.5 = 200
    assert.equal(passiveWalkKcal(4, 100), 200);
  });
  it("is zero without weight or distance", () => {
    assert.equal(passiveWalkKcal(4, null), 0);
    assert.equal(passiveWalkKcal(0, 100), 0);
  });
});
