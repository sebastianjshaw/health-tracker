import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bodyCompSeries,
  fatMass,
  ffmi,
  latestBodyComposition,
  leanBodyMass,
  metabolicAge,
} from "./metabolic-age";

describe("leanBodyMass", () => {
  it("subtracts fat mass", () => {
    assert.equal(leanBodyMass(100, 25), 75);
  });
  it("is null without a valid body-fat reading", () => {
    assert.equal(leanBodyMass(100, null), null);
    assert.equal(leanBodyMass(100, 100), null);
    assert.equal(leanBodyMass(null, 20), null);
  });
});

describe("metabolicAge", () => {
  const base = { weightKg: 112.4, heightCm: 180, sex: "male" };

  it("estimates from body composition (higher fat reads older)", () => {
    const lean = metabolicAge({ ...base, bodyFatPct: 18 })!;
    const fat = metabolicAge({ ...base, bodyFatPct: 31 })!;
    assert.ok(fat > lean, `expected ${fat} > ${lean}`);
  });

  it("returns a plausible figure for real inputs", () => {
    const age = metabolicAge({ ...base, bodyFatPct: 31.1 })!;
    assert.ok(age >= 35 && age <= 50, `got ${age}`);
  });

  it("clamps to the 18–80 range", () => {
    assert.equal(metabolicAge({ ...base, bodyFatPct: 3 }), 18); // implausibly lean
    assert.ok(metabolicAge({ weightKg: 60, heightCm: 180, sex: "male", bodyFatPct: 55 })! <= 80);
  });

  it("needs height and a body-fat reading", () => {
    assert.equal(metabolicAge({ ...base, bodyFatPct: null }), null);
    assert.equal(metabolicAge({ weightKg: 112, heightCm: null, sex: "male", bodyFatPct: 25 }), null);
  });
});

describe("fatMass / ffmi", () => {
  it("fat mass is weight minus lean", () => {
    assert.equal(fatMass(100, 25), 25);
    assert.equal(fatMass(100, null), null);
  });
  it("FFMI = lean / height² (kg/m²)", () => {
    // lean 80 kg at 2.0 m → 20.0
    assert.equal(ffmi(100, 20, 200), 20);
    assert.equal(ffmi(100, 20, null), null);
  });
});

describe("bodyCompSeries", () => {
  it("emits fat/lean split only for readings with both figures", () => {
    const s = bodyCompSeries([
      { date: "2026-06-01", weight: 100, bodyFat: 25 },
      { date: "2026-06-02", weight: 99, bodyFat: null }, // skipped
    ]);
    assert.equal(s.length, 1);
    assert.deepEqual(s[0], { date: "2026-06-01", fatKg: 25, leanKg: 75 });
  });
});

describe("latestBodyComposition", () => {
  const profile = { heightCm: 180, sex: "male" };

  it("uses the latest reading that has BOTH weight and body fat", () => {
    // newest-first; the newest row lacks body fat, so it must skip to 06-19.
    const bc = latestBodyComposition(
      [
        { date: "2026-06-21", weightKg: 112, bodyFatPct: null },
        { date: "2026-06-19", weightKg: 110, bodyFatPct: 30 },
        { date: "2026-06-10", weightKg: 113, bodyFatPct: 32 },
      ],
      profile,
    )!;
    assert.equal(bc.date, "2026-06-19");
    assert.equal(bc.leanMassKg, 77); // 110 × 0.70
    assert.ok(bc.metabolicAge != null);
  });

  it("derives lean mass and metabolic age from the same row", () => {
    const row = { date: "2026-06-19", weightKg: 110, bodyFatPct: 30 };
    const bc = latestBodyComposition([row], profile)!;
    assert.equal(bc.leanMassKg, leanBodyMass(row.weightKg, row.bodyFatPct));
    assert.equal(
      bc.metabolicAge,
      metabolicAge({ weightKg: row.weightKg, heightCm: 180, bodyFatPct: row.bodyFatPct, sex: "male" }),
    );
  });

  it("is null when no reading carries both figures", () => {
    assert.equal(
      latestBodyComposition(
        [
          { date: "2026-06-21", weightKg: 112, bodyFatPct: null },
          { date: "2026-06-19", weightKg: null, bodyFatPct: 30 },
        ],
        profile,
      ),
      null,
    );
  });
});
