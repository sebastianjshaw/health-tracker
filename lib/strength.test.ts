import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimated1RM, liftStats } from "./strength";

describe("estimated1RM", () => {
  it("returns the weight for a single (or unknown reps)", () => {
    assert.equal(estimated1RM(100, 1), 100);
    assert.equal(estimated1RM(100, null), 100);
  });
  it("scales up with reps (Epley)", () => {
    assert.equal(estimated1RM(100, 5), 117); // 100 × (1 + 5/30)
    assert.ok(estimated1RM(100, 10) > estimated1RM(100, 5));
  });
});

describe("liftStats", () => {
  it("tracks best/latest e1RM and tonnage per exercise", () => {
    const [squat] = liftStats([
      { date: "2026-06-01", exercise: "squat", weightKg: 100, reps: 5 }, // e1RM 117
      { date: "2026-06-08", exercise: "squat", weightKg: 110, reps: 5 }, // e1RM 128 (PR)
      { date: "2026-06-08", exercise: "squat", weightKg: 110, reps: 3 },
    ]);
    assert.equal(squat.exercise, "squat");
    assert.equal(squat.best1RM, 128);
    assert.equal(squat.bestDate, "2026-06-08");
    assert.equal(squat.latestDate, "2026-06-08");
    assert.equal(squat.tonnageKg, 100 * 5 + 110 * 5 + 110 * 3);
  });

  it("sorts strongest lift first", () => {
    const stats = liftStats([
      { date: "2026-06-01", exercise: "bench", weightKg: 80, reps: 5 },
      { date: "2026-06-01", exercise: "deadlift", weightKg: 140, reps: 5 },
    ]);
    assert.equal(stats[0].exercise, "deadlift");
  });
});
