import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_PROMPT, parsePlanReply, flatFromReply } from "../src/studio/plan/plan-vision.js";

const sq = [[0.1, 0.1], [0.4, 0.1], [0.4, 0.5], [0.1, 0.5]];

test("the prompt asks for JSON with fractions and copied sizes", () => {
  assert.match(PLAN_PROMPT, /JSON/);
  assert.match(PLAN_PROMPT, /fraction/i);
  assert.match(PLAN_PROMPT, /furniture/i);
});

test("fenced and prose-wrapped replies are read", () => {
  const body = JSON.stringify({spaces:[{name:"LIVING", outline:sq, size:"13' x 16'"}], openings:[{type:"door", x1:0.4, y1:0.2, x2:0.4, y2:0.3}]});
  for (const text of ["```json\n" + body + "\n```", "Here is the plan: " + body + " Hope this helps."]){
    const r = parsePlanReply(text);
    assert.equal(r.spaces.length, 1);
    assert.deepEqual(r.spaces[0], {name:"LIVING", outline:sq, size:"13' x 16'"});
    assert.deepEqual(r.openings, [{type:"door", x1:0.4, y1:0.2, x2:0.4, y2:0.3}]);
  }
});

test("bad parts are dropped and the rest kept", () => {
  const r = parsePlanReply(JSON.stringify({
    spaces:[
      {name:"A", outline:[[0, 0], [1, 1]]},
      {name:"B", outline:[[0, 0], [1.3, 0], [1, 1]]},
      {name:"C", outline:[[-0.02, 0], [1.02, 0], [1, 1]], size:null},
      {outline:sq, size:42}
    ],
    openings:[{type:"stairs", x1:0, y1:0, x2:1, y2:1}, {type:"window", x1:0.1, y1:0.1, x2:"x", y2:0.1}, {type:"window", x1:0.1, y1:0.1, x2:0.2, y2:0.1}]
  }));
  assert.deepEqual(r.spaces.map(s => s.name), ["C", ""]);
  assert.deepEqual(r.spaces[0].outline, [[0, 0], [1, 0], [1, 1]]);
  assert.equal(r.spaces[1].size, null);
  assert.deepEqual(r.openings, [{type:"window", x1:0.1, y1:0.1, x2:0.2, y2:0.1}]);
});

test("no usable answer is empty", () => {
  assert.deepEqual(parsePlanReply("sorry"), {spaces:[], openings:[]});
  assert.deepEqual(parsePlanReply(""), {spaces:[], openings:[]});
  assert.deepEqual(parsePlanReply(null), {spaces:[], openings:[]});
  assert.deepEqual(parsePlanReply('{"spaces":"none"}'), {spaces:[], openings:[]});
});

test("a reply becomes a flat in pixels with a scale from the sizes", () => {
  // 1000x800 image: a 300x400 px space "10' x 13'4\"" -> ~1.016 cm/px; and a 200x300 px one.
  const reply = {
    spaces:[
      {name:"BED", outline:[[0.1, 0.5], [0.4, 0.5], [0.4, 0.0], [0.1, 0.0]], size:"10' x 13'4\""},
      {name:"BATH", outline:[[0.4, 0], [0.6, 0], [0.6, 0.375], [0.4, 0.375]], size:"6'8\" x 10'"}
    ],
    openings:[{type:"door", x1:0.4, y1:0.1, x2:0.4, y2:0.2}, {type:"window", x1:0.15, y1:0, x2:0.3, y2:0}]
  };
  const f = flatFromReply(reply, {w:1000, h:800});
  assert.equal(f.spaces.length, 2);
  assert.deepEqual(f.spaces[0].outline, [[100, 0], [400, 0], [400, 400], [100, 400]]);   // turned clockwise
  assert.ok(f.spaces.every(s => s.fromAI && s.status === "todo" && s.design === null));
  assert.equal(f.spaces[0].sizeText, "10' x 13'4\"");
  assert.ok(Math.abs(f.scale - 0.01016) < 2e-4);
  assert.equal(f.scaleFrom, "sizes");
  const [door, win] = f.openings;
  assert.deepEqual([door.a, door.b, door.heightCm, door.sillCm, door.fromAI], [[400, 80], [400, 160], 210, 0, true]);
  assert.deepEqual([win.heightCm, win.sillCm], [120, 90]);
  assert.equal(new Set([...f.spaces, ...f.openings].map(x => x.id)).size, 4);
});

test("no sizes means no scale yet", () => {
  const f = flatFromReply({spaces:[{name:"", outline:sq, size:null}], openings:[]}, {w:100, h:100});
  assert.equal(f.scale, null);
  assert.equal(f.scaleFrom, null);
  assert.equal(f.spaces[0].name, "");
});
