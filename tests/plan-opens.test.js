import { test } from "node:test";
import assert from "node:assert/strict";
import { newFlat } from "../src/studio/plan/flat.js";
import { deriveOpens } from "../src/studio/plan/opens.js";

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
  assert.deepEqual(opens(f), [[200, 20, 60], [208, 20, 60]]);
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
  assert.deepEqual(opens(f), [[200, 20, 40], [200, 50, 80], [208, 20, 40], [208, 50, 80]]);
});

test("a gap on an edge becomes an open; a gap off every edge doesn't", () => {
  const f = deriveOpens(two(), [{a:[200, 30], b:[200, 70]}, {a:[100, 50], b:[150, 50]}], 12);
  assert.deepEqual(opens(f), [[200, 30, 70], [208, 30, 70]]);       // a gap in a shared wall opens both rooms
});

test("touching edit-made opens on the same edge merge", () => {
  const f = deriveOpens(two([erase(20, 50), erase(50, 70)]), [], 12);
  assert.deepEqual(opens(f), [[200, 20, 70], [208, 20, 70]]);
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
