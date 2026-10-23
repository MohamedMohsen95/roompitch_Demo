import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shapePoly, wallsOf, bbox, pointInPoly, rectInside, fitInside,
  nearestWall, wallArea, validateOpenings, toM, toCm, polyArea, wallFrame
} from "../src/studio/geometry.js";

const rect = () => shapePoly({shape:"rect", lengthCm:500, widthCm:400}).poly;
const ell = () => shapePoly({shape:"L", lengthCm:600, widthCm:500, cutLengthCm:200, cutWidthCm:150, corner:"ne"}).poly;

test("rect 500x400 gives 4 walls of 5,4,5,4", () => {
  const poly = rect();
  assert.deepEqual(wallsOf(poly).map(w => w.len), [5, 4, 5, 4]);
  assert.deepEqual(bbox(poly), {L:5, W:4});
});

test("L 600x500 with 200x150 cut at ne has 6 walls and the cut corner is outside", () => {
  const poly = ell();
  const walls = wallsOf(poly);
  assert.equal(walls.length, 6);
  assert.ok(Math.abs(walls.reduce((s, w) => s + w.len, 0) - 22) < 1e-9);
  assert.equal(pointInPoly(5.5, 0.5, poly), false);
  assert.equal(pointInPoly(1, 4, poly), true);
  assert.deepEqual(bbox(poly), {L:6, W:5});
});

test("cut as large as the room is rejected", () => {
  assert.deepEqual(shapePoly({shape:"L", lengthCm:400, widthCm:300, cutLengthCm:400, cutWidthCm:100, corner:"sw"}), {error:"cutTooBig"});
});

test("side under 100 cm is rejected", () => {
  assert.deepEqual(shapePoly({shape:"rect", lengthCm:90, widthCm:400}), {error:"tooSmall"});
});

test("wallArea subtracts every opening on that wall", () => {
  const poly = rect();
  const openings = [
    {id:"d", type:"door", wall:2, offset:0.5, width:0.9, height:2.1, sill:0},
    {id:"w", type:"window", wall:2, offset:3, width:1, height:1.2, sill:0.9}
  ];
  assert.ok(Math.abs(wallArea(2, poly, 2.8, openings) - (5 * 2.8 - 1.89 - 1.2)) < 1e-9);
  assert.ok(Math.abs(wallArea(0, poly, 2.8, openings) - 14) < 1e-9);
});

test("validateOpenings flags every bad case", () => {
  const poly = rect(), H = 2.8;
  const o = (id, extra) => ({id, type:"door", wall:0, offset:1, width:0.9, height:2.1, sill:0, ...extra});
  const res = validateOpenings(poly, H, [
    o("beyond", {offset:4.5}),
    o("tallDoor", {wall:3, height:3}),
    o("tallWin", {wall:2, type:"window", offset:3.5, sill:2, height:1}),
    o("a", {wall:1, offset:0.5}),
    o("b", {wall:1, offset:1.0}),
    o("tiny", {wall:2, offset:0.2, width:0.2}),
    o("good", {wall:0, offset:1})
  ]);
  assert.equal(res.beyond, "beyondWall");
  assert.equal(res.tallDoor, "tooTall");
  assert.equal(res.tallWin, "tooTall");
  assert.equal(res.a, "overlap");
  assert.equal(res.b, "overlap");
  assert.equal(res.tiny, "tooSmall");
  assert.equal("good" in res, false);
});

test("fitInside moves a sofa out of the L cut-out", () => {
  const poly = ell();
  const sofa = {x:5.5, y:0.6, w:2.2, d:0.9};
  const p = fitInside(sofa, poly);
  assert.ok(rectInside({...sofa, ...p}, poly));
  const inside = {x:2, y:3, w:2.2, d:0.9};
  assert.deepEqual(fitInside(inside, poly), {x:2, y:3});
});

test("nearestWall finds a close wall and ignores the middle", () => {
  const poly = rect();
  assert.equal(nearestWall(2.5, 0.2, poly), 0);
  assert.equal(nearestWall(2.5, 2, poly), null);
});

test("centimetre conversions round to whole cm", () => {
  assert.equal(toCm(2.346), 235);
  assert.equal(toM(235), 2.35);
});

test("polyArea of the L is the box minus the cut", () => {
  assert.ok(Math.abs(polyArea(ell()) - 27) < 1e-9);
  assert.ok(Math.abs(polyArea(rect()) - 20) < 1e-9);
});

test("wallFrame gives the wall direction and the normal pointing into the room", () => {
  const w = wallsOf(rect());
  assert.deepEqual(wallFrame(w[0]), {dir:[1, 0], normal:[0, 1]});
  assert.deepEqual(wallFrame(w[1]), {dir:[0, 1], normal:[-1, 0]});
  const l = wallsOf(ell());
  // the notch's inner vertical wall (from (4,0) down to (4,1.5)) faces west, into the room
  assert.deepEqual(wallFrame(l[1]).normal, [-1, 0]);
});
