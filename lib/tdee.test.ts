import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { measuredTdee } from "./tdee";
import { KCAL_PER_KG } from "./weight-prediction";

/** Build a 28-day window losing `kgPerWeek` at a steady intake. */
function window(kgPerWeek: number, intake: number, startWeight = 100) {
  const weighIns: { date: string; weight: number }[] = [];
  const intakeByDate = new Map<string, number>();
  for (let i = 0; i < 28; i++) {
    const date = `2026-06-${String(i + 1).padStart(2, "0")}`;
    weighIns.push({ date, weight: Math.round((startWeight + (kgPerWeek / 7) * i) * 100) / 100 });
    intakeByDate.set(date, intake);
  }
  return { weighIns, intakeByDate, today: "2026-06-28" };
}

describe("measuredTdee", () => {
  it("recovers maintenance: a flat weight at intake X means TDEE ≈ X", () => {
    const { weighIns, intakeByDate, today } = window(0, 2400);
    const est = measuredTdee({ weighIns, intakeByDate, today })!;
    assert.ok(Math.abs(est.tdee - 2400) <= 10, `got ${est.tdee}`);
    assert.equal(est.trendKgPerWeek, 0);
  });

  it("a deficit reads TDEE above intake", () => {
    // losing 0.5 kg/week ≈ 550 kcal/day deficit
    const { weighIns, intakeByDate, today } = window(-0.5, 2000);
    const est = measuredTdee({ weighIns, intakeByDate, today })!;
    const expected = 2000 + (0.5 / 7) * KCAL_PER_KG;
    assert.ok(Math.abs(est.tdee - expected) <= 15, `got ${est.tdee}, expected ~${expected}`);
    assert.ok(est.tdee > est.meanIntake);
  });

  it("is null on too short a span or too little logging", () => {
    const short = window(0, 2400);
    short.weighIns = short.weighIns.slice(0, 3); // ~2 days span
    assert.equal(measuredTdee({ ...short, today: short.weighIns[2].date }), null);

    const sparse = window(0, 2400);
    // log only 5 of 28 days
    const kept = new Map([...sparse.intakeByDate].slice(0, 5));
    assert.equal(measuredTdee({ ...sparse, intakeByDate: kept }), null);
  });
});
