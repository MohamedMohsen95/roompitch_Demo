import { test } from "node:test";
import assert from "node:assert/strict";
import { TEXT_PROMPT, parseTextReply, parsePointReply } from "../src/studio/plan/plan-vision.js";

test("the prompt asks for names and written sizes only, as JSON", () => {
  assert.match(TEXT_PROMPT, /JSON/);
  assert.match(TEXT_PROMPT, /each time it is written/);
  assert.match(TEXT_PROMPT, /title block/);
  assert.doesNotMatch(TEXT_PROMPT, /outline/i);
});

test("text replies: fenced, wrapped, repeated names, bad values", () => {
  const body = JSON.stringify({rooms:[{name:"BEDROOM", size:"11'-0\" X 12'-6\"", area:null}, {name:"BEDROOM", size:7, area:"120 sq ft"}, {name:"BEDROOM"}, {name:""}, {size:"x"}]});
  for (const text of ["```json\n" + body + "\n```", "Sure! " + body + " Done."]){
    assert.deepEqual(parseTextReply(text).rooms, [
      {name:"BEDROOM", size:"11'-0\" X 12'-6\"", area:null},
      {name:"BEDROOM", size:null, area:"120 sq ft"},
      {name:"BEDROOM", size:null, area:null}
    ]);
  }
  assert.deepEqual(parseTextReply("sorry"), {rooms:[]});
  assert.deepEqual(parseTextReply(null), {rooms:[]});
  assert.deepEqual(parseTextReply('{"rooms":"none"}'), {rooms:[]});
});

test("text replies: where each name is written, when usable", () => {
  const rooms = parseTextReply(JSON.stringify({rooms:[{name:"WIC", size:null, area:null, x:0.14, y:0.83}, {name:"DECK", x:1.4, y:0.1}, {name:"HALL", x:"0.5", y:0.5}]})).rooms;
  assert.deepEqual(rooms.map(r => r.at), [[0.14, 0.83], undefined, undefined]);
  assert.match(TEXT_PROMPT, /fractions of the image width and height/);
});

test("point replies in every shape", () => {
  const size = {w:1000, h:1000};
  assert.deepEqual(parsePointReply({points:[{x:.5, y:.25}]}, size), [[.5, .25]]);
  assert.deepEqual(parsePointReply({points:[[.5, .25]]}, size), [[.5, .25]]);
  assert.deepEqual(parsePointReply({points:[{x:500, y:250}]}, size), [[.5, .25]]);
  assert.deepEqual(parsePointReply({points:null}, size), []);
  assert.deepEqual(parsePointReply({points:[{x:"a", y:1}, {x:-0.5, y:.2}, {x:3000, y:10}]}, size), []);
});
