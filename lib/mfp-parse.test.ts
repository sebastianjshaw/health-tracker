import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapCardioType,
  mapMeal,
  num,
  parseWorkbook,
} from "../scripts/lib/mfp-parse";

describe("mapMeal", () => {
  it("maps MFP meals onto the four-meal model, Daily Food → snacks", () => {
    assert.equal(mapMeal("Breakfast"), "breakfast");
    assert.equal(mapMeal("Lunch"), "lunch");
    assert.equal(mapMeal("Dinner"), "dinner");
    assert.equal(mapMeal("Snacks"), "snacks");
    assert.equal(mapMeal("Daily Food"), "snacks");
    assert.equal(mapMeal(undefined), "snacks");
    assert.equal(mapMeal("anything else"), "snacks");
  });
});

describe("mapCardioType", () => {
  it("classifies descriptions into cardio types", () => {
    assert.equal(mapCardioType("Running (jogging), 6 mph (10 min mile)"), "run");
    assert.equal(mapCardioType("Bicycling, 12-14 mph, moderate"), "bike");
    assert.equal(mapCardioType("Walking, 4.0 mph, very brisk pace"), "walk");
    assert.equal(mapCardioType("Rowing machine, vigorous"), "row");
    assert.equal(mapCardioType("Swimming laps, freestyle"), "swim");
    assert.equal(mapCardioType("Elliptical Trainer"), "other");
  });
});

describe("num", () => {
  it("parses numbers, blanks/garbage → null", () => {
    assert.equal(num("485"), 485);
    assert.equal(num("6.8"), 6.8);
    assert.equal(num(""), null);
    assert.equal(num(undefined), null);
    assert.equal(num("n/a"), null);
  });
});

describe("parseWorkbook", () => {
  it("keys data rows by the header row (row 2) and decodes entities", () => {
    const ss =
      '<sst><si><t>username</t></si><si><t>item_type</t></si><si><t>description</t></si>' +
      "<si><t>Bacon &amp; Chips</t></si><si><t>Foods</t></si></sst>";
    // Row 1 = title, Row 2 = header (username,item_type,description), Row 3 = data.
    const sheet =
      "<worksheet><sheetData>" +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>title</t></is></c></row>' +
      '<row r="2"><c r="B2" t="s"><v>0</v></c><c r="C2" t="s"><v>1</v></c><c r="D2" t="s"><v>2</v></c></row>' +
      '<row r="3"><c r="C3" t="s"><v>4</v></c><c r="D3" t="s"><v>3</v></c></row>' +
      "</sheetData></worksheet>";
    const { records } = parseWorkbook(ss, sheet);
    assert.equal(records.length, 1);
    assert.equal(records[0]["item_type"], "Foods");
    assert.equal(records[0]["description"], "Bacon & Chips");
  });
});
