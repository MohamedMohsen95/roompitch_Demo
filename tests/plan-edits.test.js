import { test } from "node:test";
import assert from "node:assert/strict";
import { readWalls } from "../src/studio/plan/walls.js";
import { roomCandidates } from "../src/studio/plan/rooms.js";
import { rotateImg, rotatePoint } from "../src/studio/plan/raster.js";
import { applyEdits, drawnGaps } from "../src/studio/plan/edits.js";

function draw(w, h, rects){
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return {w, h, data};
}
const outer = [[50, 50, 449, 57], [50, 442, 449, 449], [50, 50, 57, 449], [442, 50, 449, 449]];
const halfWall = () => draw(500, 500, [...outer, [50, 200, 250, 207]]);           // an inner wall from the left to x = 250
const containing = (cands, p) => cands.filter(c => { let o = c.outline, ins = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++){ const [xi, yi] = o[i], [xj, yj] = o[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) ins = !ins; }
  return ins; });

test("a drawn wall closes a room", () => {
  const read = readWalls(halfWall());
  assert.equal(roomCandidates(read).length, 1);
  const r2 = applyEdits(read, [{id:"w", kind:"wall", a:[250, 204], b:[442, 204]}], 1);
  const c = roomCandidates(r2);
  assert.equal(c.length, 2);
  assert.equal(containing(c, [100, 100]).length, 1);
  assert.equal(containing(c, [100, 400]).length, 1);
  assert.notEqual(containing(c, [100, 100])[0], containing(c, [100, 400])[0]);
});

test("a drawn wall short of the far wall: the gap is bridged and reported", () => {
  const read = readWalls(halfWall());
  const r2 = applyEdits(read, [{id:"w", kind:"wall", a:[250, 204], b:[400, 204]}], 1, 0.03);
  assert.equal(roomCandidates(r2).length, 2);
  const d = r2.bridges.filter(b => b.drawn);
  assert.equal(d.length, 1);
  const g = drawnGaps(r2, 1);
  assert.equal(g.length, 1);
  const xs = [g[0].a[0], g[0].b[0]].sort((p, q) => p - q);
  assert.ok(Math.abs(xs[0] - 400) <= 6 && Math.abs(xs[1] - 442) <= 2, JSON.stringify(g));
  assert.ok(Math.abs(g[0].a[1] - 204) <= 2);
});

test("a drawn wall with nothing ahead within 1.5 m: no bridge, the room stays one", () => {
  const read = readWalls(draw(500, 500, outer));
  const r2 = applyEdits(read, [{id:"w", kind:"wall", a:[150, 300], b:[200, 300]}], 1, 0.03);
  assert.equal(r2.bridges.filter(b => b.drawn).length, 0);
  assert.equal(roomCandidates(r2).length, 1);
});

test("an erase removes the wall but keeps the two rooms", () => {
  const read = readWalls(draw(500, 500, [...outer, [50, 200, 449, 207]]));
  assert.equal(roomCandidates(read).length, 2);
  const r2 = applyEdits(read, [{id:"e", kind:"erase", a:[150, 204], b:[300, 204]}], 1);
  assert.equal(roomCandidates(r2).length, 2);
  const at = (mk, x, y) => mk.m[y * mk.w + x];
  assert.equal(at(r2.walls, 200, 204), 0);
  assert.equal(at(r2.closed, 200, 204), 1);
});

test("rotated 3°: the drawn wall lands where it was drawn", () => {
  const src = halfWall(), img = rotateImg(src, 3, [255, 255, 255], true);
  const rp = (p) => rotatePoint(p, 3, {w:src.w, h:src.h}, {w:img.w, h:img.h});
  const read = readWalls(img);
  const r2 = applyEdits(read, [{id:"w", kind:"wall", a:rp([250, 204]), b:rp([442, 204])}], 1);
  assert.equal(roomCandidates(r2).length, 2);
});

test("no edits: the same reading", () => {
  const read = readWalls(halfWall());
  assert.equal(applyEdits(read, [], 1), read);
});

test("assemble doesn't turn a drawn gap or an erased gap into a door", async () => {
  const { assembleFlat } = await import("../src/studio/plan/assemble.js");
  const read = applyEdits(readWalls(halfWall()), [{id:"w", kind:"wall", a:[250, 204], b:[400, 204]}], 1, 0.03);
  const cands = roomCandidates(read);
  assert.ok(cands.some(c => c.bridgeIds.some(id => read.bridges.find(b => b.id === id)?.drawn)), "the drawn gap is one of the rooms' bridges");
  const flat = assembleFlat(read, cands, {rooms:[]}, {}, {w:500, h:500});
  assert.ok(flat.spaces.length >= 1);
  assert.ok(!flat.openings.some(o => Math.hypot((o.a[0] + o.b[0]) / 2 - 421, (o.a[1] + o.b[1]) / 2 - 204) < 6), JSON.stringify(flat.openings));
});

test("review: a drawn wall's end gap doesn't depend on the drawing order", () => {
  const img = draw(500, 500, outer), read = readWalls(img);
  // B: a full wall at y = 250; A: a vertical wall from the top stopping 34 px short of B
  const A = {id:"a", kind:"wall", a:[200, 54], b:[200, 212]}, B = {id:"b", kind:"wall", a:[54, 250], b:[446, 250]};
  const g1 = drawnGaps(applyEdits(read, [A, B], 1, 0.03), 1), g2 = drawnGaps(applyEdits(read, [B, A], 1, 0.03), 1);
  assert.equal(g1.length, 1);
  assert.equal(g2.length, 1);
});
