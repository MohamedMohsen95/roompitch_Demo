import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLength, parseRoomSize } from "../src/studio/plan/units.js";

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
