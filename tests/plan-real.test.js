import { test } from "node:test";
import assert from "node:assert/strict";
import { newFlat } from "../src/studio/plan/flat.js";
import { realOf, materialize, realSpace } from "../src/studio/plan/real.js";

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
