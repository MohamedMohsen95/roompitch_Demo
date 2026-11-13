import { test } from "node:test";
import assert from "node:assert/strict";
import { newFlat } from "../src/studio/plan/flat.js";
import { realSpace } from "../src/studio/plan/real.js";
import { roomBox, planCorrection, applyCorrection } from "../src/studio/plan/correct.js";

// A v2 flat at scale 1 whose real flat is the given rectangles [x0, y0, x1, y1] (metres), optionally rotated.
const rect = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const rot = (deg) => { const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180); return ([x, y]) => [x * c - y * s, x * s + y * c]; };
function flatOf(rooms, {openings = [], deg = 0, confirmed = [], polys = {}} = {}){
  const r = rot(deg), spaces = [];
  for (const [id, b] of Object.entries(rooms)) spaces.push({id, poly:rect(b).map(r)});
  for (const [id, p] of Object.entries(polys)) spaces.push({id, poly:p.map(r)});
  const tracing = spaces.map(s => ({id:s.id, name:s.id, outline:s.poly, sizeText:null, status:"todo", design:null, fromAI:false}));
  return {...newFlat({w:1000, h:1000}), scale:1, scaleFrom:"wall", scaleAsked:true, spaces:tracing,
    openings:openings.map(o => ({...o, type:"door", heightCm:210, sillCm:0, fromAI:false})),
    real:{spaces, openings:openings.map(o => ({id:o.id, a:r(o.a), b:r(o.b)})), confirmed}};
}
const boxes = (f) => Object.fromEntries(f.real.spaces.map(s => { const b = roomBox(f, s.id); return [s.id, [b.width, b.length]]; }));
const rooms3 = {A:[0, 0, 3, 3], B:[3.2, 0, 6, 3], C:[0, 3.2, 6, 4.4]};

test("roomBox: width and length of a rectangle, rect flag", () => {
  const f = flatOf({A:[0, 0, 3, 2]}, {polys:{L:[[0, 5], [3, 5], [3, 6], [1, 6], [1, 8], [0, 8]]}});
  assert.deepEqual(roomBox(f, "A"), {rect:true, width:300, length:200});
  assert.equal(roomBox(f, "L").rect, false);
  assert.equal(roomBox(f, "nope"), null);
});

test("widening a room moves the shared wall; the neighbour shrinks", () => {
  const f = flatOf({A:[0, 0, 3, 3], B:[3.2, 0, 6, 3]});
  const c = {kind:"room", spaceId:"A", axis:"width", cm:340};
  const p = planCorrection(f, c);
  assert.equal(p.ok, true);
  assert.equal(p.runsPast, false);
  assert.equal(p.outsideMoved, false);
  assert.deepEqual(p.affected.map(a => [a.id, a.before, a.after]), [["A", [300, 300], [340, 300]], ["B", [280, 300], [240, 300]]]);
  const g = applyCorrection(f, c, {whole:true});
  assert.deepEqual(g.spaces, f.spaces);
  assert.deepEqual(g.real.confirmed, ["A"]);
  assert.deepEqual(boxes(g), {A:[340, 300], B:[240, 300]});
});

test("both sides exterior: the right side moves and outsideMoved is set; the other side can be chosen", () => {
  const f = flatOf({A:[0, 0, 3, 3]});
  const p = planCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:350});
  assert.equal(p.outsideMoved, true);
  assert.equal(p.side, 1);
  assert.equal(p.otherSide, 3);
  const g = applyCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:350}, {whole:true, side:3});
  assert.deepEqual(realSpace(g, "A").poly[0], [-0.5, 0]);
});

test("a wall running past: whole moves every room on the line; part makes a step", () => {
  const c = {kind:"room", spaceId:"A", axis:"length", cm:340};
  assert.equal(planCorrection(flatOf(rooms3), c).runsPast, true);
  const whole = applyCorrection(flatOf(rooms3), c, {whole:true});
  assert.deepEqual(boxes(whole).A, [300, 340]);
  assert.deepEqual(boxes(whole).B, [280, 340]);
  assert.deepEqual(boxes(whole).C, [600, 80]);
  assert.deepEqual(planCorrection(flatOf(rooms3), c, {whole:true}).affected.map(a => a.id), ["A", "B", "C"]);
  const part = applyCorrection(flatOf(rooms3), c, {whole:false});
  assert.equal(realSpace(part, "C").poly.length, 6);
  assert.deepEqual(boxes(part).B, [280, 300]);
  assert.deepEqual(boxes(part).A, [300, 340]);
  assert.deepEqual(planCorrection(flatOf(rooms3), c, {whole:false}).affected.map(a => a.id), ["A", "C"]);
});

test("a door on the moved wall moves with it; a door elsewhere stays", () => {
  const f = flatOf({A:[0, 0, 3, 3], B:[3.2, 0, 6, 3]}, {openings:[{id:"d", a:[3.1, 1], b:[3.1, 1.8]}, {id:"w", a:[0, 1], b:[0, 2]}]});
  const g = applyCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:340}, {whole:true});
  const d = g.real.openings.find(o => o.id === "d"), w = g.real.openings.find(o => o.id === "w");
  assert.ok(Math.abs(d.a[0] - 3.5) < 1e-9 && Math.abs(d.b[0] - 3.5) < 1e-9);
  assert.deepEqual(w, {id:"w", a:[0, 1], b:[0, 2]});
  assert.deepEqual(g.openings, f.openings);
});

