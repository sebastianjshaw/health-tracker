import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, isValidISO, isWeekend, schedulesFor, toISODate } from "./date";

describe("isValidISO", () => {
  it("accepts real calendar dates", () => {
    assert.equal(isValidISO("2026-06-05"), true);
  });

  it("rejects malformed strings", () => {
    assert.equal(isValidISO("2026-02-30"), false);
    assert.equal(isValidISO("not-a-date"), false);
  });
});

describe("addDays", () => {
  it("steps across month boundaries", () => {
    assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  });
});

describe("schedulesFor", () => {
  it("includes weekday schedule on a Monday", () => {
    assert.deepEqual(schedulesFor("2026-06-01"), ["everyday", "weekday"]);
  });

  it("includes weekend schedule on a Saturday", () => {
    assert.deepEqual(schedulesFor("2026-06-06"), ["everyday", "weekend"]);
  });
});

describe("isWeekend", () => {
  it("detects Saturday and Sunday", () => {
    assert.equal(isWeekend("2026-06-06"), true);
    assert.equal(isWeekend("2026-06-05"), false);
  });
});

describe("toISODate", () => {
  it("formats as YYYY-MM-DD", () => {
    assert.equal(toISODate(new Date(2026, 5, 5)), "2026-06-05");
  });
});
