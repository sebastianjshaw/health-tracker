import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bodyCompSeries,
  compositionBars,
  fatMass,
  ffmi,
  latestBodyComposition,
  leanBodyMass,
  metabolicAge,
} from "./metabolic-age";

describe("compositionBars", () => {
  it("splits measured days into fat/lean/bone that sum to weight", () => {
    const [bar] = compositionBars([
      { date: "2026-06-24", weight: 112, bodyFat: 31.5, leanMass: 76.7, boneMass: 3.8 },
    ]);
    assert.equal(bar.fatKg, 35.3); // 112 − 76.7 fat-free
    assert.equal(bar.leanKg, 72.9); // 76.7 fat-free − 3.8 bone
    assert.equal(bar.boneKg, 3.8);
    assert.equal(bar.fatKg + bar.leanKg + bar.boneKg, 112);
  });

  it("falls back to bf-derived fat-free with zero bone when only weight+bf", () => {
    const [bar] = compositionBars([{ date: "2026-06-19", weight: 110, bodyFat: 30 }]);
    assert.equal(bar.fatKg, 33); // 110 × 0.30
    assert.equal(bar.leanKg, 77); // fat-free, no bone to split out
    assert.equal(bar.boneKg, 0);
  });

  it("skips weigh-ins with no fat/lean split", () => {
    assert.deepEqual(compositionBars([{ date: "2026-06-15", weight: 113, bodyFat: null }]), []);
  });
});

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

  it("ages an obese reading past chronological (fat penalty bites)", () => {
    // 112.4 kg / 31.1% bf / 180 cm male: lean base ~42, + fat penalty ~13 ⇒ mid-50s.
    const age = metabolicAge({ ...base, weightKg: 112.4, bodyFatPct: 31.1 })!;
    assert.ok(age >= 52 && age <= 60, `got ${age}`);
  });

  it("does not penalise a healthy body fat", () => {
    // at/under the healthy midpoint, only the lean base applies
    const lean = metabolicAge({ weightKg: 80, heightCm: 180, sex: "male", bodyFatPct: 14 })!;
    const fatter = metabolicAge({ weightKg: 80, heightCm: 180, sex: "male", bodyFatPct: 28 })!;
    assert.ok(fatter > lean + 5, `expected the fat penalty to add years: ${lean} → ${fatter}`);
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

  it("prefers a scale-measured lean mass over the bf-derived estimate", () => {
    // Newest row has measured fat-free mass but NO body fat — still usable, and
    // its measured lean (76) beats the older row's derived 77 (110×0.70).
    const bc = latestBodyComposition(
      [
        { date: "2026-06-21", weightKg: 112, bodyFatPct: null, leanMassKg: 76, muscleMassKg: 72, boneMassKg: 3.2 },
        { date: "2026-06-19", weightKg: 110, bodyFatPct: 30 },
      ],
      profile,
    )!;
    assert.equal(bc.date, "2026-06-21");
    assert.equal(bc.leanMassKg, 76);
    assert.equal(bc.fatMassKg, 36); // 112 − 76
    assert.equal(bc.muscleMassKg, 72);
    assert.equal(bc.boneMassKg, 3.2);
    assert.equal(bc.measured, true);
    assert.equal(bc.metabolicAge, null); // no body fat → can't compute the penalty
  });

  it("flags estimated lean (no measured value) as measured:false", () => {
    const bc = latestBodyComposition([{ date: "2026-06-19", weightKg: 110, bodyFatPct: 30 }], profile)!;
    assert.equal(bc.measured, false);
    assert.equal(bc.muscleMassKg, null);
  });
});
