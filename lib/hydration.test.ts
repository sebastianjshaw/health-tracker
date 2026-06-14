import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateWaterMl, totalWaterMl, waterSourceOf } from "./hydration";

const base = { protein: 0, carbs: 0, fat: 0, category: "food" as string | null };

describe("estimateWaterMl", () => {
  it("water = mass − dry macros for a g entry", () => {
    // 100 g chicken, 30 g protein → 70 mL water
    assert.equal(
      estimateWaterMl({ ...base, servingSize: 100, servingUnit: "g", quantity: 1, protein: 30 }),
      70,
    );
  });

  it("scales mass and macros by quantity (ml)", () => {
    // 330 ml milkshake, 40 g dry → 290 mL
    assert.equal(
      estimateWaterMl({
        ...base,
        servingSize: 330,
        servingUnit: "ml",
        quantity: 1,
        carbs: 35,
        fat: 5,
      }),
      290,
    );
  });

  it("clamps to zero when macros exceed mass", () => {
    assert.equal(
      estimateWaterMl({ ...base, servingSize: 10, servingUnit: "g", quantity: 1, fat: 50 }),
      0,
    );
  });

  it("falls back to a drink volume when there's no g/ml mass", () => {
    // a 'serving' drink → 250 ml × 0.95
    assert.equal(
      estimateWaterMl({ ...base, category: "drink", servingSize: 1, servingUnit: "serving", quantity: 2 }),
      Math.round(250 * 2 * 0.95),
    );
    // a 'Can' → 330 ml × 0.95
    assert.equal(
      estimateWaterMl({ ...base, category: "drink", servingSize: 1, servingUnit: "Can", quantity: 1 }),
      Math.round(330 * 0.95),
    );
  });

  it("returns 0 for a no-mass non-drink (e.g. a tablet or '1 serving' solid)", () => {
    assert.equal(
      estimateWaterMl({ ...base, servingSize: 1, servingUnit: "tablet", quantity: 1 }),
      0,
    );
  });

  it("classifies water source: plain water vs other drink vs food", () => {
    const drink = { servingSize: 250, servingUnit: "ml", quantity: 1, protein: 0, carbs: 0, fat: 0 };
    assert.equal(waterSourceOf({ ...drink, category: "drink", name: "Sparkling water" }), "water");
    assert.equal(waterSourceOf({ ...drink, category: "drink", name: "Vatten" }), "water");
    assert.equal(waterSourceOf({ ...drink, category: "drink", name: "Latte" }), "drink");
    assert.equal(waterSourceOf({ ...drink, category: "food", name: "Watermelon" }), "food");
  });

  it("sums a day's entries", () => {
    const water = totalWaterMl([
      { ...base, servingSize: 250, servingUnit: "ml", quantity: 1 }, // 250
      { ...base, servingSize: 100, servingUnit: "g", quantity: 1, protein: 20 }, // 80
    ]);
    assert.equal(water, 330);
  });
});
