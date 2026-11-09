// A flat read from a floor plan: spaces drawn as outlines in image pixels, openings as segments,
// and one scale (metres per pixel) found from the written sizes or from one wall the designer typed.
import { parseRoomSize, parseArea } from "./units.js";
import { realOf, materialize } from "./real.js";

export const DEFAULT_H = 2.8;

export function newFlat(image){
  return {v:2, image:{...image}, scale:null, scaleFrom:null, scaleAsked:false, H:DEFAULT_H, spaces:[], openings:[], unplaced:[], real:null};
}

// Twice the signed area; positive means clockwise on screen (y down).
function area2(o){
  let s = 0;
  for (let i = 0; i < o.length; i++){
    const [x1, y1] = o[i], [x2, y2] = o[(i + 1) % o.length];
    s += x1 * y2 - x2 * y1;
  }
  return s;
}

// Clockwise on screen, starting at the top-left-most corner.
export function orientCW(outline){
  const o = outline.map(p => [p[0], p[1]]);
  if (area2(o) < 0) o.reverse();
  let k = 0;
  for (let i = 1; i < o.length; i++){
    const a = o[i][0] + o[i][1], b = o[k][0] + o[k][1];
    if (a < b || (a === b && o[i][1] < o[k][1])) k = i;
  }
  return o.slice(k).concat(o.slice(0, k));
}

