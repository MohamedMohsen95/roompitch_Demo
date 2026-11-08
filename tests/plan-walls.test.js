import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPng } from "./helpers/png.js";
import { readWalls, toStraight } from "../src/studio/plan/walls.js";

const E = JSON.parse(readFileSync("tests/fixtures/plans/expect.json", "utf8"));
const load = (name) => readPng(name.includes("_") ? `tests/fixtures/plans/${name}.png` : `tests/fixtures/plans/src/${name}.png`);
const cache = new Map();
const read = (name) => { if (!cache.has(name)) cache.set(name, readWalls(load(name))); return cache.get(name); };
const at = (mk, [x, y]) => mk.m[Math.round(y) * mk.w + Math.round(x)];

for (const name of ["arcmax", "etsy", "ex4"]){
  test(`${name}: walls found, thickness close to the generator's`, () => {
    const r = read(name);
    assert.equal(r.quality.ok, true, String(r.quality.reason));
    assert.ok(r.outerThick >= E[name].thick * 0.6 && r.outerThick <= E[name].thick * 1.4, `outer thick ${r.outerThick} vs ${E[name].thick}`);
    assert.ok(Math.abs(r.angle) < 0.3);
    for (const room of E[name].rooms) assert.equal(at(r.foot, toStraight(r, [room.x, room.y])), 1, `${room.name} inside the footprint`);
  });
  test(`${name}_scan: still readable`, () => {
    const r = read(name + "_scan");
    assert.equal(r.quality.ok, true, String(r.quality.reason));
    assert.ok(r.outerThick >= E[name].thick * 0.5 && r.outerThick <= E[name].thick * 1.6, `outer thick ${r.outerThick}`);
  });
  test(`${name}_rot3: straightened`, () => {
    const r = read(name + "_rot3");
    assert.equal(r.quality.ok, true, String(r.quality.reason));
    assert.ok(Math.abs(r.angle - 3) < 0.5, `angle ${r.angle}`);
    for (const room of E[name + "_rot3"].rooms) assert.equal(at(r.foot, toStraight(r, [room.x, room.y])), 1, `${room.name} inside the footprint`);
  });
}

test("east (thin, faint, coloured walls) fails the quality gate", () => {
  assert.equal(read("east").quality.ok, false);
});

test("a plan cropped tight to its outer walls still has its footprint", () => {
  const src = load("etsy"), r0 = read("etsy");
  // the flat's outer walls and terrace, without the dimension chains around them (fixture px)
  const room = E.etsy.rooms;
  const x0 = 100, y0 = 70, x1 = 1500, y1 = 1340;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.data.subarray(((y + y0) * src.w + x0) * 4, ((y + y0) * src.w + x1 + 1) * 4), y * w * 4);
  const r = readWalls({w, h, data});
  assert.equal(r.quality.ok, true);
  for (const p of room) assert.equal(at(r.foot, toStraight(r, [p.x - x0, p.y - y0])), 1, p.name);
});

test("an inverted plan (light walls on dark) fails the quality gate", () => {
  const src = load("etsy"), data = src.data.map((v, i) => (i % 4 === 3 ? v : 255 - v));
  assert.equal(readWalls({w:src.w, h:src.h, data}).quality.ok, false);
});

test("etsy: a bridge across each door between target rooms", () => {
  const r = read("etsy");
  for (const d of E.etsy.doors || []){
    const p = toStraight(r, d);
    assert.ok(r.bridges.some(b => Math.hypot((b.a[0] + b.b[0]) / 2 - p[0], (b.a[1] + b.b[1]) / 2 - p[1]) < r.thick * 2), `door at ${d}`);
  }
  assert.ok((E.etsy.doors || []).length >= 2);
});
