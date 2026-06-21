import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currentStreak, longestStreak, type DayFlag } from "./streaks";

/** Map a bit-string to consecutive days starting 2026-06-15. */
const days = (bits: string): DayFlag[] =>
  bits.split("").map((ch, i) => ({
    date: `2026-06-${String(15 + i).padStart(2, "0")}`,
    value: ch === "1",
  }));

describe("currentStreak", () => {
  it("counts the run ending today", () => {
    // 15..21; today=21; trailing 19,20,21 true
    assert.equal(currentStreak(days("1100111"), "2026-06-21"), 3);
  });

  it("falls back to yesterday when today isn't logged yet", () => {
    // 15..20 all true; today (21) absent from the data → counts back from 20
    assert.equal(currentStreak(days("111111"), "2026-06-21"), 6);
  });

  it("is zero when today is logged false and yesterday too", () => {
    // 15..18; 17,18 false; today=18
    assert.equal(currentStreak(days("1100"), "2026-06-18"), 0);
  });
});

describe("longestStreak", () => {
  it("finds the longest consecutive run", () => {
    assert.equal(longestStreak(days("11011110")), 4);
  });
  it("breaks runs on calendar gaps", () => {
    assert.equal(
      longestStreak([
        { date: "2026-06-01", value: true },
        { date: "2026-06-02", value: true },
        { date: "2026-06-05", value: true }, // 2-day gap resets the run
      ]),
      2,
    );
  });
});
