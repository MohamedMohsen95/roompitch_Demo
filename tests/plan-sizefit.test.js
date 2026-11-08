import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPng } from "./helpers/png.js";
import { polyIoU } from "./helpers/poly.js";
import { readWalls, toSource } from "../src/studio/plan/walls.js";
import { fitRooms } from "../src/studio/plan/sizefit.js";
import { parseRoomSize } from "../src/studio/plan/units.js";

const E = JSON.parse(readFileSync("tests/fixtures/plans/expect.json", "utf8"));
const rectPoly = (read, [x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => toSource(read, p));

test("ex4: rooms found from their written sizes, and the scale with them", () => {
  const img = readPng("tests/fixtures/plans/src/ex4.png"), read = readWalls(img), ex = E.ex4;
  const entries = ex.labels.filter(l => ex.sizes[l.name]).map(l => ({name:l.name, size:parseRoomSize(ex.sizes[l.name]), p:[l.x, l.y]}));
  const {fits, scale} = fitRooms(read, entries, null);
  // 29'-10" of living/kitchen over ~627 px: about 0.0145 m/px
  assert.ok(scale && Math.abs(scale - 0.0145) / 0.0145 < 0.06, `scale ${scale}`);
  for (const name of ["M BEDROOM", "BEDROOM 2", "WIC"]){
    const f = fits.find(x => x.name === name), ref = ex.rooms.find(r => r.name === name).ref;
    assert.ok(f, `${name} not fitted`);
    const iou = polyIoU(rectPoly(read, f.rect), ref);
    assert.ok(iou >= 0.8, `${name}: IoU ${iou.toFixed(3)} (score ${f.score.toFixed(2)})`);
  }
});

test("a size that fits nothing in the picture scores low", () => {
  const img = readPng("tests/fixtures/plans/src/ex4.png"), read = readWalls(img);
  const {fits} = fitRooms(read, [{name:"X", size:[3048, 3048], p:[400, 400]}], 0.0145);   // a 100-ft room
  assert.ok(!fits.length || fits[0].score < 0.5);
});
