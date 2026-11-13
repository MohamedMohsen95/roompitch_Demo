import { test } from "node:test";
import assert from "node:assert/strict";
import { readPng } from "./helpers/png.js";

test("readPng reads a fixture plan as RGBA", () => {
  const img = readPng("tests/fixtures/plans/src/etsy.png");
  assert.deepEqual([img.w, img.h], [1600, 1473]);
  assert.equal(img.data.length, img.w * img.h * 4);
  const i = (5 * img.w + 5) * 4;
  assert.ok(img.data[i] > 200 && img.data[i + 1] > 200 && img.data[i + 2] > 200 && img.data[i + 3] === 255);
});

test("readPng reads the cv2-written variants (other colour types and filters)", () => {
  for (const f of ["arcmax_rot3", "ex4_scan", "east_nolabels"]){
    const img = readPng(`tests/fixtures/plans/${f}.png`);
    assert.equal(img.data.length, img.w * img.h * 4);
    assert.ok(img.w > 100 && img.h > 100);
  }
});