function cross(a, b, c){ return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function segsCross(a, b, c, d){
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// null, "tooFewCorners" or "crossing".
export function outlineProblem(outline){
  if (!Array.isArray(outline) || outline.length < 3) return "tooFewCorners";
  const n = outline.length;
  for (let i = 0; i < n; i++){
    const a = outline[i], b = outline[(i + 1) % n];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) return "sameCorner";
  }
  for (let i = 0; i < n; i++){
    for (let j = i + 2; j < n; j++){
      if (i === 0 && j === n - 1) continue;          // neighbours through the closing wall
      if (segsCross(outline[i], outline[(i + 1) % n], outline[j], outline[(j + 1) % n])) return "crossing";
    }
  }
  if (Math.abs(area2(outline)) < 1e-9) return "tooFewCorners";
  return null;
}

function bboxPx(o){
  const xs = o.map(p => p[0]), ys = o.map(p => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Scale (m/px) from what is written in the spaces: a room size ("12' x 14'") from the outline's bounding
// box, or else an area ("64 sq ft") from the outline's area. Taken only from at least two rooms that
// agree within 10 %; a room more than 10 % off the median is flagged and left out. {scale: null} otherwise.
const pxArea = (o) => { let a = 0; o.forEach((p, i) => { const q = o[(i + 1) % o.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a) / 2; };
export function scaleFromSizes(flat){
  const ratios = [];
  for (const s of flat.spaces){
    if (!s.outline || s.outline.length < 3) continue;
    const size = parseRoomSize(s.sizeText);
    if (size){
      const [w, h] = bboxPx(s.outline);
      if (!(w > 0 && h > 0)) continue;
      const [longCm, shortCm] = [Math.max(...size), Math.min(...size)];
      const [longPx, shortPx] = [Math.max(w, h), Math.min(w, h)];
      ratios.push({id:s.id, r:(longCm / longPx + shortCm / shortPx) / 2 / 100});
      continue;
    }
    const m2 = parseArea(s.areaText), a = pxArea(s.outline);
    if (m2 && a > 0) ratios.push({id:s.id, r:Math.sqrt(m2 / a)});
  }
  if (!ratios.length) return {scale:null, flagged:[]};
  const m = median(ratios.map(x => x.r));
  const flagged = ratios.filter(x => Math.abs(x.r - m) / m > 0.1).map(x => x.id);
  const kept = ratios.filter(x => !flagged.includes(x.id));
  // Fewer than two that agree (one room, or two that differ): ask for a wall instead of trusting one.
  // "Agree" means the kept ones are all within 10 % of each other, not just of their median.
  const rs = kept.map(x => x.r);
  if (kept.length < 2 || Math.max(...rs) / Math.min(...rs) - 1 > 0.1) return {scale:null, flagged:kept.length < 2 ? flagged : ratios.map(x => x.id)};
  return {scale:median(rs), flagged};
}

// Scale (m/px) from one wall: its length on the image and in cm.
export function scaleFromWall(lenPx, lenCm){
  return lenPx > 0 && lenCm > 0 ? (lenCm / lenPx) / 100 : null;
}

// While tracing: a nearby corner wins; otherwise keep the distance from the previous corner
// and turn to the nearest 45°.
export function snapPoint(p, prev, others, tolPx){
  for (const q of others || []){
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= tolPx) return [q[0], q[1]];
  }
  if (!prev) return [p[0], p[1]];
  const dx = p[0] - prev[0], dy = p[1] - prev[1], d = Math.hypot(dx, dy);
  if (!d) return [p[0], p[1]];
  const step = Math.PI / 4, a = Math.round(Math.atan2(dy, dx) / step) * step;
  const x = prev[0] + d * Math.cos(a), y = prev[1] + d * Math.sin(a);
  return [Math.abs(x - prev[0]) < 1e-9 ? prev[0] : x, Math.abs(y - prev[1]) < 1e-9 ? prev[1] : y];
}

export function wallLengthsCm(outline, scale){
  const n = outline.length;
  return outline.map((p, i) => {
    const q = outline[(i + 1) % n];
    return Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) * scale * 100);
  });
}

// Typing a wall length: stretch along that wall's direction. Every corner at or past the
// wall's old end (measured along that direction) moves by the change.
export function setWallLengthCm(outline, i, cm, scale){
  const n = outline.length, a = outline[i], b = outline[(i + 1) % n];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!len || !(cm > 0) || !(scale > 0)) return outline.map(p => [p[0], p[1]]);
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const delta = cm / 100 / scale - len, endT = b[0] * ux + b[1] * uy;
  return outline.map(p => (p[0] * ux + p[1] * uy >= endT - 1e-6) ? [p[0] + delta * ux, p[1] + delta * uy] : [p[0], p[1]]);
}

// ---- A space as a studio room, and back ----

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const originOf = (outline) => [Math.min(...outline.map(p => p[0])), Math.min(...outline.map(p => p[1]))];
const toLocal = (p, origin, scale) => [r6((p[0] - origin[0]) * scale) + 0, r6((p[1] - origin[1]) * scale) + 0];

// Where a plan opening sits on the space's walls (pixels), or null when it is on none of them.
function onWall(outline, o, tolPx){
  const n = outline.length;
  let best = null;
  for (let i = 0; i < n; i++){
    const a = outline[i], b = outline[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const at = (p) => ({t:(p[0] - a[0]) * ux + (p[1] - a[1]) * uy, d:(p[0] - a[0]) * uy - (p[1] - a[1]) * ux});
    const pa = at(o.a), pb = at(o.b);
    if (Math.abs(pa.d) > tolPx || Math.abs(pb.d) > tolPx) continue;
    if (Math.min(pa.t, pb.t) < -tolPx || Math.max(pa.t, pb.t) > len + tolPx) continue;
    const t0 = Math.max(0, Math.min(pa.t, pb.t)), t1 = Math.min(len, Math.max(pa.t, pb.t));
    if (t1 - t0 <= 0) continue;
    const side = (pa.d + pb.d) / 2;            // how far it sits off the wall's line (into the wall), kept on write-back
    if (!best || Math.abs(side) < Math.abs(best.side)) best = {wall:i, t0, t1, side};
  }
  return best;
}

// Outlines follow the inside faces of the walls, so a door drawn on a 15–25 cm wall sits up to a wall's
// thickness away from each room's outline.
export const WALL_TOL_M = 0.26;
const tolOf = (scale) => Math.max(4, WALL_TOL_M / scale);
const findSpace = (flat, id) => {
  const s = flat.spaces.find(x => x.id === id);
  if (!s) throw new Error("No space " + id);
  return s;
};

// The studio's room shape for one space, from the real flat: local metres, bounding box at 0,0, clockwise.
// origin: the room's corner in the real flat's metres.
const realPoly = (flat, id) => {
  const r = realOf(flat).spaces.find(x => x.id === id);
  if (!r) throw new Error("No space " + id);
  return orientCW(r.poly);
};
const props = (flat) => new Map(flat.openings.map(o => [o.id, o]));

export function spaceRoom(flat, spaceId){
  const outline = realPoly(flat, spaceId), origin = originOf(outline), byId = props(flat);
  const openings = [];
  for (const o of realOf(flat).openings){
    const w = onWall(outline, o, WALL_TOL_M), p = byId.get(o.id);
    if (!w || !p) continue;
    openings.push({
      id:o.id, type:p.type, wall:w.wall,
      offset:r6(w.t0), width:r6(w.t1 - w.t0),
      height:(p.heightCm || 0) / 100, sill:p.type === "window" ? (p.sillCm || 0) / 100 : 0
    });
  }
  const [w, h] = bboxPx(outline);
  return {
    form:{shape:"plan", lengthCm:Math.round(w * 100), widthCm:Math.round(h * 100), heightCm:Math.round(flat.H * 100)},
    poly:outline.map(p => toLocal(p, origin, 1)),
    openings, H:flat.H, origin
  };
}

// The space's openings after designing it, written back to the real flat (metres). Openings that were on
// this space's walls are replaced; ids are kept, so a shared door moves for the neighbour too. The tracing
// keeps its doors and windows where they were read or drawn; a new one is added to it too (real ÷ scale),
// with its height and sill, and a removed one is removed from both.
export function writeBackOpenings(flat, spaceId, openings){
  const f = materialize(flat), real = f.real, outline = realPoly(f, spaceId), n = outline.length;
  const mine = new Set(real.openings.filter(o => onWall(outline, o, WALL_TOL_M)).map(o => o.id));
  const realById = new Map(real.openings.map(o => [o.id, o])), byId = props(f);
  const gap = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const toM = (o) => {
    const a = outline[o.wall % n], b = outline[(o.wall + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const old = realById.get(o.id);
    const was = old && onWall(outline, old, WALL_TOL_M), side = was && was.wall === o.wall % n ? was.side : 0;
    const px = uy * side, py = -ux * side;    // back to the same distance off the wall's line
    const s0 = o.offset, s1 = o.offset + o.width;
    return {id:o.id, a:[r6(a[0] + ux * s0 + px), r6(a[1] + uy * s0 + py)], b:[r6(a[0] + ux * s1 + px), r6(a[1] + uy * s1 + py)]};
  };
  const given = openings.map(o => ({o, m:toM(o)})), givenIds = new Set(openings.map(o => o.id));
  const gone = (id) => mine.has(id) && !givenIds.has(id);
  // real: replace in place, then append the new ones
  const rOut = [];
  for (const o of real.openings){
    if (gone(o.id)) continue;
    const g = given.find(x => x.o.id === o.id);
    rOut.push(g ? g.m : o);
  }
  for (const g of given) if (!realById.has(g.o.id)) rOut.push(g.m);
  // the tracing: type, height and sill follow; positions stay; new ones added
  const k = f.scale, tOut = [];
  for (const o of f.openings){
    if (gone(o.id)) continue;
    const g = given.find(x => x.o.id === o.id);
    if (!g){ tOut.push(o); continue; }
    const heightCm = Math.round(g.o.height * 100), sillCm = g.o.type === "window" ? Math.round((g.o.sill || 0) * 100) : 0;
    const r = realById.get(o.id), moved = !r || Math.min(gap(r.a, g.m.a) + gap(r.b, g.m.b), gap(r.a, g.m.b) + gap(r.b, g.m.a)) >= 0.01;
    // still the AI's opening only while nothing about it changed
    const same = o.type === g.o.type && o.heightCm === heightCm && o.sillCm === sillCm && !moved;
    tOut.push(same ? o : {...o, type:g.o.type, heightCm, sillCm, fromAI:false});
  }
  for (const g of given) if (!byId.has(g.o.id)){
    const heightCm = Math.round(g.o.height * 100), sillCm = g.o.type === "window" ? Math.round((g.o.sill || 0) * 100) : 0;
    tOut.push({id:g.o.id, type:g.o.type, a:[r6(g.m.a[0] / k), r6(g.m.a[1] / k)], b:[r6(g.m.b[0] / k), r6(g.m.b[1] / k)], heightCm, sillCm, fromAI:false});
  }
  return {...f, openings:tOut, real:{...real, openings:rOut}};
}

// Other spaces near this one, in this space's local metres (for grey context in 3D).
export function neighbours(flat, spaceId, withinM = 4){
  const mineP = realPoly(flat, spaceId), origin = originOf(mineP), [w, h] = bboxPx(mineP);
  const box = {x0:origin[0] - withinM, y0:origin[1] - withinM, x1:origin[0] + w + withinM, y1:origin[1] + h + withinM};
  return realOf(flat).spaces.filter(o => o.id !== spaceId && o.poly.length >= 3).filter(o => {
    const [ox, oy] = originOf(o.poly), [ow, oh] = bboxPx(o.poly);
    return ox <= box.x1 && ox + ow >= box.x0 && oy <= box.y1 && oy + oh >= box.y0;
  }).map(o => orientCW(o.poly).map(p => toLocal(p, origin, 1)));
}

// After spaces or sizes change: the scale follows the written sizes, unless the designer set it from a wall.
export function withSizeScale(flat){
  if (flat.scaleFrom === "wall" && flat.scale) return flat;
  const {scale} = scaleFromSizes(flat);
  return {...flat, scale, scaleFrom:scale ? "sizes" : null};
}

export const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// The space wall nearest a point (within tolPx), optionally only of one space:
// {spaceId, i, a, b, len, t /* px along the wall from a */, d /* px from the wall */} or null.
export function nearestPlanWall(flat, p, tolPx, onlySpaceId = null){
  let best = null;
  for (const s of flat.spaces){
    if (onlySpaceId && s.id !== onlySpaceId) continue;
    const o = s.outline, n = o.length;
    for (let i = 0; i < n; i++){
      const a = o[i], b = o[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!len) continue;
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      const t = Math.max(0, Math.min(len, (p[0] - a[0]) * ux + (p[1] - a[1]) * uy));
      const d = Math.hypot(a[0] + ux * t - p[0], a[1] + uy * t - p[1]);
      if (d <= tolPx && (!best || d < best.d)) best = {spaceId:s.id, i, a, b, len, t, d};
    }
  }
  return best;
}

// Corners closer than tolPx to the one before them (a double-click on a corner, a corner dragged onto its
// neighbour) are dropped, as long as 3 corners remain.
export function cleanOutline(outline, tolPx){
  const out = [];
  for (const p of outline){
    const q = out[out.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolPx) continue;
    out.push([p[0], p[1]]);
  }
  while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= tolPx) out.pop();
  return out.length >= 3 ? out : outline.map(p => [p[0], p[1]]);
}

// Typing a wall length in a space: the outline stretches (setWallLengthCm), and the doors and windows
// past the wall's old end move with it, so they stay on their walls.
export function stretchWall(flat, spaceId, i, cm){
  const s = findSpace(flat, spaceId), o = s.outline, n = o.length, a = o[i], b = o[(i + 1) % n];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!len || !(cm > 0) || !(flat.scale > 0)) return flat;
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, delta = cm / 100 / flat.scale - len;
  const endT = b[0] * ux + b[1] * uy, tol = tolOf(flat.scale);
  const outline = setWallLengthCm(o, i, cm, flat.scale);
  const past = (p) => p[0] * ux + p[1] * uy >= endT - 1e-6;
  const move = (p) => [p[0] + delta * ux, p[1] + delta * uy];
  const openings = flat.openings.map(op => {
    if (!onWall(o, op, tol)) return op;
    const pa = past(op.a), pb = past(op.b);
    if (!pa && !pb) return op;
    return {...op, a:pa ? move(op.a) : op.a, b:pb ? move(op.b) : op.b, fromAI:false};
  });
  return {...flat, spaces:flat.spaces.map(x => x.id === spaceId ? {...x, outline, fromAI:false} : x), openings};
}

// Doors and windows that sit on no space's walls (they are left out of every room).
export function strayOpenings(flat){
  if (!flat.scale) return [];
  const tol = tolOf(flat.scale);
  return flat.openings.filter(op => !flat.spaces.some(s => onWall(s.outline, op, tol))).map(op => op.id);
}
