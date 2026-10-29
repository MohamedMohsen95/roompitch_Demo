import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newFlat, orientCW, outlineProblem, scaleFromSizes, scaleFromWall, snapPoint, wallLengthsCm, setWallLengthCm
} from "../src/studio/plan/flat.js";

const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const space = (id, outline, sizeText) => ({id, name:id, outline, sizeText, status:"todo", design:null, fromAI:false});

test("a new flat has no spaces, no scale and a 280 cm ceiling", () => {
  const f = newFlat({w:800, h:600});
  assert.deepEqual([f.v, f.spaces, f.openings, f.scale, f.H], [1, [], [], null, 2.8]);
  assert.deepEqual(f.image, {w:800, h:600});
});

test("orientCW turns an outline clockwise from its top-left corner", () => {
  const ccw = [[0, 10], [10, 10], [10, 0], [0, 0]];
  assert.deepEqual(orientCW(ccw), [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.deepEqual(orientCW(box(0, 0, 10, 10)), box(0, 0, 10, 10));
});

test("outlineProblem catches too few corners and crossing outlines", () => {
  assert.equal(outlineProblem([[0, 0], [10, 0]]), "tooFewCorners");
  assert.equal(outlineProblem([[0, 0], [10, 10], [10, 0], [0, 10]]), "crossing");
  assert.equal(outlineProblem(box(0, 0, 10, 10)), null);
});

test("scale comes from written sizes, and a size that disagrees is flagged", () => {
  const f = newFlat({w:1000, h:1000});
  f.spaces = [
    space("a", box(0, 0, 100, 200), "10' x 20'"),
    space("b", box(200, 0, 150, 150), "15' x 15'"),
    space("c", box(400, 0, 120, 100), "12' x 10'")
  ];
  let r = scaleFromSizes(f);
  assert.ok(Math.abs(r.scale - 0.03048) < 1e-4);
  assert.deepEqual(r.flagged, []);
  f.spaces.push(space("d", box(600, 0, 100, 100), "30' x 30'"));
  r = scaleFromSizes(f);
  assert.ok(Math.abs(r.scale - 0.03048) < 1e-4);
  assert.deepEqual(r.flagged, ["d"]);
});

test("no readable size means no scale", () => {
  const f = newFlat({w:100, h:100});
  f.spaces = [space("a", box(0, 0, 50, 50), null)];
  assert.equal(scaleFromSizes(f).scale, null);
});

test("scale from one wall", () => {
  assert.equal(scaleFromWall(200, 400), 0.02);
});

test("snapPoint snaps to 0°, 45° and nearby corners", () => {
  const p = snapPoint([10, 1], [0, 0], [], 3);
  assert.ok(Math.abs(p[0] - Math.hypot(10, 1)) < 1e-9 && Math.abs(p[1]) < 1e-9);
  const q = snapPoint([7, 7.4], [0, 0], [], 3);
  assert.ok(Math.abs(q[0] - q[1]) < 1e-9);
  assert.deepEqual(snapPoint([49, 51], [0, 0], [[50, 50]], 3), [50, 50]);
});

test("wall lengths in cm, and setting one keeps a square outline square", () => {
  const o = box(0, 0, 100, 50);
  assert.deepEqual(wallLengthsCm(o, 0.02), [200, 100, 200, 100]);
  const o2 = setWallLengthCm(o, 0, 300, 0.02);
  assert.deepEqual(wallLengthsCm(o2, 0.02), [300, 100, 300, 100]);
});
