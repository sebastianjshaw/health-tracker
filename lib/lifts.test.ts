import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELOAD_AFTER_FAILS,
  exerciseSucceeded,
  nextWeight,
  roundLoad,
} from "./lifts";

describe("exerciseSucceeded", () => {
  it("passes when all squat sets hit 5 reps", () => {
    assert.equal(exerciseSucceeded("squat", [5, 5, 5, 5, 5]), true);
  });

  it("fails when deadlift has fewer than one logged set", () => {
    assert.equal(exerciseSucceeded("deadlift", []), false);
  });

  it("fails when any set is below target reps", () => {
    assert.equal(exerciseSucceeded("bench", [5, 5, 4, 5, 5]), false);
  });
});

describe("roundLoad", () => {
  it("rounds to 2.5 kg increments", () => {
    assert.equal(roundLoad(42.4), 42.5);
    assert.equal(roundLoad(43.7), 42.5);
  });

  it("never goes below 20 kg", () => {
    assert.equal(roundLoad(10), 20);
  });
});

describe("nextWeight", () => {
  it("adds 2.5 kg after success", () => {
    assert.deepEqual(nextWeight(60, true, 0), { weight: 62.5, deloaded: false });
  });

  it("holds weight after a single failure", () => {
    assert.deepEqual(nextWeight(60, false, 0), { weight: 60, deloaded: false });
  });

  it("deloads after the third consecutive failure", () => {
    const priorFails = DELOAD_AFTER_FAILS - 1;
    assert.deepEqual(nextWeight(100, false, priorFails), {
      weight: 90,
      deloaded: true,
    });
  });
});
