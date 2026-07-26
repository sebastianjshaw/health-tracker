import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isReusableFoodMatch, namesRelated, normalizeFoodName, nutritionMatches } from "./food-match";

const coke = { name: "Coca Cola", kcal: 139, protein: 0, carbs: 35, fat: 0 };

describe("normalizeFoodName", () => {
  it("lowercases, decodes entities, strips punctuation", () => {
    assert.equal(normalizeFoodName("Coke, 330ml"), "coke 330ml");
    assert.equal(normalizeFoodName("A&amp;W Root Beer"), "a w root beer");
  });
});

describe("namesRelated", () => {
  it("matches equal, substring, and high token overlap", () => {
    assert.ok(namesRelated("coke", "coke 330ml")); // substring
    assert.ok(namesRelated("latte", "iced latte"));
    assert.ok(namesRelated("a w root beer 355ml", "a w root beer 330ml")); // 4/6 tokens
  });
  it("rejects items that merely share a short word", () => {
    assert.ok(!namesRelated("a w sarsaparilla", "a w root beer 355ml")); // only a/w shared
    assert.ok(!namesRelated("multivitamin", "water"));
  });
});

describe("nutritionMatches", () => {
  it("accepts near-identical per-serving nutrition", () => {
    assert.ok(nutritionMatches({ kcal: 140, protein: 0, carbs: 35, fat: 0 }, coke));
  });
  it("rejects a different portion of the same item", () => {
    // "Coke x2" 280 kcal must not match the single 139 kcal Coke.
    assert.ok(!nutritionMatches({ kcal: 280, protein: 0, carbs: 70, fat: 0 }, coke));
  });
});

describe("isReusableFoodMatch", () => {
  it("reuses a wording/size variant of the same item", () => {
    // Same base word, extra size qualifier → reused.
    assert.ok(
      isReusableFoodMatch(
        { name: "Coke, 330ml", kcal: 140, protein: 0, carbs: 35, fat: 0 },
        { name: "Coke", kcal: 139, protein: 0, carbs: 35, fat: 0 },
      ),
    );
    assert.ok(
      isReusableFoodMatch(
        { name: "Iced latte", kcal: 180, protein: 9, carbs: 14, fat: 9 },
        { name: "Latte", kcal: 180, protein: 9, carbs: 14, fat: 9 },
      ),
    );
  });
  it("stays conservative: cross-synonym names with no shared word are NOT merged", () => {
    // "Coke" vs "Coca Cola" share no token, so we create rather than risk a wrong
    // match. Better an occasional duplicate than a mislogged item.
    assert.ok(
      !isReusableFoodMatch(
        { name: "Coke", kcal: 140, protein: 0, carbs: 35, fat: 0 },
        coke,
      ),
    );
  });
  it("does NOT merge different drinks with identical nutrition", () => {
    assert.ok(
      !isReusableFoodMatch(
        { name: "A&W Sarsaparilla", kcal: 170, protein: 0, carbs: 44, fat: 0 },
        { name: "A&W Root Beer, 355ml", kcal: 170, protein: 0, carbs: 44, fat: 0 },
      ),
    );
  });
  it("does NOT merge a related name with different nutrition (home-made latte)", () => {
    assert.ok(
      !isReusableFoodMatch(
        { name: "Latte", kcal: 180, protein: 9, carbs: 14, fat: 9 },
        { name: "Latte (Home Made)", kcal: 136, protein: 9, carbs: 14, fat: 5 },
      ),
    );
  });
  it("does NOT merge distinct zero-calorie items", () => {
    assert.ok(
      !isReusableFoodMatch(
        { name: "Multivitamin", kcal: 0, protein: 0, carbs: 0, fat: 0 },
        { name: "Water", kcal: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    );
  });
});
