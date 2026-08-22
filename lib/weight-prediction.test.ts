import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { predictDailyWeights, predictWeights, type WeighIn } from "./weight-prediction";

// BMR (male, 100 kg, 180 cm, 40 y) = 10*100 + 6.25*180 - 5*40 + 5 = 1930
// maintenance = 1930 * 1.2 = 2316 kcal/day
const profile = { heightCm: 180, age: 40, sex: "male" };

function intake(days: string[], kcal: number) {
  return new Map(days.map((d) => [d, kcal]));
}
const WEEK = [
  "2026-01-02",
  "2026-01-03",
  "2026-01-04",
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
  "2026-01-08",
];
const last = <T>(a: T[]): T => a[a.length - 1];

describe("predictDailyWeights", () => {
  it("predicts loss from a sustained deficit, emitting a point per day", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 99.6 },
    ];
    // 1800 in vs 2316 out → -516/day × 7 = -3612 → -0.469 kg → 99.5 by Jan 8
    const out = predictDailyWeights({
      weighIns,
      end: "2026-01-08",
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: new Map(),
      ...profile,
    });
    assert.equal(out.length, 7); // Jan 2..8
    const end = last(out);
    assert.equal(end.date, "2026-01-08");
    assert.equal(end.predicted, 99.5);
    assert.equal(end.actual, 99.6); // weigh-in day carries the measured weight
    // Intermediate days are projected-only (no weigh-in).
    assert.equal(out[0].date, "2026-01-02");
    assert.equal(out[0].actual, null);
    assert.ok(out[0].predicted < 100 && out[0].predicted > end.predicted);
  });

  it("projects forward past the last weigh-in (no actual on those days)", () => {
    const weighIns: WeighIn[] = [{ date: "2026-01-01", weight: 100 }];
    const out = predictDailyWeights({
      weighIns,
      end: "2026-01-08",
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: new Map(),
      ...profile,
    });
    assert.equal(out.length, 7); // forward projection Jan 2..8
    assert.ok(out.every((p) => p.actual === null));
    assert.equal(last(out).predicted, 99.5);
  });

  it("counts logged cardio as extra burn (more predicted loss)", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 99 },
    ];
    const cardio = new Map(WEEK.map((d) => [d, 300]));
    const out = predictDailyWeights({
      weighIns,
      end: "2026-01-08",
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: cardio,
      ...profile,
    });
    assert.ok(last(out).predicted < 99.5);
  });

  it("nets resting metabolism out of gross session calories", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 99 },
    ];
    const gross = new Map(WEEK.map((d) => [d, 600]));
    const minutes = new Map(WEEK.map((d) => [d, 60]));
    const withMinutes = predictDailyWeights({
      weighIns,
      end: "2026-01-08",
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: gross,
      cardioMinutesByDate: minutes,
      ...profile,
    });
    const withoutMinutes = predictDailyWeights({
      weighIns,
      end: "2026-01-08",
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: gross,
      ...profile,
    });
    // Netting resting out means less burn → higher predicted weight.
    assert.ok(last(withMinutes).predicted > last(withoutMinutes).predicted);
  });

  it("skips closed windows with too large a gap", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-25", weight: 98 }, // 24 days > MAX_GAP_DAYS
    ];
    const days: string[] = [];
    for (let i = 2; i <= 25; i++) days.push(`2026-01-${String(i).padStart(2, "0")}`);
    const out = predictDailyWeights({
      weighIns,
      end: "2026-01-25", // no forward horizon past the last weigh-in
      intakeByDate: intake(days, 1800),
      cardioByDate: new Map(),
      ...profile,
    });
    assert.equal(out.length, 0);
  });

  it("skips windows with insufficient food logging", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 99 },
    ];
    const out = predictDailyWeights({
      weighIns,
      end: "2026-01-08",
      intakeByDate: intake(WEEK.slice(0, 2), 1800), // only 2 of 7 days logged
      cardioByDate: new Map(),
      ...profile,
    });
    assert.equal(out.length, 0);
  });

  it("returns nothing without enough profile to compute BMR", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 99 },
    ];
    const out = predictDailyWeights({
      weighIns,
      end: "2026-01-08",
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: new Map(),
      heightCm: null,
      age: 40,
      sex: "male",
    });
    assert.equal(out.length, 0);
  });
});

describe("predictWeights (per-weigh-in endpoint view)", () => {
  it("predicts loss from a sustained deficit", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 99.6 },
    ];
    const out = predictWeights({
      weighIns,
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: new Map(),
      ...profile,
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].predicted, 99.5);
    assert.equal(out[0].actual, 99.6);
    assert.equal(out[0].gap, -0.1);
    assert.equal(out[0].windowDays, 7);
    assert.equal(out[0].perDayKcal, -516);
  });

  it("nets resting metabolism out of gross session calories", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 99 },
    ];
    const gross = new Map(WEEK.map((d) => [d, 600]));
    const minutes = new Map(WEEK.map((d) => [d, 60]));
    const withMinutes = predictWeights({
      weighIns,
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: gross,
      cardioMinutesByDate: minutes,
      ...profile,
    });
    const withoutMinutes = predictWeights({
      weighIns,
      intakeByDate: intake(WEEK, 1800),
      cardioByDate: gross,
      ...profile,
    });
    assert.ok(withMinutes[0].predicted > withoutMinutes[0].predicted);
  });

  it("skips windows too large or too sparsely logged", () => {
    const weighIns: WeighIn[] = [
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 99 },
    ];
    const sparse = predictWeights({
      weighIns,
      intakeByDate: intake(WEEK.slice(0, 2), 1800),
      cardioByDate: new Map(),
      ...profile,
    });
    assert.equal(sparse.length, 0);
  });
});
