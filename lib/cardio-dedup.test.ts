import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeSessions, type DedupSession } from "./cardio-dedup";

const ms = (iso: string) => Date.parse(iso);
const s = (
  externalId: string,
  start: string,
  end: string,
  hasDistance: boolean,
  durationMin: number,
): DedupSession => ({ externalId, startMs: ms(start), endMs: ms(end), hasDistance, durationMin });

describe("dedupeSessions", () => {
  it("keeps one of two identical sessions (the Bike double-entry)", () => {
    const { winners, loserIds } = dedupeSessions([
      s("a", "2026-06-16T05:42:26Z", "2026-06-16T05:57:28Z", false, 15),
      s("b", "2026-06-16T05:42:26Z", "2026-06-16T05:57:28Z", false, 15),
    ]);
    assert.equal(winners.length, 1);
    assert.equal(loserIds.length, 1);
  });

  it("prefers the record with distance when two copies overlap", () => {
    const { winners, loserIds } = dedupeSessions([
      s("nodist", "2026-06-16T11:26:15Z", "2026-06-16T11:48:41Z", false, 22),
      s("withdist", "2026-06-16T11:26:15Z", "2026-06-16T11:48:41Z", true, 22),
    ]);
    assert.deepEqual(
      winners.map((w) => w.externalId),
      ["withdist"],
    );
    assert.deepEqual(loserIds, ["nodist"]);
  });

  it("collapses the impossible overlapping walks into one", () => {
    // 17:57 for 19 min and 18:01 for 11 min — second starts inside the first.
    const { winners, loserIds } = dedupeSessions([
      s("long", "2026-06-21T15:57:21Z", "2026-06-21T16:16:21Z", false, 19),
      s("short", "2026-06-21T16:01:33Z", "2026-06-21T16:12:33Z", true, 11),
    ]);
    assert.equal(winners.length, 1);
    assert.equal(winners[0].externalId, "short"); // the one with distance
    assert.deepEqual(loserIds, ["long"]);
  });

  it("leaves genuinely separate sessions alone", () => {
    const { winners, loserIds } = dedupeSessions([
      s("morning", "2026-06-16T05:42:00Z", "2026-06-16T05:57:00Z", false, 15),
      s("noon", "2026-06-16T11:26:00Z", "2026-06-16T11:48:00Z", true, 22),
      s("afternoon", "2026-06-16T13:36:00Z", "2026-06-16T14:06:00Z", true, 29),
    ]);
    assert.equal(winners.length, 3);
    assert.equal(loserIds.length, 0);
  });

  it("is deterministic regardless of input order", () => {
    const a = s("a", "2026-06-16T05:42:00Z", "2026-06-16T05:57:00Z", false, 15);
    const b = s("b", "2026-06-16T05:42:00Z", "2026-06-16T05:57:00Z", false, 15);
    const r1 = dedupeSessions([a, b]);
    const r2 = dedupeSessions([b, a]);
    assert.deepEqual(r1.loserIds, r2.loserIds);
  });
});
