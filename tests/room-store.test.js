import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Tiny localStorage stand-in (state and store modules read it lazily).
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }
};

const { S, applyRoom } = await import("../src/studio/state.js");
const { saveRoom, loadRoom } = await import("../src/studio/room-store.js");
const { shapePoly, rectInside } = await import("../src/studio/geometry.js");
const { FU } = await import("../src/studio/catalog.js");

const room = (form, openings = []) => ({form, poly:shapePoly(form).poly, openings, H:2.8});
const ell = {shape:"L", lengthCm:600, widthCm:500, cutLengthCm:200, cutWidthCm:150, corner:"ne"};

beforeEach(() => mem.clear());

test("saveRoom then loadRoom round-trips", () => {
  const door = {id:"d1", type:"door", wall:3, offset:1, width:0.9, height:2.1, sill:0};
  applyRoom(room(ell, [door]), {keepDesign:false});
  S.items.push({id:1, type:"sofa", x:2, y:3, rot:0});
  saveRoom();
  const saved = loadRoom();
  assert.deepEqual(saved.poly, S.poly);
  assert.deepEqual(saved.openings, [door]);
  assert.deepEqual(saved.items, [{id:1, type:"sofa", x:2, y:3, rot:0}]);
});

test("loadRoom returns null for missing, garbage, old format", () => {
  assert.equal(loadRoom(), null);
  localStorage.setItem("rp_room", "{nope");
  assert.equal(loadRoom(), null);
  localStorage.setItem("rp_room", JSON.stringify({L:5, W:4}));
  assert.equal(loadRoom(), null);
});

test("applyRoom keepDesign=false empties the room", () => {
  S.items = [{id:1, type:"sofa", x:2, y:2, rot:0}];
  applyRoom(room({shape:"rect", lengthCm:500, widthCm:400}), {keepDesign:false});
  assert.deepEqual(S.items, []);
  assert.deepEqual(S.walls, ["paint-white", "paint-white", "paint-white", "paint-white"]);
  assert.equal(S.floor, "oak");
  assert.deepEqual({L:S.L, W:S.W, H:S.H}, {L:5, W:4, H:2.8});
});

test("applyRoom keepDesign=true keeps finishes and pulls furniture inside", () => {
  applyRoom(room({shape:"rect", lengthCm:600, widthCm:500}), {keepDesign:false});
  S.walls[0] = "wood-panel";
  S.items = [{id:1, type:"sofa", x:4.8, y:4.5, rot:0}];
  applyRoom(room({shape:"rect", lengthCm:400, widthCm:300}), {keepDesign:true});
  const it = S.items[0], f = FU.sofa;
  assert.ok(rectInside({x:it.x, y:it.y, w:f.w, d:f.d}, S.poly));
  assert.equal(S.walls[0], "wood-panel");
  assert.equal(S.walls.length, 4);
});

test("restoreRoom drops pieces and finishes it doesn't know", async () => {
  const { restoreRoom } = await import("../src/studio/room-store.js");
  applyRoom(room({shape:"rect", lengthCm:500, widthCm:400}), {keepDesign:false});
  const saved = {...JSON.parse(JSON.stringify({v:1, form:S.form, poly:S.poly, openings:[], H:2.8, nextId:3})),
    walls:["no-such-finish", "wood-panel", "paint-white", "paint-white"], floor:"no-such-floor",
    items:[{id:1, type:"sofa", x:2, y:2, rot:0}, {id:2, type:"m-gone-model", x:3, y:3, rot:0}]};
  const r = restoreRoom(saved);
  assert.equal(r.dropped, 1);
  assert.deepEqual(S.items.map(i => i.type), ["sofa"]);
  assert.deepEqual(S.walls, ["paint-white", "wood-panel", "paint-white", "paint-white"]);
  assert.equal(S.floor, "oak");
});

test("saveRoom stamps savedAt and hands the room to onSaved", async () => {
  const { onSaved, setSaving, validRoom } = await import("../src/studio/room-store.js");
  let got = null;
  onSaved((d) => { got = d; });
  setSaving(true);
  applyRoom(room(ell), {keepDesign:false});
  saveRoom();
  onSaved(null);
  assert.ok(got && got.savedAt > 0);
  assert.ok(validRoom(got));
  assert.equal(validRoom({...got, poly:[[0, 0]]}), false);
});
