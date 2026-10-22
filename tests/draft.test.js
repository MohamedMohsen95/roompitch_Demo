import { test } from "node:test";
import assert from "node:assert/strict";
import { newDraft, newOpening, draftWalls, draftToRoom, roomToDraft } from "../src/studio/setup/draft.js";

test("a new draft is a 500 x 400 x 280 cm rectangle with no openings", () => {
  const d = newDraft("manual");
  assert.equal(d.mode, "manual");
  assert.deepEqual([d.shape, d.lengthCm, d.widthCm, d.heightCm], ["rect", 500, 400, 280]);
  assert.deepEqual([d.cutLengthCm, d.cutWidthCm, d.corner], [200, 150, "ne"]);
  assert.deepEqual(d.openings, []);
  assert.deepEqual(d.photos, []);
});

test("new openings get the agreed sizes, centred on their wall", () => {
  const d = newDraft("manual");
  const door = newOpening("door", 0, d), win = newOpening("window", 1, d);
  assert.deepEqual([door.widthCm, door.heightCm, door.sillCm, door.offsetCm], [90, 210, 0, 205]);
  assert.deepEqual([win.widthCm, win.heightCm, win.sillCm, win.offsetCm], [120, 120, 90, 140]);
  assert.notEqual(door.id, win.id);
});

test("draftWalls lists wall lengths in cm, or nothing for a bad shape", () => {
  const d = {...newDraft("manual"), shape:"L", lengthCm:600, widthCm:500};
  assert.deepEqual(draftWalls(d).map(w => w.lenCm), [400, 150, 200, 350, 600, 500]);
  assert.deepEqual(draftWalls({...d, cutLengthCm:600}), []);
});

test("draftToRoom converts cm to metres and reports problems", () => {
  const d = newDraft("manual");
  d.openings = [newOpening("door", 2, d), {...newOpening("window", 0, d), offsetCm:450}];
  const r = draftToRoom(d);
  assert.equal(r.shapeError, null);
  assert.equal(r.room.H, 2.8);
  assert.deepEqual(r.room.openings[0], {id:d.openings[0].id, type:"door", wall:2, offset:2.05, width:0.9, height:2.1, sill:0});
  assert.equal(r.openingErrors[d.openings[1].id], "beyondWall");
  assert.equal(r.ok, false);
});

test("draftToRoom refuses a bad shape and a ceiling under 200 cm", () => {
  assert.equal(draftToRoom({...newDraft("manual"), shape:"L", cutLengthCm:500}).shapeError, "cutTooBig");
  assert.equal(draftToRoom({...newDraft("manual"), heightCm:150}).shapeError, "tooLow");
  assert.equal(draftToRoom(newDraft("manual")).ok, true);
});

test("roomToDraft brings a saved room back into the form", () => {
  const d = newDraft("manual"); d.shape = "L"; d.openings = [newOpening("window", 3, d)];
  const back = roomToDraft(draftToRoom(d).room);
  assert.equal(back.shape, "L");
  assert.equal(back.heightCm, 280);
  assert.deepEqual(back.openings.map(o => [o.type, o.wall, o.widthCm, o.sillCm]), [["window", 3, 120, 90]]);
});
