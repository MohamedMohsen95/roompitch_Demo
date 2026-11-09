import { test } from "node:test";
import assert from "node:assert/strict";
import { newFlat } from "../src/studio/plan/flat.js";
import { realOf, materialize, realSpace, rescale, syncTracing, realDiff, realOverlaps, resetReal } from "../src/studio/plan/real.js";

test("realOf derives tracing × scale and keeps clockwise polys", () => {
  const f = {...newFlat({w:100, h:100}), scale:0.05, spaces:[{id:"a", outline:[[0, 0], [0, 40], [60, 40], [60, 0]]}], openings:[{id:"d", a:[60, 10], b:[60, 20]}]};
  const r = realOf(f);
  assert.deepEqual(r.spaces[0].poly, [[0, 0], [3, 0], [3, 2], [0, 2]]);
  assert.deepEqual(r.openings[0], {id:"d", a:[3, 0.5], b:[3, 1]});
  assert.deepEqual(r.confirmed, []);
  assert.deepEqual(realSpace(f, "a").poly, [[0, 0], [3, 0], [3, 2], [0, 2]]);
  assert.equal(realSpace(f, "zz"), null);
});

test("realOf with no scale is empty, and materialize keeps a set real", () => {
  assert.deepEqual(realOf(newFlat({w:10, h:10})).spaces, []);
  const f = {...newFlat({w:10, h:10}), scale:1, real:{spaces:[{id:"x", poly:[[0, 0], [1, 0], [1, 1]]}], openings:[], confirmed:["x"]}};
  assert.equal(materialize(f), f);
  const g = {...newFlat({w:10, h:10}), scale:0.5, spaces:[{id:"a", outline:[[0, 0], [2, 0], [2, 2], [0, 2]]}]};
  assert.deepEqual(materialize(g).real.spaces[0].poly, [[0, 0], [1, 0], [1, 1], [0, 1]]);
});

test("newFlat is v2 with no real flat", () => {
  const f = newFlat({w:10, h:10});
  assert.deepEqual([f.v, f.scaleAsked, f.real], [2, false, null]);
});

// rooms a (0..60 px) and b (60..120 px), 40 px tall, scale 0.05 m/px
function two(){
  return {...newFlat({w:200, h:100}), scale:0.05, scaleFrom:"wall",
    spaces:[{id:"a", outline:[[0, 0], [60, 0], [60, 40], [0, 40]]}, {id:"b", outline:[[60, 0], [120, 0], [120, 40], [60, 40]]}], openings:[]};
}
const shift = (f, id, dx) => ({...f, real:{...f.real, spaces:f.real.spaces.map(s => s.id === id ? {...s, poly:s.poly.map(([x, y]) => [x + dx, y])} : s)}});

test("rescale keeps corrections, scaled, and leaves the tracing", () => {
  const f = materialize(two());
  const g = {...f, real:{...f.real, spaces:f.real.spaces.map(s => s.id === "a" ? {...s, poly:s.poly.map(([x, y]) => [x * 1.1, y])} : s)}};
  const h = rescale(g, 2);
  assert.equal(h.scale, 0.1);
  assert.deepEqual(h.spaces, g.spaces);
  assert.ok(Math.abs(h.real.spaces[0].poly[1][0] - 2 * g.real.spaces[0].poly[1][0]) < 1e-9);
  const plain = rescale(two(), 2);
  assert.equal(plain.real ?? null, null);
  assert.equal(plain.scale, 0.1);
});

test("a tracing edit that adds a corner rebuilds only that room", () => {
  const moved = shift(materialize(two()), "b", 0.1);
  const next = {...moved, spaces:moved.spaces.map(s => s.id === "a" ? {...s, outline:[[0, 0], [30, 0], [60, 0], [60, 40], [0, 40]]} : s)};
  const r = syncTracing(moved, next).real;
  assert.equal(r.spaces.find(s => s.id === "a").poly.length, 5);
  assert.deepEqual(r.spaces.find(s => s.id === "b").poly, moved.real.spaces.find(s => s.id === "b").poly);
});

test("a dragged tracing corner moves the same real corner by the same amount × scale", () => {
  const moved = shift(materialize(two()), "b", 0.1);
  const next = {...moved, spaces:moved.spaces.map(s => s.id === "b" ? {...s, outline:[[60, 0], [130, 0], [120, 40], [60, 40]]} : s)};
  const b = syncTracing(moved, next).real.spaces.find(s => s.id === "b").poly;
  assert.deepEqual(b[1], [6.6, 0]);          // 6.1 (corrected) + 10 px × 0.05
  assert.deepEqual(b[0], [3.1, 0]);
});

test("spaces added or removed on the tracing follow; no real flat = no change", () => {
  const f = materialize(two());
  const added = syncTracing(f, {...f, spaces:[...f.spaces, {id:"c", outline:[[0, 50], [20, 50], [20, 70], [0, 70]]}]});
  assert.deepEqual(realSpace(added, "c").poly, [[0, 2.5], [1, 2.5], [1, 3.5], [0, 3.5]]);
  const g = {...f, real:{...f.real, confirmed:["a"]}};
  const removed = syncTracing(g, {...g, spaces:g.spaces.filter(s => s.id !== "a")});
  assert.equal(realSpace(removed, "a"), null);
  assert.deepEqual(removed.real.confirmed, []);
  const plain = two();
  assert.equal(syncTracing(plain, {...plain, spaces:[]}).real ?? null, null);
});

test("realDiff and realOverlaps", () => {
  const f = shift(materialize(two()), "b", -0.1);
  assert.deepEqual([...realDiff(f)], ["b"]);
  assert.deepEqual(realOverlaps(f), [["a", "b"]]);
  assert.deepEqual([...realDiff(two())], []);
  assert.deepEqual(realOverlaps(materialize(two())), []);
});

test("resetReal drops real and keeps scaleAsked", () => {
  const f = {...shift(materialize(two()), "b", 0.1), scaleAsked:true};
  const r = resetReal(f);
  assert.equal(r.real, null);
  assert.equal(r.scaleAsked, true);
});

test("planLayout: stacked for wide or square plans, side by side for tall ones", async () => {
  const { planLayout } = await import("../src/studio/plan/real.js");
  assert.equal(planLayout({w:1200, h:800}), "stacked");
  assert.equal(planLayout({w:785, h:768}), "stacked");
  assert.equal(planLayout({w:700, h:900}), "side");
});
