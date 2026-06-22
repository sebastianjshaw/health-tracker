import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, slopePerDay } from "./regression";

describe("daysBetween", () => {
  it("counts whole days", () => {
    assert.equal(daysBetween("2026-06-01", "2026-06-08"), 7);
    assert.equal(daysBetween("2026-06-08", "2026-06-01"), -7);
  });
  it("is DST-immune (spans the Mar 2026 switch cleanly)", () => {
    assert.equal(daysBetween("2026-03-28", "2026-04-01"), 4);
  });
});

describe("slopePerDay", () => {
  it("recovers a known linear slope", () => {
    const pts = [
      { date: "2026-06-01", value: 100 },
      { date: "2026-06-11", value: 95 }, // -5 over 10 days
    ];
    assert.ok(Math.abs(slopePerDay(pts) - -0.5) < 1e-9);
  });
  it("is 0 with fewer than two points", () => {
    assert.equal(slopePerDay([{ date: "2026-06-01", value: 100 }]), 0);
  });
});
