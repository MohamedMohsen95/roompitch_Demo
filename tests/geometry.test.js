import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shapePoly, wallsOf, bbox, pointInPoly, standsInside, rectInside, fitInside,
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

test("clearances: a piece in a 5x4 room is measured to the four walls", async () => {
  const {clearances} = await import("../src/studio/geometry.js");
  const c = clearances({x:2, y:1.5, w:1, d:.6}, rect());
  const by = Object.fromEntries(c.map(e => [e.side, e]));
  assert.equal(c.length, 4);
  assert.equal(toCm(by.n.dist), 120); assert.equal(by.n.wall, 0);
  assert.equal(toCm(by.e.dist), 250); assert.equal(by.e.wall, 1);
  assert.equal(toCm(by.s.dist), 220); assert.equal(by.s.wall, 2);
  assert.equal(toCm(by.w.dist), 150); assert.equal(by.w.wall, 3);
  // the north line starts on the piece's top edge and ends on wall 1
  assert.deepEqual(by.n.from, [2, 1.2]); assert.deepEqual(by.n.to, [2, 0]);
});

test("clearances: against a wall is 0", async () => {
  const {clearances} = await import("../src/studio/geometry.js");
  const by = Object.fromEntries(clearances({x:.5, y:2, w:1, d:1}, rect()).map(e => [e.side, e]));
  assert.equal(by.w.dist, 0);
});

test("clearances: in the L, the side under the notch measures to the notch wall", async () => {
  const {clearances} = await import("../src/studio/geometry.js");
  // 600x500 with a 200x150 cut at the north-east: the notch's floor runs along y = 1.5 from x = 4 to 6
  const by = Object.fromEntries(clearances({x:5, y:3, w:1, d:1}, ell()).map(e => [e.side, e]));
  assert.equal(toCm(by.n.dist), 100);
  assert.deepEqual(by.n.to, [5, 1.5]);
  // straddling the notch's corner, the nearer wall (the notch floor) wins, drawn where the side faces it
  const s = Object.fromEntries(clearances({x:4, y:3, w:1, d:1}, ell()).map(e => [e.side, e]));
  assert.equal(toCm(s.n.dist), 100);
  assert.deepEqual(s.n.from, [4.25, 2.5]);
});

test("snapAlign: a piece within tolerance snaps its nearest line onto another piece's", async () => {
  const {snapAlign} = await import("../src/studio/geometry.js");
  const table = {x:2, y:2, w:1.2, d:.6};
  // centres 3 cm apart on x: snaps to the same centre; y is far from every line, so it stays
  assert.deepEqual(snapAlign({x:2.03, y:3.3, w:.8, d:.4}, [table], null, .06), {x:2, y:3.3});
  // left edges 4 cm apart (1.44 vs 1.4): snaps left to left
  assert.deepEqual(snapAlign({x:1.84, y:3.3, w:.8, d:.4}, [table], null, .06), {x:1.8, y:3.3});
  // too far: no change
  assert.deepEqual(snapAlign({x:2.2, y:3.3, w:.8, d:.4}, [table], null, .06), {x:2.2, y:3.3});
  // a centre near another piece's edge (2.03 vs the table's left edge at 1.4 + .6): not a match
  assert.deepEqual(snapAlign({x:1.43, y:3.3, w:2, d:.4}, [{x:2.5, y:2, w:2.2, d:.6}], null, .06), {x:1.43, y:3.3});
});

test("snapAlign: the room's centre lines count for a piece's centre", async () => {
  const {snapAlign} = await import("../src/studio/geometry.js");
  assert.deepEqual(snapAlign({x:2.47, y:1.96, w:1, d:1}, [], {L:5, W:4}, .06), {x:2.5, y:2});
});

test("alignGuides: one guide per coinciding line, spanning both pieces", async () => {
  const {alignGuides} = await import("../src/studio/geometry.js");
  const table = {x:2, y:2, w:1.2, d:.6};
  const g = alignGuides({x:2, y:3.3, w:.8, d:.4}, [table], null);
  assert.deepEqual(g, [{axis:"x", at:2, from:1.7, to:3.5}]);
  // same top line: a horizontal guide from the left of one to the right of the other
  const top = alignGuides({x:4, y:1.9, w:1, d:.4}, [table], null);
  assert.deepEqual(top, [{axis:"y", at:1.7, from:1.4, to:4.5}]);
  // centred in the room: both centre lines, across the whole room
  assert.deepEqual(alignGuides({x:2.5, y:2, w:1, d:1}, [], {L:5, W:4}), [{axis:"x", at:2.5, from:0, to:4}, {axis:"y", at:2, from:0, to:5}]);
});

test("alignRects lines pieces up against their combined box", async () => {
  const {alignRects} = await import("../src/studio/geometry.js");
  const a = {x:1, y:1, w:2, d:.6}, b = {x:3, y:2.5, w:1, d:1};   // box: x 0..3.5, y .7..3
  assert.deepEqual(alignRects([a, b], "left"), [{x:1, y:1}, {x:.5, y:2.5}]);
  assert.deepEqual(alignRects([a, b], "right"), [{x:2.5, y:1}, {x:3, y:2.5}]);
  assert.deepEqual(alignRects([a, b], "hcenter"), [{x:1.75, y:1}, {x:1.75, y:2.5}]);
  assert.deepEqual(alignRects([a, b], "top"), [{x:1, y:1}, {x:3, y:1.2}]);
  assert.deepEqual(alignRects([a, b], "bottom"), [{x:1, y:2.7}, {x:3, y:2.5}]);
  assert.deepEqual(alignRects([a, b], "vcenter"), [{x:1, y:1.85}, {x:3, y:1.85}]);
});

