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

import { applyAnalysis, addPhotos, MAX_PHOTOS } from "../src/studio/setup/draft.js";

test("AI openings replace earlier AI ones on that wall and keep hand-made ones", () => {
  const d = newDraft("photos");
  const mine = newOpening("door", 0, d);
  d.openings = [mine, {...newOpening("window", 0, d), fromAI:true}, {...newOpening("window", 1, d), fromAI:true}];
  applyAnalysis(d, 0, [{type:"window", left:0.3, right:0.6, top:0.25, bottom:0.65}]);
  const onWall0 = d.openings.filter(o => o.wall === 0);
  assert.equal(onWall0.length, 2);
  assert.ok(onWall0.includes(mine));
  const ai = onWall0.find(o => o.fromAI);
  assert.deepEqual([ai.type, ai.offsetCm, ai.widthCm, ai.heightCm, ai.sillCm], ["window", 150, 150, 112, 98]);
  assert.equal(d.openings.filter(o => o.wall === 1).length, 1);
});

test("at most 8 photos are kept", () => {
  const d = newDraft("photos");
  const pics = Array.from({length:10}, (_, i) => ({id:"p" + i, dataUrl:"data:image/jpeg;base64,AA"}));
  const r = addPhotos(d, pics);
  assert.equal(MAX_PHOTOS, 8);
  assert.deepEqual([r.added, r.skipped, d.photos.length], [8, 2, 8]);
  assert.equal(d.photos[0].wall, null);
});

import { fitDraftToWalls } from "../src/studio/setup/draft.js";

test("after a shape change, openings and photo tags on walls that are gone move or reset", () => {
  const d = {...newDraft("photos"), shape:"L", lengthCm:600, widthCm:500};
  d.openings = [newOpening("door", 5, d)];
  d.photos = [{id:"p1", dataUrl:"x", wall:5}, {id:"p2", dataUrl:"x", wall:1}];
  d.shape = "rect";
  fitDraftToWalls(d);
  assert.equal(d.openings[0].wall, 0);
  assert.equal(d.openings[0].offsetCm, 255);       // centred on the 600 cm wall
  assert.deepEqual(d.photos.map(p => p.wall), [null, 1]);
  assert.equal(draftToRoom(d).ok, true);
});
