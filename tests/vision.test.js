import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVisionReply, openingsFromFractions, VISION_PROMPT } from "../src/studio/vision.js";

const win = {type:"window", left:0.3, right:0.6, top:0.25, bottom:0.65};

test("prompt asks for JSON with the agreed fields", () => {
  for (const k of ["openings", "door", "window", "left", "right", "top", "bottom"]) assert.ok(VISION_PROMPT.includes(k), k);
});

test("reply inside code fences parses", () => {
  assert.deepEqual(parseVisionReply('```json\n{"openings":[{"type":"window","left":0.3,"right":0.6,"top":0.25,"bottom":0.65}]}\n```'), [win]);
});

test("reply with prose around the JSON parses", () => {
  assert.deepEqual(parseVisionReply('Sure! Here it is: {"openings":[{"type":"window","left":0.3,"right":0.6,"top":0.25,"bottom":0.65}]} Hope that helps.'), [win]);
});

test("bad items are dropped and near-range values clamped", () => {
  const r = parseVisionReply(JSON.stringify({openings:[
    {type:"door", left:0.7, right:0.4, top:0.2, bottom:1},
    {type:"painting", left:0.1, right:0.2, top:0.1, bottom:0.3},
    {type:"door", left:0.1, right:1.03, top:0.2, bottom:1}
  ]}));
  assert.deepEqual(r, [{type:"door", left:0.1, right:1, top:0.2, bottom:1}]);
});

test("no JSON at all gives an empty list", () => {
  assert.deepEqual(parseVisionReply("no openings"), []);
  assert.deepEqual(parseVisionReply(""), []);
  assert.deepEqual(parseVisionReply(null), []);
});

test("fractions become openings in metres on the tagged wall", () => {
  assert.deepEqual(openingsFromFractions([win], {wall:0, wallLen:5, H:2.8}),
    [{id:"ai-0-0", type:"window", wall:0, offset:1.5, width:1.5, height:1.12, sill:0.98, fromAI:true}]);
  const [door] = openingsFromFractions([{type:"door", left:0.1, right:0.28, top:0.25, bottom:1}], {wall:2, wallLen:5, H:2.8});
  assert.equal(door.sill, 0);
  assert.equal(door.id, "ai-2-0");
});
