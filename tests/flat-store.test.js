import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }
};

const { saveFlat, loadFlat, validFlat, onFlatSaved, setCurrentSpace, currentSpace, designSaved, openSpace } = await import("../src/studio/plan/flat-store.js");
const { newFlat, spaceRoom } = await import("../src/studio/plan/flat.js");
const { S, applyRoom } = await import("../src/studio/state.js");
const { saveRoom, redirectSaves, loadRoom } = await import("../src/studio/room-store.js");

const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
function twoRooms(){
  const f = newFlat({w:600, h:300, dataUrl:"data:image/jpeg;base64,AAAA"});
  f.scale = 0.02; f.scaleFrom = "wall";
  f.spaces = [
    {id:"left", name:"Bedroom", outline:box(0, 0, 200, 100), sizeText:null, status:"todo", design:null, fromAI:false},
    {id:"right", name:"Hall", outline:box(200, 0, 200, 100), sizeText:null, status:"todo", design:null, fromAI:false}
  ];
  f.openings = [{id:"d1", type:"door", a:[200, 30], b:[200, 75], heightCm:210, sillCm:0, fromAI:false}];
  return f;
}

beforeEach(() => { mem.clear(); onFlatSaved(null); redirectSaves(null); });

test("save and load a flat", () => {
  let pushed = null;
  onFlatSaved(f => { pushed = f; });
  saveFlat(twoRooms());
  assert.deepEqual(loadFlat(), twoRooms());
  assert.deepEqual(pushed, twoRooms());
});

test("a missing or broken flat is not loaded", () => {
  assert.equal(loadFlat(), null);
  mem.set("rp_flat", "{nope"); assert.equal(loadFlat(), null);
  mem.set("rp_flat", JSON.stringify({...twoRooms(), v:2})); assert.equal(loadFlat(), null);
  const f = twoRooms(); f.spaces[0].outline = [[0, 0], [1, 1]];
  mem.set("rp_flat", JSON.stringify(f)); assert.equal(loadFlat(), null);
  assert.equal(validFlat(null), false);
});

test("the current space is remembered", () => {
  assert.equal(currentSpace(), null);
  setCurrentSpace("left"); assert.equal(currentSpace(), "left");
  setCurrentSpace(null); assert.equal(currentSpace(), null);
});

test("opening a space: a new one starts empty and becomes in progress", () => {
  const r = openSpace(twoRooms(), "left");
  assert.equal(r.saved, null);
  assert.deepEqual(r.room.poly, spaceRoom(twoRooms(), "left").poly);
  assert.equal(r.flat.spaces[0].status, "doing");
  assert.equal(r.flat.spaces[1].status, "todo");
});

test("a saved design keeps its furniture, with the outline and doors from the flat", () => {
  const f = twoRooms();
  f.spaces[0].design = {v:1, poly:[[0, 0], [9, 0], [9, 9]], openings:[], H:3, form:{}, walls:["paint-white"], floor:"oak", items:[{id:1, type:"sofa", x:1, y:1, rot:0}], nextId:2};
  f.spaces[0].status = "done";
  const r = openSpace(f, "left");
  assert.deepEqual(r.saved.items, [{id:1, type:"sofa", x:1, y:1, rot:0}]);
  assert.deepEqual(r.saved.poly, [[0, 0], [4, 0], [4, 2], [0, 2]]);
  assert.equal(r.saved.openings[0].id, "d1");
  assert.equal(r.saved.H, 2.8);
  assert.equal(r.flat.spaces[0].status, "done");
});

test("saving a design stores it on the space and moves a shared door in the flat", () => {
  const f = twoRooms();
  const room = spaceRoom(f, "left");
  const data = {v:1, savedAt:1, form:room.form, poly:room.poly, H:room.H, walls:["a", "b", "c", "d"], floor:"oak", items:[], nextId:1,
    openings:room.openings.map(o => ({...o, offset:1.0}))};
  const f2 = designSaved(f, "left", data);
  assert.deepEqual(f2.spaces[0].design, data);
  assert.equal(f2.spaces[1].design, null);
  const door = spaceRoom(f2, "right").openings.find(o => o.id === "d1");
  assert.ok(Math.abs(door.offset - 0.1) < 0.011);
});

test("while a flat space is open, room saves go to the flat, not to the single-room slot", () => {
  let got = null;
  redirectSaves(d => { got = d; });
  const room = spaceRoom(twoRooms(), "left");
  applyRoom(room, {keepDesign:false});
  saveRoom();
  assert.ok(got && got.poly.length === 4);
  assert.equal(loadRoom(), null);
  redirectSaves(null);
  saveRoom();
  assert.ok(loadRoom());
});
