import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, isValidISO, isWeekend, schedulesFor, timeOf, toISODate } from "./date";

describe("timeOf", () => {
  it("converts a UTC (Z) time to UK local — BST is +1", () => {
    assert.equal(timeOf("2026-06-13T05:44:34.419Z"), "06:44");
  });

  it("converts a UTC (Z) time to UK local — GMT in winter is +0", () => {
    assert.equal(timeOf("2026-01-15T05:44:00Z"), "05:44");
  });

  it("reads a naive (manual) wall-clock verbatim", () => {
    assert.equal(timeOf("2026-06-13T07:15"), "07:15");
  });

  it("returns null for empty or time-less input", () => {
    assert.equal(timeOf(null), null);
    assert.equal(timeOf("2026-06-13"), null);
  });
});

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
