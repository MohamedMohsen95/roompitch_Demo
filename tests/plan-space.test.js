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

test("a door in a real wall belongs to both rooms and stays in the wall when moved", () => {
  // Inside faces 15 cm apart (x=200 and x=207.5 at 0.02 m/px); the door drawn on the wall's centreline.
  const f = twoRooms();
  f.spaces[1].outline = box(207.5, 0, 200, 100);
  f.openings[0] = {...f.openings[0], a:[203.75, 30], b:[203.75, 75]};
  const left = spaceRoom(f, "left").openings.find(o => o.id === "d1");
  assert.ok(left && left.wall === 1 && near(left.offset, 0.6));
  assert.ok(spaceRoom(f, "right").openings.some(o => o.id === "d1"));
  const f2 = writeBackOpenings(f, "left", spaceRoom(f, "left").openings.map(o => o.id === "d1" ? {...o, offset:1.0} : o));
  assert.ok(Math.abs(f2.openings.find(o => o.id === "d1").a[0] - 203.75) < 1e-6);
  const right = spaceRoom(f2, "right").openings.find(o => o.id === "d1");
  assert.ok(right && near(right.offset, 0.1));
});

test("an outer window on a thick wall is kept", () => {
  const f = twoRooms();
  f.openings[1] = {...f.openings[1], a:[50, -10], b:[110, -10]};   // 20 cm out, on the outer wall's centre
  assert.ok(spaceRoom(f, "left").openings.some(o => o.id === "w1" && o.wall === 0));
});

test("typing a wall length carries the openings past its end", async () => {
  const { stretchWall, strayOpenings } = await import("../src/studio/plan/flat.js");
  const f = twoRooms();
  f.openings.push({id:"w2", type:"window", a:[0, 30], b:[0, 70], heightCm:120, sillCm:90, fromAI:false});
  const g = stretchWall(f, "left", 0, 500);                         // 4 m -> 5 m: the right wall moves 50 px
  assert.deepEqual(g.spaces[0].outline, [[0, 0], [250, 0], [250, 100], [0, 100]]);
  assert.deepEqual(g.openings.find(o => o.id === "d1").a, [250, 30]);
  assert.deepEqual(g.openings.find(o => o.id === "w2").a, [0, 30]);  // the left wall didn't move
  assert.deepEqual(g.openings.find(o => o.id === "w1").a, [50, 0]);  // on wall 0 but before its end
  assert.deepEqual(strayOpenings(g), []);
  assert.deepEqual(strayOpenings({...f, openings:[...f.openings, {id:"x", type:"door", a:[100, 50], b:[120, 50], heightCm:210, sillCm:0, fromAI:false}]}), ["x"]);
});
