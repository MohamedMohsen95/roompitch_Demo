// Small drawn plans for cases the fixture plans don't have.
import { test } from "node:test";
import assert from "node:assert/strict";
import { polyIoU, insidePoly } from "./helpers/poly.js";
import { readWalls } from "../src/studio/plan/walls.js";
import { roomCandidates } from "../src/studio/plan/rooms.js";
import { assembleFlat } from "../src/studio/plan/assemble.js";

// White w×h image with black rectangles [x0, y0, x1, y1] (inclusive), optionally anti-aliased edges.
function draw(w, h, rects, {grey = 0} = {}){
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = grey;
  }
  return {w, h, data};
}

// A big room with a 202 × 92 closet in its top-left corner, joined by an opening just wider than a door
// bridge (8 % of 500 = 40 px).
const T = 8;
// ch: the closet's clear height. Below 2 × 5 wall thicknesses (80 px) it has no core of its own.
const closetPlan = (gap, ch = 92) => draw(500, 500, [
  [50, 50, 450, 50 + T - 1], [50, 442, 450, 449], [50, 50, 50 + T - 1, 449], [442, 50, 449, 449],   // outer
  [50, 58 + ch, 100 - 1, 58 + ch + T - 1], [100 + gap, 58 + ch, 268, 58 + ch + T - 1],              // closet bottom, with the gap
  [260, 50, 268, 58 + ch + T]                                                                         // closet right
]);

for (const [gap, ch] of [[30, 92], [44, 92], [60, 92], [30, 70], [44, 70], [44, 60], [60, 70]]){
  test(`closet ${ch} px high joined by a ${gap}-px opening: drawn right or not at all`, () => {
    const closetRef = [[58, 58], [260, 58], [260, 58 + ch], [58, 58 + ch]];
    const img = closetPlan(gap, ch), read = readWalls(img), cands = roomCandidates(read);
    const flat = assembleFlat(read, cands, {rooms:[{name:"CLOSET"}, {name:"ROOM"}]}, {CLOSET:[[150, 58 + ch / 2]], ROOM:[[330, 320]]}, {w:500, h:500});
    const closet = flat.spaces.find(s => s.name === "CLOSET"), room = flat.spaces.find(s => s.name === "ROOM");
    if (closet) assert.ok(polyIoU(closet.outline, closetRef) >= 0.9, `closet IoU ${polyIoU(closet.outline, closetRef).toFixed(3)}`);
    if (room) for (const p of [[70, 70], [150, 58 + ch / 2], [250, 50 + ch]]) assert.ok(!insidePoly(room.outline, p), `room takes closet point ${p}`);
    // nothing else is drawn inside the closet
    for (const sp of flat.spaces.filter(x => x !== closet)) assert.ok(!sp.outline.every(p => p[1] <= 58 + ch + 1), `an extra space in the closet: ${JSON.stringify(sp.outline)}`);
  });
}

test("a crisp black-on-white plan (no anti-aliasing) is read", () => {
  const img = closetPlan(30), read = readWalls(img);
  assert.equal(read.quality.ok, true, String(read.quality.reason));
  assert.ok(read.thick >= 6 && read.thick <= 10, `thick ${read.thick}`);
});