test("rotated rooms: width follows the room's own axes", () => {
  const f = flatOf({A:[0, 0, 3, 3], B:[3.2, 0, 6, 3]}, {deg:3});
  const p = planCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:340});
  assert.deepEqual(p.affected.map(a => [a.id, a.after]), [["A", [340, 300]], ["B", [240, 300]]]);
});

test("confirmed neighbour is reported; too small, not rect, no change and no scale are refused", () => {
  const f = flatOf({A:[0, 0, 3, 3], B:[3.2, 0, 6, 3]}, {confirmed:["B"], polys:{L:[[0, 5], [3, 5], [3, 6], [1, 6], [1, 8], [0, 8]]}});
  assert.equal(planCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:340}).affected[1].confirmed, true);
  assert.deepEqual(planCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:590}), {ok:false, reason:"tooSmall"});
  assert.deepEqual(planCorrection(f, {kind:"room", spaceId:"L", axis:"width", cm:340}), {ok:false, reason:"notRect"});
  assert.deepEqual(planCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:300.2}), {ok:false, reason:"noChange"});
  assert.deepEqual(planCorrection({...f, scale:null}, {kind:"room", spaceId:"A", axis:"width", cm:340}), {ok:false, reason:"noScale"});
});

test("wall one by one: a perpendicular next wall moves like a side; an angled one changes only this room", () => {
  const f = flatOf({A:[0, 0, 3, 3], B:[3.2, 0, 6, 3]});
  const g = applyCorrection(f, {kind:"wall", spaceId:"A", i:0, cm:340}, {whole:true});
  assert.deepEqual(boxes(g), {A:[340, 300], B:[240, 300]});
  const h = flatOf({B:[3.2, 0, 5, 3]}, {polys:{A:[[0, 0], [3, 0], [3, 2], [2, 3], [0, 3]]}});
  const k = applyCorrection(h, {kind:"wall", spaceId:"A", i:1, cm:250}, {whole:true});
  assert.deepEqual(realSpace(k, "A").poly, [[0, 0], [3, 0], [3, 2.5], [2, 3.5], [0, 3.5]]);
  assert.deepEqual(realSpace(k, "B").poly, realSpace(h, "B").poly);
});

test("a corridor running past both ends of the room gets an 8-corner step; doors on the moved part move", () => {
  const f = flatOf({A:[0, 0, 3, 3], C:[-1, 3.2, 6, 4.4]}, {openings:[{id:"o", a:[1, 3.1], b:[2, 3.1]}, {id:"p", a:[4, 3.1], b:[5, 3.1]}]});
  const g = applyCorrection(f, {kind:"room", spaceId:"A", axis:"length", cm:340}, {whole:false});
  assert.deepEqual(realSpace(g, "C").poly, [[-1, 3.2], [0, 3.2], [0, 3.6], [3, 3.6], [3, 3.2], [6, 3.2], [6, 4.4], [-1, 4.4]]);
  assert.deepEqual(g.real.openings.map(o => o.a), [[1, 3.5], [4, 3.1]]);
});

test("review: a part step survives a later tracing edit (a rename)", async () => {
  const { syncTracing, realOverlaps } = await import("../src/studio/plan/real.js");
  const f = flatOf(rooms3);
  const g = applyCorrection(f, {kind:"room", spaceId:"A", axis:"length", cm:340}, {whole:false});
  const h = syncTracing(g, {...g, spaces:g.spaces.map(s => s.id === "B" ? {...s, name:"Bedroom"} : s)});
  assert.deepEqual(h.real, g.real);
  assert.deepEqual(realOverlaps(h), []);
});

test("review: wall one by one on a slightly off-square room moves the whole far wall", () => {
  const f = flatOf({B:[3.2, 0, 6, 3]}, {polys:{A:[[0, 0], [3, 0], [2.99, 3], [0, 3]]}});
  const g = applyCorrection(f, {kind:"wall", spaceId:"A", i:0, cm:340}, {whole:true});
  const a = realSpace(g, "A").poly;
  assert.ok(Math.abs(a[1][0] - 3.4) < 1e-6 && Math.abs(a[2][0] - 3.39) < 1e-6, JSON.stringify(a));
  const r = flatOf({A:[0, 0, 3, 3], B:[3.2, 0, 6, 3]}, {deg:45});
  const k = applyCorrection(r, {kind:"wall", spaceId:"A", i:1, cm:340}, {whole:true});
  assert.deepEqual(boxes(k).A, [300, 340]);
});

test("review: a correction that would make rooms overlap is refused", () => {
  const f = flatOf({A:[0, 0, 3, 3], B:[3.3, 0, 6, 3]});      // a 30 cm wall: not seen as shared
  assert.deepEqual(planCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:340}), {ok:false, reason:"overlap"});
});

test("review: syncTracing works from the previous real flat, not a stale one in the edit", async () => {
  const { syncTracing, materialize } = await import("../src/studio/plan/real.js");
  const f0 = materialize(flatOf({A:[0, 0, 3, 3]}));
  const drag = (f, x) => ({...f, spaces:f.spaces.map(s => ({...s, outline:[[0, 0], [x, 0], [3, 3], [0, 3]]}))});
  const s1 = syncTracing(f0, drag(f0, 3.1));
  const s2 = syncTracing(s1, drag(f0, 3.2));             // built from the stale f0 (its real too)
  assert.ok(Math.abs(realSpace(s2, "A").poly[1][0] - 3.2) < 1e-9);
});
