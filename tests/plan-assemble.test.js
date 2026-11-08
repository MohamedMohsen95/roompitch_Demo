import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPng } from "./helpers/png.js";
import { polyIoU, insidePoly } from "./helpers/poly.js";
import { readWalls, toStraight } from "../src/studio/plan/walls.js";
import { roomCandidates } from "../src/studio/plan/rooms.js";
import { assembleFlat, readScale, isPrivateName } from "../src/studio/plan/assemble.js";
import { parseArea } from "../src/studio/plan/units.js";

const E = JSON.parse(readFileSync("tests/fixtures/plans/expect.json", "utf8"));
const file = (name) => name.includes("_") ? `tests/fixtures/plans/${name}.png` : `tests/fixtures/plans/src/${name}.png`;
const exOf = (name) => E[name.endsWith("_rot3") ? name : name.split("_")[0]];

// What the AI would say, taken from the fixture's label positions.
function aiFrom(name){
  const ex = exOf(name), areas = E[name.split("_")[0]].areas || {}, points = {}, rooms = [];
  for (const l of ex.labels){ (points[l.name] ||= []).push([l.x, l.y]); rooms.push({name:l.name, size:null, area:areas[l.name] ?? null}); }
  return {text:{rooms}, points};
}
const cache = new Map();
function run(name, {ai = true} = {}){
  const key = name + ai;
  if (!cache.has(key)){
    const img = readPng(file(name)), read = readWalls(img), cands = roomCandidates(read), ex = exOf(name);
    const {text, points} = ai ? aiFrom(name) : {text:{rooms:[]}, points:{}};
    cache.set(key, {read, flat:assembleFlat(read, cands, text, points, {w:img.w, h:img.h, dataUrl:"x"}), ex});
  }
  return cache.get(key);
}
const spaceAt = (flat, p) => flat.spaces.find(s => insidePoly(s.outline, p));

// Required on every variant: no drawn space is wrong.
function noWrongSpace(name, flat, ex){
  for (const s of flat.spaces){
    // the target rooms (and labels of other rooms) whose point falls inside this space
    const rooms = ex.rooms.filter(r => insidePoly(s.outline, [r.x, r.y]));
    assert.ok(rooms.length <= 1, `${name}: "${s.name}" covers ${rooms.map(r => r.name).join(" + ")}`);
    const r = rooms[0];
    if (r?.ref){
      const iou = polyIoU(s.outline, r.ref);
      assert.ok(iou >= 0.85, `${name}: "${s.name}" on ${r.name}: IoU ${iou.toFixed(3)}`);
    }
  }
}

for (const base of ["arcmax", "etsy", "ex4", "east"]){
  for (const v of ["", "_scan", "_rot3"]){
    const name = base + v;
    test(`${name}: no wrong space`, () => { const {flat, ex} = run(name); noWrongSpace(name, flat, ex); });
  }
}

test("nothing is drawn in the arcmax title block", () => {
  for (const v of ["", "_scan"]){
    const {flat} = run("arcmax" + v);
    assert.ok(flat.spaces.every(s => Math.max(...s.outline.map(p => p[1])) < 1300), "a space below the plan");
  }
});

test("east draws nothing", () => {
  assert.equal(run("east").flat.spaces.length, 0);
  assert.equal(run("east").flat.unplaced.length, E.east.labels.length);
});

test("targets on the originals", () => {
  const want = {arcmax:["BEDROOM", "BEDROOM", "BEDROOM", "STUDY"], etsy:["Bathroom", "Bedroom", "Hall", "Living Room"]};
  for (const [name, names] of Object.entries(want)){
    const {flat, ex} = run(name);
    for (const r of ex.rooms){
      if (!names.includes(r.name)) continue;
      const s = spaceAt(flat, [r.x, r.y]);
      assert.ok(s, `${name}: ${r.name} at ${r.x},${r.y} not drawn`);
      assert.equal(s.name, r.name);
    }
  }
  // log the rest for the record
  for (const name of ["arcmax", "etsy", "ex4"]){
    const {flat, ex} = run(name);
    const drawn = ex.rooms.filter(r => spaceAt(flat, [r.x, r.y])).map(r => r.name);
    console.log(`# ${name}: drawn ${drawn.length}/${ex.rooms.length} target rooms (${drawn.join(", ")}); spaces: ${flat.spaces.map(s => s.name || "·").join(", ")}; unplaced: ${flat.unplaced.map(u => u.name).join(", ")}`);
  }
});