test("standsInside keeps a margin from every wall, including the L's inner corner", () => {
  const poly = rect();
  assert.equal(standsInside(2.5, 2, poly, .25), true);
  assert.equal(standsInside(.1, 2, poly, .25), false);    // too close to the west wall
  assert.equal(standsInside(-1, 2, poly, .25), false);    // outside
  const l = ell();   // 600x500 with a 200x150 notch at the north-east
  assert.equal(standsInside(4.1, 1.6, l, .25), false);    // just past the notch's inner corner
  assert.equal(standsInside(3, 2.5, l, .25), true);
});

test("snapAlign: a piece near the middle of the gap between two level pieces snaps to equal gaps", async () => {
  const {snapAlign} = await import("../src/studio/geometry.js");
  // two nightstands (x 0.25 and 2.75, 0.5 wide): the gap between them runs from 0.5 to 2.5, middle 1.5
  const left = {x:.25, y:1, w:.5, d:.4}, right = {x:2.75, y:1, w:.5, d:.4};
  assert.deepEqual(snapAlign({x:1.54, y:1.3, w:1.4, d:2}, [left, right], null, .06), {x:1.5, y:1.3});
  // not level with them (well below): no snap
  assert.deepEqual(snapAlign({x:1.54, y:4, w:1.4, d:.4}, [left, right], null, .06), {x:1.54, y:4});
  // too wide to fit between them: no snap
  assert.deepEqual(snapAlign({x:1.54, y:1.3, w:2.2, d:2}, [left, right], null, .06), {x:1.54, y:1.3});
});

test("spacingGuides: the two equal gaps, each drawn where its pieces are level", async () => {
  const {spacingGuides} = await import("../src/studio/geometry.js");
  const left = {x:.25, y:1, w:.5, d:.4}, right = {x:2.75, y:1.2, w:.5, d:.4}, bed = {x:1.5, y:1.5, w:1.4, d:2};
  assert.deepEqual(spacingGuides(bed, [left, right]), [{along:"x", gaps:[{from:.5, to:.8, at:1}, {from:2.2, to:2.5, at:1.2}]}]);
  // off centre: nothing
  assert.deepEqual(spacingGuides({...bed, x:1.6}, [left, right]), []);
  // the nearest piece on each side counts, not one further out
  assert.deepEqual(spacingGuides(bed, [left, right, {x:-1, y:1, w:.5, d:.4}]).length, 1);
  // vertically: centred between a piece above and one below
  const v = spacingGuides({x:2, y:2, w:.6, d:.6}, [{x:2, y:.5, w:1, d:1}, {x:2.1, y:3.5, w:1, d:1}]);
  assert.deepEqual(v, [{along:"y", gaps:[{from:1, to:1.7, at:2}, {from:2.3, to:3, at:2}]}]);
});

test("a window (a rect with only: \"x\") is a fixed line along its wall: pieces snap to it on that axis alone", async () => {
  const {snapAlign, alignGuides, spacingGuides} = await import("../src/studio/geometry.js");
  const win = {x:3, y:0, w:1.2, d:0, only:"x"};   // on the north wall, centred at x = 3
  // centres 4 cm apart along the wall: snaps; the window's y (the wall) never pulls the piece
  assert.deepEqual(snapAlign({x:3.04, y:.03, w:2, d:.9}, [win], null, .06), {x:3, y:.03});
  // left edges (2.4) line up
  assert.deepEqual(snapAlign({x:2.93, y:1, w:1, d:.5}, [win], null, .06), {x:2.9, y:1});
  // the guide runs from the wall to the far side of the piece
  assert.deepEqual(alignGuides({x:3, y:1, w:2, d:.9}, [win], null), [{axis:"x", at:3, from:0, to:1.45}]);
  // never one side of an equal gap
  assert.deepEqual(spacingGuides({x:3, y:1, w:.5, d:.5}, [win, {x:4, y:1, w:.5, d:.5}]), []);
});

test("alignRects with a window: the pieces move onto its line, the window's axis only", async () => {
  const {alignRects} = await import("../src/studio/geometry.js");
  const sofa = {x:2, y:1, w:2, d:.9}, table = {x:2.4, y:2.2, w:1.2, d:.6}, win = {x:3, y:0, w:1.2, d:0, only:"x"};
  // one piece and the window: the sofa's centre goes to the window's, the window doesn't count as moving
  assert.deepEqual(alignRects([sofa], "hcenter", [win]), [{x:3, y:1}]);
  assert.deepEqual(alignRects([sofa], "left", [win]), [{x:3.4, y:1}]);
  // several pieces: all onto the window's centre line
  assert.deepEqual(alignRects([sofa, table], "hcenter", [win]), [{x:3, y:1}, {x:3, y:2.2}]);
  // the other axis: the window doesn't apply, the pieces align with each other as before
  assert.deepEqual(alignRects([sofa, table], "top", [win]), [{x:2, y:1}, {x:2.4, y:.85}]);
});

test("alignRects with a locked piece: it stays put on both axes and the others line up with it", async () => {
  const {alignRects} = await import("../src/studio/geometry.js");
  const sofa = {x:2, y:1, w:2, d:.9}, locked = {x:2.4, y:2.2, w:1.2, d:.6};
  assert.deepEqual(alignRects([sofa], "hcenter", [locked]), [{x:2.4, y:1}]);
  assert.deepEqual(alignRects([sofa], "vcenter", [locked]), [{x:2, y:2.2}]);
});
