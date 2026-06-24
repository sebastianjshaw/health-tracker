import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupsToReadings, type MeasureGroup } from "./integrations/withings-parse";

const T_23 = Date.UTC(2026, 5, 23, 7, 18, 45) / 1000; // 2026-06-23 07:18:45 UTC
const T_22 = Date.UTC(2026, 5, 22, 7, 13, 20) / 1000; // 2026-06-22 07:13:20 UTC

const weighIn = (date: number, fields: Record<number, [number, number]>): MeasureGroup => ({
  grpid: date,
  date,
  category: 1,
  measures: Object.entries(fields).map(([type, [value, unit]]) => ({
    type: Number(type),
    value,
    unit,
  })),
});

describe("groupsToReadings", () => {
  it("decodes value·10^unit into real kg/%", () => {
    const r = groupsToReadings(
      [
        weighIn(T_23, {
          1: [111595, -3], // weight 111.595 → 111.6
          6: [3150, -2], // fat ratio 31.5%
          5: [76400, -3], // fat-free mass 76.4
          76: [72100, -3], // muscle 72.1
          88: [3200, -3], // bone 3.2
          77: [42000, -3], // hydration 42.0
        }),
      ],
      "UTC",
    );
    assert.equal(r.length, 1);
    assert.deepEqual(r[0], {
      date: "2026-06-23",
      at: T_23,
      weightKg: 111.6,
      bodyFatPct: 31.5,
      leanMassKg: 76.4,
      muscleMassKg: 72.1,
      boneMassKg: 3.2,
      hydrationKg: 42,
    });
  });

  it("leaves missing measure types null", () => {
    const r = groupsToReadings([weighIn(T_23, { 1: [100000, -3] })], "UTC");
    assert.equal(r[0].weightKg, 100);
    assert.equal(r[0].bodyFatPct, null);
    assert.equal(r[0].leanMassKg, null);
    assert.equal(r[0].muscleMassKg, null);
  });

  it("keeps only the latest group per local day", () => {
    const morning = weighIn(T_23, { 1: [111000, -3] });
    const evening = weighIn(T_23 + 12 * 3600, { 1: [110500, -3] }); // same day, later
    const r = groupsToReadings([morning, evening], "UTC");
    assert.equal(r.length, 1);
    assert.equal(r[0].weightKg, 110.5); // evening wins
  });

  it("returns one reading per day, ascending by date", () => {
    const r = groupsToReadings(
      [weighIn(T_23, { 1: [111000, -3] }), weighIn(T_22, { 1: [112000, -3] })],
      "UTC",
    );
    assert.deepEqual(
      r.map((x) => x.date),
      ["2026-06-22", "2026-06-23"],
    );
  });

  it("buckets to the account-local day, not UTC", () => {
    // 2026-06-23 23:30 UTC is still the 23rd in UTC but already... stays 23rd in
    // New York (19:30). Use a pre-midnight UTC instant that rolls back a day.
    const lateUtc = Date.UTC(2026, 5, 24, 1, 30) / 1000; // 01:30 UTC on the 24th
    const r = groupsToReadings([weighIn(lateUtc, { 1: [111000, -3] })], "America/New_York");
    assert.equal(r[0].date, "2026-06-23"); // 21:30 on the 23rd in New York
  });

  it("is empty for no groups", () => {
    assert.deepEqual(groupsToReadings([], "UTC"), []);
  });
});
