import { test } from "node:test";
import assert from "node:assert/strict";
import { newFlat } from "../src/studio/plan/flat.js";
import { deriveOpens, removeOpen, openTol } from "../src/studio/plan/opens.js";
import { spaceRoom } from "../src/studio/plan/flat.js";
import { validateOpenings } from "../src/studio/geometry.js";

const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
function two(edits = [], openings = []){
  return {...newFlat({w:500, h:200}), spaces:[
    {id:"L", name:"L", outline:box(0, 0, 200, 100), sizeText:null, status:"todo", design:null, fromAI:false},
    {id:"R", name:"R", outline:box(208, 0, 200, 100), sizeText:null, status:"todo", design:null, fromAI:false}], openings, edits};
}
const opens = (f) => f.openings.filter(o => o.type === "open")
  .map(o => [o.a[0], Math.min(o.a[1], o.b[1]), Math.max(o.a[1], o.b[1])]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
const erase = (y0, y1) => ({id:"e" + y0, kind:"erase", a:[204, y0], b:[204, y1]});
const wall = (y0, y1) => ({id:"w" + y0, kind:"wall", a:[204, y0], b:[204, y1]});

test("an erase along a shared wall opens both rooms' edges over the same stretch", () => {
  const f = deriveOpens(two([erase(20, 60)]), [], 12);
  assert.deepEqual(opens(f), [[204, 20, 60]]);                      // one open, on the wall between them
  const o = f.openings[0];
  assert.deepEqual([o.type, o.fromEdit, o.sillCm, o.heightCm], ["open", true, 0, 280]);
});

test("re-deriving replaces, it doesn't add", () => {
  const f = deriveOpens(two([erase(20, 60)]), [], 12);
  assert.equal(deriveOpens(f, [], 12).openings.length, f.openings.length);
});

test("a hand-made open stays; edit-made ones go when their edit goes", () => {
  const hand = {id:"h", type:"open", a:[0, 10], b:[0, 40], heightCm:280, sillCm:0, fromAI:false, fromEdit:false};
  const f = deriveOpens(two([erase(20, 60)], [hand]), [], 12);
  const g = deriveOpens({...f, edits:[]}, [], 12);
  assert.deepEqual(g.openings.map(o => o.id), ["h"]);
});

test("a drawn wall cuts an open in two", () => {
  const f = deriveOpens(two([erase(20, 80), wall(40, 50)]), [], 12);
  assert.deepEqual(opens(f), [[204, 20, 40], [204, 50, 80]]);
});

test("a gap on an edge becomes an open; a gap off every edge doesn't", () => {
  const f = deriveOpens(two(), [{a:[204, 30], b:[204, 70]}, {a:[100, 50], b:[150, 50]}], 12);
  assert.deepEqual(opens(f), [[204, 30, 70]]);
});

test("touching edit-made opens on the same edge merge", () => {
  const f = deriveOpens(two([erase(20, 50), erase(50, 70)]), [], 12);
  assert.deepEqual(opens(f), [[204, 20, 50], [204, 50, 70]]);       // one per erase
});

test("no edits: nothing else changes", () => {
  const door = {id:"d", type:"door", a:[200, 30], b:[200, 70], heightCm:210, sillCm:0, fromAI:true};
  const f = two([], [door]);
  assert.deepEqual(deriveOpens(f, [], 12).openings, [door]);
});

test("re-derived opens keep their ids, so the real flat keeps their places", () => {
  const f = deriveOpens(two([erase(20, 60)]), [], 12);
  const g = deriveOpens({...f, spaces:f.spaces.map(s => ({...s, name:s.name + "!"}))}, [], 12);
  assert.deepEqual(g.openings.map(o => o.id), f.openings.map(o => o.id));
});

test("review: an erase on a shared wall is one opening both rooms see, with no overlap", () => {
  const f = {...deriveOpens(two([erase(20, 60)]), [], 12), scale:0.02};
  for (const id of ["L", "R"]){
    const r = spaceRoom(f, id), mine = r.openings.filter(o => o.type === "open");
    assert.equal(mine.length, 1, id);
    assert.deepEqual(validateOpenings(r.poly, r.H, r.openings), {});
  }
});

test("review: a hand-made open isn't doubled by the edit-made one under it", () => {
  const f = deriveOpens(two([erase(20, 60)]), [], 12);
  const hand = {...f.openings[0], id:"h1", fromEdit:false, b:[204, 70]};          // resized by hand
  const g = deriveOpens({...f, openings:[hand]}, [], 12);
  assert.deepEqual(opens(g), [[204, 20, 70]]);
  assert.equal(new Set(g.openings.map(o => o.id)).size, g.openings.length);
});

test("review: removing an edit-made open removes what made it", () => {
  const f = deriveOpens(two([erase(20, 60)]), [{a:[100, 0], b:[150, 0]}], 12);
  const fromErase = f.openings.find(o => o.id.startsWith("oe:")), fromGap = f.openings.find(o => o.id.startsWith("og:"));
  const a = removeOpen(f, fromErase.id);
  assert.deepEqual(a.edits, []);
  const b = removeOpen(f, fromGap.id);
  assert.equal(b.edits.length, 2);
  assert.equal(b.edits[1].kind, "wall");                              // the gap is closed by a wall
  assert.deepEqual(opens(deriveOpens(b, [{a:[100, 0], b:[150, 0]}], 12)), [[204, 20, 60]]);
  const door = {id:"d", type:"door", a:[0, 30], b:[0, 60], heightCm:210, sillCm:0, fromAI:false};
  assert.deepEqual(removeOpen({...f, openings:[...f.openings, door]}, "d").openings.map(o => o.id).includes("d"), false);
});

test("review: an erase over a door the reading found replaces it", () => {
  const door = {id:"d", type:"door", a:[204, 30], b:[204, 50], heightCm:210, sillCm:0, fromAI:true};
  const f = deriveOpens(two([erase(20, 60)], [door]), [], 12);
  assert.equal(f.openings.some(o => o.id === "d"), false);
  const mine = {...door, fromAI:false};
  assert.equal(deriveOpens(two([erase(20, 60)], [mine]), [], 12).openings.some(o => o.id === "d"), true);   // one you placed stays
});

test("review: one tolerance for open parts", () => {
  assert.equal(openTol(8), 12);
  assert.equal(openTol(0), 6);
});
