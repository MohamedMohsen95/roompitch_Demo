// A flat read from a floor plan: spaces drawn as outlines in image pixels, openings as segments,
// and one scale (metres per pixel) found from the written sizes or from one wall the designer typed.
import { parseRoomSize } from "./units.js";

export const DEFAULT_H = 2.8;

export function newFlat(image){
  return {v:1, image:{...image}, scale:null, scaleFrom:null, H:DEFAULT_H, spaces:[], openings:[]};
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

// Scale (m/px) from the sizes written in the spaces. A space whose size is more than 10% off the
// others is flagged and left out. {scale: null} when no size can be read.
export function scaleFromSizes(flat){
  const ratios = [];
  for (const s of flat.spaces){
    const size = parseRoomSize(s.sizeText);
    if (!size || !s.outline || s.outline.length < 3) continue;
    const [w, h] = bboxPx(s.outline);
    if (!(w > 0 && h > 0)) continue;
    const [longCm, shortCm] = [Math.max(...size), Math.min(...size)];
    const [longPx, shortPx] = [Math.max(w, h), Math.min(w, h)];
    ratios.push({id:s.id, r:(longCm / longPx + shortCm / shortPx) / 2 / 100});
  }
  if (!ratios.length) return {scale:null, flagged:[]};
  const m = median(ratios.map(x => x.r));
  const flagged = ratios.filter(x => Math.abs(x.r - m) / m > 0.1).map(x => x.id);
  const kept = ratios.filter(x => !flagged.includes(x.id));
  return {scale:kept.length ? median(kept.map(x => x.r)) : m, flagged};
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
  for (let i = 0; i < n; i++){
    const a = outline[i], b = outline[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const at = (p) => ({t:(p[0] - a[0]) * ux + (p[1] - a[1]) * uy, d:Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux)});
    const pa = at(o.a), pb = at(o.b);
    if (pa.d > tolPx || pb.d > tolPx) continue;
    if (Math.min(pa.t, pb.t) < -tolPx || Math.max(pa.t, pb.t) > len + tolPx) continue;
    const t0 = Math.max(0, Math.min(pa.t, pb.t)), t1 = Math.min(len, Math.max(pa.t, pb.t));
    if (t1 - t0 <= 0) continue;
    return {wall:i, t0, t1};
  }
  return null;
}

const tolOf = (scale) => Math.max(4, 0.08 / scale);
const findSpace = (flat, id) => {
  const s = flat.spaces.find(x => x.id === id);
  if (!s) throw new Error("No space " + id);
  return s;
};

// The studio's room shape for one space: local metres, bounding box at 0,0, clockwise.
export function spaceRoom(flat, spaceId){
  const s = findSpace(flat, spaceId), scale = flat.scale;
  const outline = orientCW(s.outline), origin = originOf(outline), tol = tolOf(scale);
  const openings = [];
  for (const o of flat.openings){
    const w = onWall(outline, o, tol);
    if (!w) continue;
    openings.push({
      id:o.id, type:o.type, wall:w.wall,
      offset:r6(w.t0 * scale), width:r6((w.t1 - w.t0) * scale),
      height:(o.heightCm || 0) / 100, sill:o.type === "window" ? (o.sillCm || 0) / 100 : 0
    });
  }
  return {
    form:{shape:"plan", heightCm:Math.round(flat.H * 100)},
    poly:outline.map(p => toLocal(p, origin, scale)),
    openings, H:flat.H, origin
  };
}

// The space's openings after designing it, written back to the flat (pixels). Openings that were on
// this space's walls are replaced; ids are kept, so a shared door moves for the neighbour too.
export function writeBackOpenings(flat, spaceId, openings){
  const s = findSpace(flat, spaceId), scale = flat.scale;
  const outline = orientCW(s.outline), n = outline.length, tol = tolOf(scale);
  const mine = new Set(flat.openings.filter(o => onWall(outline, o, tol)).map(o => o.id));
  const byId = new Map(flat.openings.map(o => [o.id, o]));
  const gap = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const toPx = (o) => {
    const a = outline[o.wall % n], b = outline[(o.wall + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const s0 = o.offset / scale, s1 = (o.offset + o.width) / scale;
    const old = byId.get(o.id);
    const pa = [r6(a[0] + ux * s0), r6(a[1] + uy * s0)], pb = [r6(a[0] + ux * s1), r6(a[1] + uy * s1)];
    const heightCm = Math.round(o.height * 100), sillCm = o.type === "window" ? Math.round((o.sill || 0) * 100) : 0;
    // Still the AI's opening only while nothing about it changed.
    const same = old && old.type === o.type && old.heightCm === heightCm && old.sillCm === sillCm
      && Math.min(gap(old.a, pa) + gap(old.b, pb), gap(old.a, pb) + gap(old.b, pa)) < 1;
    return same ? old : {id:o.id, type:o.type, a:pa, b:pb, heightCm, sillCm, fromAI:false};
  };
  const given = openings.map(toPx), givenIds = new Set(given.map(o => o.id));
  const kept = flat.openings.filter(o => !mine.has(o.id) && !givenIds.has(o.id));
  // Keep the flat's order: replace in place, then append the new ones.
  const out = [];
  for (const o of flat.openings){
    if (givenIds.has(o.id)) out.push(given.find(g => g.id === o.id));
    else if (kept.includes(o)) out.push(o);
  }
  for (const g of given) if (!byId.has(g.id)) out.push(g);
  return {...flat, openings:out};
}

// Other spaces near this one, in this space's local metres (for grey context in 3D).
export function neighbours(flat, spaceId, withinM = 4){
  const s = findSpace(flat, spaceId), scale = flat.scale;
  const origin = originOf(s.outline), [w, h] = bboxPx(s.outline), gap = withinM / scale;
  const box = {x0:origin[0] - gap, y0:origin[1] - gap, x1:origin[0] + w + gap, y1:origin[1] + h + gap};
  return flat.spaces.filter(o => o.id !== spaceId && o.outline && o.outline.length >= 3).filter(o => {
    const [ox, oy] = originOf(o.outline), [ow, oh] = bboxPx(o.outline);
    return ox <= box.x1 && ox + ow >= box.x0 && oy <= box.y1 && oy + oh >= box.y0;
  }).map(o => orientCW(o.outline).map(p => toLocal(p, origin, scale)));
}