test("etsy: scale from the written areas", () => {
  const {flat} = run("etsy");
  assert.ok(flat.scale, "no scale");
  assert.equal(flat.scaleFrom, "sizes");
  const bed = flat.spaces.find(s => s.name === "Bedroom"), m2 = parseArea("186 sq ft");
  let a = 0; bed.outline.forEach((p, i) => { const q = bed.outline[(i + 1) % bed.outline.length]; a += p[0] * q[1] - q[0] * p[1]; });
  assert.ok(Math.abs(Math.abs(a) / 2 * flat.scale ** 2 - m2) / m2 < 0.1);
});

test("without names, the same rooms are drawn unnamed", () => {
  for (const name of ["etsy", "arcmax"]){
    const named = run(name).flat, bare = run(name + "_nolabels", {ai:false}).flat, ex = exOf(name);
    for (const r of ex.rooms.filter(r => r.ref)){
      const s = spaceAt(named, [r.x, r.y]);
      if (!s) continue;
      const u = spaceAt(bare, [r.x, r.y]);
      assert.ok(u, `${name}: ${r.name} not drawn without its name`);
      assert.equal(u.unnamed, true);
      assert.equal(u.name, "");
      assert.ok(polyIoU(u.outline, r.ref) >= 0.85);
    }
    noWrongSpace(name + "_nolabels", bare, ex);
  }
});

test("a label in the title block goes to unplaced; one on a wall names the nearest room", () => {
  const img = readPng(file("arcmax")), read = readWalls(img), cands = roomCandidates(read);
  const bed = E.arcmax.rooms.find(r => r.name === "STUDY");
  // on the study's top wall face, 2 px into the wall
  const ref = bed.ref, topY = Math.min(...ref.map(p => p[1]));
  const flat = assembleFlat(read, cands, {rooms:[{name:"Title", size:null, area:null}, {name:"Study", size:null, area:null}]},
    {Title:[[1190, 1380]], Study:[[bed.x, topY - 2]]}, {w:img.w, h:img.h, dataUrl:"x"});
  assert.ok(flat.unplaced.some(u => u.name === "Title"));
  assert.ok(flat.spaces.some(s => s.name === "Study" && insidePoly(s.outline, [bed.x, bed.y])));
});

test("etsy: doors across the door gaps between drawn rooms", () => {
  const {flat, read} = run("etsy");
  for (const d of E.etsy.doors){
    assert.ok(flat.openings.some(o => o.type === "door" && Math.hypot((o.a[0] + o.b[0]) / 2 - d[0], (o.a[1] + o.b[1]) / 2 - d[1]) < read.thick * 2), `door at ${d}`);
  }
  assert.ok(flat.openings.every(o => o.fromAI === true));
});

test("private room names", () => {
  for (const n of ["BEDROOM", "M BATH", "Toilet / Wash", "WIC", "Study", "غرفة نوم", "حمام"]) assert.equal(isPrivateName(n), true, n);
  for (const n of ["LIVING / DINING", "Kitchen", "Hall", "Foyer", "Entry", "صالة"]) assert.equal(isPrivateName(n), false, n);
});

test("readScale shrinks big images and leaves small ones", () => {
  const big = {w:6000, h:4000, data:new Uint8ClampedArray(6000 * 4000 * 4).fill(255)};
  const r = readScale(big);
  assert.deepEqual([r.img.w, r.img.h, r.k], [2000, 1333, 2000 / 6000]);
  const small = {w:800, h:600, data:new Uint8ClampedArray(800 * 600 * 4)};
  assert.equal(readScale(small).img, small);
  assert.equal(readScale(small).k, 1);
});
