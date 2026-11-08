import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLength, parseRoomSize, parseArea } from "../src/studio/plan/units.js";

test("feet and inches in the usual plan forms", () => {
  assert.equal(parseLength("12'-0\""), 366);
  assert.equal(parseLength("13'"), 396);
  assert.equal(parseLength("9'9\""), 297);
  assert.equal(parseLength("14'6\""), 442);
  assert.equal(parseLength("10'-6\""), 320);
  assert.equal(parseLength("12′ 6″"), 381);
});

test("metric lengths", () => {
  assert.equal(parseLength("3.5 m"), 350);
  assert.equal(parseLength("350cm"), 350);
  assert.equal(parseLength("3500 mm"), 350);
});

test("text without a unit is not a length", () => {
  assert.equal(parseLength("12"), null);
  assert.equal(parseLength("Den"), null);
  assert.equal(parseLength(""), null);
});

test("room sizes", () => {
  assert.deepEqual(parseRoomSize("12'-0\" X 29'-10\""), [366, 909]);
  assert.deepEqual(parseRoomSize("13' x 16'"), [396, 488]);
  assert.deepEqual(parseRoomSize("9'9\" X 9'"), [297, 274]);
  assert.deepEqual(parseRoomSize("12'8\" x 9'3\""), [386, 282]);
  assert.deepEqual(parseRoomSize("3.5 x 4 m"), [350, 400]);
  assert.deepEqual(parseRoomSize("350x400cm"), [350, 400]);
  assert.equal(parseRoomSize("LIVING / DINING"), null);
  assert.equal(parseRoomSize(null), null);
});

test("written areas", () => {
  assert.equal(parseArea("64 sq ft"), 5.95);
  assert.equal(parseArea("64 sqft"), 5.95);
  assert.equal(parseArea("64 ft²"), 5.95);
  assert.equal(parseArea("12 m²"), 12);
  assert.equal(parseArea("12 m2"), 12);
  assert.equal(parseArea("12 sq m"), 12);
  assert.equal(parseArea("LIVING"), null);
  assert.equal(parseArea("64"), null);
  assert.equal(parseArea("1,200 sq ft"), 111.48);
  assert.equal(parseArea("12,5 m²"), 12.5);
});
