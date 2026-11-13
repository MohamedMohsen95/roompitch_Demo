import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPng } from "./helpers/png.js";
import { polyIoU, insidePoly } from "./helpers/poly.js";
import { readWalls, toStraight } from "../src/studio/plan/walls.js";
import { roomCandidates, fillAt, labelAt, candidateByLabel } from "../src/studio/plan/rooms.js";

const E = JSON.parse(readFileSync("tests/fixtures/plans/expect.json", "utf8"));
const load = (name) => readPng(name.includes("_") ? `tests/fixtures/plans/${name}.png` : `tests/fixtures/plans/src/${name}.png`);
const cache = new Map();
function run(name){
  if (!cache.has(name)){ const img = load(name), read = readWalls(img); cache.set(name, {img, read, cands:roomCandidates(read)}); }
  current = cache.get(name).read;
  return cache.get(name);
}
// the candidate whose area holds the point (not just whose outline polygon does)
let current = null;
const containing = (cands, p) => { const c = candidateByLabel(current, labelAt(current, p, 3)); return c && cands.includes(c) ? c : null; };

// Corner angles in the straightened frame are multiples of 45° (± 1°).
function anglesOk(read, outline){
  const pts = outline.map(p => toStraight(read, p));
  return pts.every((p, i) => {
    const q = pts[(i + 1) % pts.length], a = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
    const r = ((a % 45) + 45) % 45;
    return r < 1 || r > 44;
  });
}

// ex4 draws most walls as two thin lines (hollow), which this version doesn't read as walls: its rooms come
// out merged, and the confidence rules (Task 5) must leave them out. Its outlines aren't asserted here.
for (const base of ["arcmax", "etsy"]){
  for (const v of ["", "_scan", "_rot3"]){
    const name = base + v, ex = E[v === "_rot3" ? name : base];
    test(`${name}: rooms with a reference outline come out on their walls`, () => {
      const {read, cands} = run(name);
      // On the originals every reference room is found. On scan-like and rotated copies a room may come out
      // merged with a neighbour (its area also holds another room's point), and Task 5's rules leave those
      // out, but a room that comes out alone must be right.
      let found = 0;
      const refs = ex.rooms.filter(r => r.ref);
      for (const room of refs){
        const c = containing(cands, [room.x, room.y]);
        if (!c){ assert.ok(v, `${room.name}: no candidate at its point`); continue; }
        const iou = polyIoU(c.outline, room.ref);
        const merged = [...ex.rooms.filter(o => o !== room), ...ex.labels.filter(l => l.name !== room.name)].some(o => containing(cands, [o.x, o.y]) === c);
        if (iou >= 0.9){ found++; assert.ok(anglesOk(read, c.outline), `${room.name}: corner angles`); }
        else assert.ok(v && merged, `${room.name}: IoU ${iou.toFixed(3)}${merged ? " (merged)" : ""}`);
      }
      assert.ok(found >= (v ? refs.length - 1 : refs.length), `${found} of ${refs.length} found`);
    });
  }
}

test("no candidate is a furniture-sized area inside a reference room", () => {
  for (const name of ["arcmax", "etsy"]){
    const {cands} = run(name);
    for (const room of E[name].rooms.filter(r => r.ref)){
      const refArea = polyIoU(room.ref, room.ref, true);
      for (const c of cands){
        const inside = c.outline.every(p => insidePoly(room.ref, p));
        if (inside && c !== containing(cands, [room.x, room.y])) assert.ok(false, `${name}: a ${c.areaPx}-px area inside ${room.name} (ref ${refArea} px)`);
      }
    }
  }
});

test("fillAt finds the same rooms, and nothing on an open terrace", () => {
  for (const name of ["arcmax", "etsy"]){
    const {read, cands} = run(name);
    for (const room of E[name].rooms.filter(r => r.ref)){
      const f = fillAt(read, [room.x, room.y]);
      assert.ok(f, `${name} ${room.name}`);
      assert.ok(polyIoU(f.outline, containing(cands, [room.x, room.y]).outline) > 0.99);
    }
  }
  const {read} = run("etsy");
  const terrace = E.etsy.labels.find(l => l.name === "Terrace");
  assert.equal(fillAt(read, [terrace.x, terrace.y + 120]), null);
});
