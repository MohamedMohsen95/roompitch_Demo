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
