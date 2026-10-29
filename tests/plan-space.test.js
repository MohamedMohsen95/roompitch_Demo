import { test } from "node:test";
import assert from "node:assert/strict";
import { newFlat, spaceRoom, writeBackOpenings, neighbours } from "../src/studio/plan/flat.js";

const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;

function twoRooms(){
  const f = newFlat({w:600, h:300});
  f.scale = 0.02; f.scaleFrom = "wall";
  f.spaces = [
    {id:"left", name:"Bedroom", outline:box(0, 0, 200, 100), sizeText:null, status:"todo", design:null, fromAI:false},
    {id:"right", name:"Hall", outline:box(200, 0, 200, 100), sizeText:null, status:"todo", design:null, fromAI:false}
  ];
  f.openings = [
    {id:"d1", type:"door", a:[200, 30], b:[200, 75], heightCm:210, sillCm:0, fromAI:false},
    {id:"w1", type:"window", a:[50, 0], b:[110, 0], heightCm:120, sillCm:90, fromAI:false}
  ];
  return f;
}

test("a flat space becomes a studio room in local metres", () => {
  const r = spaceRoom(twoRooms(), "left");
  assert.deepEqual(r.poly, [[0, 0], [4, 0], [4, 2], [0, 2]]);
  assert.deepEqual(r.origin, [0, 0]);
  assert.equal(r.H, 2.8);
  assert.deepEqual(r.form, {shape:"plan", lengthCm:400, widthCm:200, heightCm:280});
  const door = r.openings.find(o => o.id === "d1");
  assert.equal(door.wall, 1);
  assert.ok(near(door.offset, 0.6) && near(door.width, 0.9) && near(door.height, 2.1) && door.sill === 0);
  const win = r.openings.find(o => o.id === "w1");
  assert.equal(win.wall, 0);
  assert.ok(near(win.offset, 1.0) && near(win.width, 1.2) && near(win.sill, 0.9));
});

test("a door on a shared wall belongs to both spaces", () => {
  const r = spaceRoom(twoRooms(), "right");
  assert.deepEqual(r.origin, [200, 0]);
  const door = r.openings.find(o => o.id === "d1");
  assert.equal(door.wall, 3);                 // the left wall runs upwards, from (0,2) to (0,0)
  assert.ok(near(door.offset, 0.5) && near(door.width, 0.9));
  assert.equal(r.openings.some(o => o.id === "w1"), false);
});

test("moving a shared door in one space moves it in the other", () => {
  const f = twoRooms();
  const room = spaceRoom(f, "left");
  const moved = room.openings.map(o => o.id === "d1" ? {...o, offset:1.0} : o);
  const f2 = writeBackOpenings(f, "left", moved);
  assert.notEqual(f2, f);
  assert.deepEqual(f.openings[0].a, [200, 30]);             // the old flat is untouched
  const door = spaceRoom(f2, "right").openings.find(o => o.id === "d1");
  assert.ok(near(door.offset, 0.1) && near(door.width, 0.9));
  assert.equal(f2.openings.length, 2);
});

test("removing and adding openings in a space", () => {
  const f = twoRooms();
  const room = spaceRoom(f, "left");
  const next = room.openings.filter(o => o.id !== "w1").concat([{id:"n1", type:"window", wall:2, offset:1, width:1, height:1.2, sill:0.9}]);
  const f2 = writeBackOpenings(f, "left", next);
  assert.deepEqual(f2.openings.map(o => o.id).sort(), ["d1", "n1"]);
  const n1 = f2.openings.find(o => o.id === "n1");
  assert.deepEqual([n1.heightCm, n1.sillCm], [120, 90]);
  assert.ok(spaceRoom(f2, "left").openings.some(o => o.id === "n1" && o.wall === 2 && near(o.offset, 1)));
});

test("neighbours are shown in the space's own metres", () => {
  const f = twoRooms();
  f.spaces.push({id:"far", name:"Far", outline:box(5000, 0, 100, 100), sizeText:null, status:"todo", design:null, fromAI:false});
  const n = neighbours(f, "left");
  assert.equal(n.length, 1);
  assert.deepEqual(n[0], [[4, 0], [8, 0], [8, 2], [4, 2]]);
});

test("an AI opening stays marked until it is changed", () => {
  const f = twoRooms();
  f.openings = f.openings.map(o => ({...o, fromAI:true}));
  const room = spaceRoom(f, "left");
  const f2 = writeBackOpenings(f, "left", room.openings.map(o => o.id === "d1" ? {...o, offset:1.0} : o));
  assert.equal(f2.openings.find(o => o.id === "w1").fromAI, true);
  assert.equal(f2.openings.find(o => o.id === "d1").fromAI, false);
  const f3 = writeBackOpenings(f, "right", spaceRoom(f, "right").openings);
  assert.equal(f3.openings.find(o => o.id === "d1").fromAI, true);
});
