import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { targetForDate, type TargetEntry } from "./targets";

const history: TargetEntry[] = [
  { from: "2026-05-01", kcal: 2300, protein: 150 },
  { from: "2026-06-05", kcal: 2100, protein: 160 },
];

describe("targetForDate", () => {
  it("uses the earliest entry for dates before the first", () => {
    assert.deepEqual(targetForDate(history, "2026-04-01"), { kcal: 2300, protein: 150 });
  });

  it("matches the entry's own start date", () => {
    assert.deepEqual(targetForDate(history, "2026-06-05"), { kcal: 2100, protein: 160 });
  });

  it("uses the prior entry for a date between changes", () => {
    assert.deepEqual(targetForDate(history, "2026-05-20"), { kcal: 2300, protein: 150 });
  });

  it("uses the latest entry for a date after the last change", () => {
    assert.deepEqual(targetForDate(history, "2026-07-01"), { kcal: 2100, protein: 160 });
  });

  it("falls back to defaults on empty history", () => {
    const t = targetForDate([], "2026-06-01");
    assert.equal(typeof t.kcal, "number");
    assert.equal(typeof t.protein, "number");
  });
});
