import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paperColor, contrastMask, openLine, closeLine, openSquare, components, floodFromEdges, dominantAngle, rotateImg, rotatePoint
} from "../src/studio/plan/raster.js";

// A white image with a black rectangle outline of the given thickness.
function rectImg(w, h, [x0, y0, x1, y1], t, {alphaOutside = false} = {}){
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const inBox = x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const onEdge = inBox && (x < x0 + t || x > x1 - t || y < y0 + t || y > y1 - t);
    const i = (y * w + x) * 4;
    if (onEdge){ data[i] = data[i + 1] = data[i + 2] = 0; }
    if (alphaOutside && !inBox) data[i + 3] = 0;
  }
  return {w, h, data};
}
const at = (mk, x, y) => mk.m[y * mk.w + x];
const count = (mk) => mk.m.reduce((s, v) => s + v, 0);
function maskOf(w, h, fn){ const m = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = fn(x, y) ? 1 : 0; return {w, h, m}; }

test("contrast mask: dark lines on paper, transparent counts as paper", () => {
  const img = rectImg(40, 30, [5, 5, 34, 24], 3);
  const paper = paperColor(img);
  assert.deepEqual(paper, [255, 255, 255]);
  const mk = contrastMask(img, paper, 60);
  assert.equal(at(mk, 6, 15), 1);
  assert.equal(at(mk, 20, 15), 0);
  assert.equal(at(mk, 1, 1), 0);
  const withAlpha = contrastMask(rectImg(40, 30, [5, 5, 34, 24], 3, {alphaOutside:true}), paper, 60);
  assert.deepEqual(withAlpha.m, mk.m);
  const clear = {w:10, h:10, data:new Uint8ClampedArray(400)};             // fully transparent black
  assert.deepEqual(paperColor(clear), [255, 255, 255]);
  assert.equal(count(contrastMask(clear, [255, 255, 255], 60)), 0);
});

test("line opening keeps lines along the direction; line closing bridges short gaps only", () => {
  const mk = contrastMask(rectImg(40, 30, [5, 5, 34, 24], 3), [255, 255, 255], 60);
  const h = openLine(mk, 10, "h");
  assert.equal(at(h, 20, 6), 1);
  assert.equal(at(h, 6, 15), 0);
  const v = openLine(mk, 10, "v");
  assert.equal(at(v, 6, 15), 1);
  assert.equal(at(v, 20, 6), 0);
  const gap5 = maskOf(30, 3, (x, y) => y === 1 && (x < 10 || x > 14));
  assert.equal(at(closeLine(gap5, 6, "h"), 12, 1), 1);
  const gap7 = maskOf(30, 3, (x, y) => y === 1 && (x < 10 || x > 16));
  assert.equal(at(closeLine(gap7, 6, "h"), 13, 1), 0);
  assert.equal(at(closeLine(gap5, 6, "h"), 12, 0), 0);
});

test("square opening drops thin lines and keeps thick ones", () => {
  const mk = maskOf(30, 30, (x, y) => (y >= 5 && y < 11) || x === 20);
  const o = openSquare(mk, 4);
  assert.equal(at(o, 15, 7), 1);
  assert.equal(at(o, 20, 20), 0);
});

test("components and flooding from the edges", () => {
  const two = maskOf(20, 10, (x, y) => (x < 4 && y < 4) || (x > 10 && x < 15 && y > 2 && y < 8));
  const c = components(two);
  assert.equal(c.count, 2);
  assert.deepEqual(c.stats.map(s => s.area).sort((a, b) => a - b), [16, 20]);
  const ring = maskOf(20, 20, (x, y) => x >= 4 && x <= 15 && y >= 4 && y <= 15 && (x === 4 || x === 15 || y === 4 || y === 15));
  const free = {w:20, h:20, m:ring.m.map(v => 1 - v)};
  const out = floodFromEdges(free);
  assert.equal(at(out, 0, 0), 1);
  assert.equal(at(out, 10, 10), 0);
  assert.equal(at(out, 4, 4), 0);
});

test("dominant angle of a rotated rectangle, and rotating points there and back", () => {
  const img = rectImg(200, 160, [30, 30, 170, 130], 4);
  const rotated = rotateImg(img, 3);
  const mk = contrastMask(rotated, [255, 255, 255], 60);
  assert.ok(Math.abs(dominantAngle(mk) - 3) < 0.3);
  assert.ok(Math.abs(dominantAngle(contrastMask(img, [255, 255, 255], 60))) < 0.3);
  const size = {w:200, h:160};
  const p = rotatePoint([50, 40], 3, size, size), q = rotatePoint(p, -3, size, size);
  assert.ok(Math.hypot(q[0] - 50, q[1] - 40) < 1);
  // The rectangle's top-left corner lands where the rotated image has its dark corner.
  const c = rotatePoint([32, 32], 3, size, size).map(Math.round);
  assert.equal(at(mk, c[0], c[1]), 1);
});
