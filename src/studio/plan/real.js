// The real flat: the flat's geometry in metres (flat frame = image px × scale), which corrections change.
// The tracing (spaces[].outline, openings[].a/b in image px) stays on the plan image; until the real flat
// differs from it (flat.real === null) the real flat is the tracing × scale.
import { orientCW } from "./flat.js";

const r6 = (v) => Math.round(v * 1e6) / 1e6 + 0;
const mul = (p, k) => [r6(p[0] * k), r6(p[1] * k)];

function derived(flat){
  const k = flat.scale;
  if (!(k > 0)) return {spaces:[], openings:[], confirmed:[]};
  return {
    spaces:flat.spaces.filter(s => s.outline && s.outline.length >= 3).map(s => ({id:s.id, poly:orientCW(s.outline).map(p => mul(p, k))})),
    openings:flat.openings.map(o => ({id:o.id, a:mul(o.a, k), b:mul(o.b, k)})),
    confirmed:[]
  };
}

export const realOf = (flat) => flat.real || derived(flat);
export const materialize = (flat) => flat.real ? flat : {...flat, real:derived(flat)};
export const realSpace = (flat, id) => realOf(flat).spaces.find(s => s.id === id) || null;

// The order orientCW puts an outline's corners in: cwOrder(o)[j] is the index in o of corner j.
function cwOrder(outline){
  const idx = outline.map((_, i) => i);
  let a = 0;
  for (let i = 0; i < outline.length; i++){ const [x1, y1] = outline[i], [x2, y2] = outline[(i + 1) % outline.length]; a += x1 * y2 - x2 * y1; }
  if (a < 0) idx.reverse();
  let k = 0;
  for (let j = 1; j < idx.length; j++){
    const p = outline[idx[j]], q = outline[idx[k]], s = p[0] + p[1], t = q[0] + q[1];
    if (s < t || (s === t && p[1] < q[1])) k = j;
  }
  return idx.slice(k).concat(idx.slice(0, k));
}

// Scale times factor; a real flat that differs from the tracing is scaled with it (corrections kept).
export function rescale(flat, factor){
  const out = {...flat, scale:flat.scale * factor};
  if (!flat.real) return out;
  const r = flat.real;
  return {...out, real:{...r, spaces:r.spaces.map(s => ({...s, poly:s.poly.map(p => mul(p, factor))})),
    openings:r.openings.map(o => ({...o, a:mul(o.a, factor), b:mul(o.b, factor)}))}};
}

// A tracing edit (prev -> next) applied to the real flat: new spaces as tracing × scale, removed ones
// dropped, moved corners moved by the same amount × scale; a space whose corner count changed is rebuilt
// from the tracing. Openings by the same rules.
export function syncTracing(prev, next){
  if (!next.real) return next;
  let flat = next;
  if (prev.scale > 0 && next.scale > 0 && prev.scale !== next.scale) flat = rescale({...next, scale:prev.scale}, next.scale / prev.scale);
  const k = flat.scale, real = flat.real;
  if (!(k > 0)) return flat;
  const before = new Map(prev.spaces.map(s => [s.id, s])), had = new Map(real.spaces.map(s => [s.id, s]));
  const spaces = [];
  for (const s of flat.spaces){
    if (!s.outline || s.outline.length < 3) continue;
    const old = before.get(s.id), r = had.get(s.id);
    if (!r || !old || old.outline.length !== s.outline.length || r.poly.length !== s.outline.length){
      spaces.push({id:s.id, poly:orientCW(s.outline).map(p => mul(p, k))});
      continue;
    }
    const order = cwOrder(old.outline);
    const poly = r.poly.map((p, j) => { const i = order[j], d = [s.outline[i][0] - old.outline[i][0], s.outline[i][1] - old.outline[i][1]]; return [r6(p[0] + d[0] * k), r6(p[1] + d[1] * k)]; });
    spaces.push({id:s.id, poly:orientCW(poly)});
  }
  const oBefore = new Map(prev.openings.map(o => [o.id, o])), oHad = new Map(real.openings.map(o => [o.id, o]));
  const openings = flat.openings.map(o => {
    const old = oBefore.get(o.id), r = oHad.get(o.id);
    if (!old || !r) return {id:o.id, a:mul(o.a, k), b:mul(o.b, k)};
    const mv = (p, q, rp) => [r6(rp[0] + (p[0] - q[0]) * k), r6(rp[1] + (p[1] - q[1]) * k)];
    return {id:o.id, a:mv(o.a, old.a, r.a), b:mv(o.b, old.b, r.b)};
  });
  const ids = new Set(spaces.map(s => s.id));
  return {...flat, real:{spaces, openings, confirmed:real.confirmed.filter(id => ids.has(id))}};
}

// Spaces whose real polygon is not the tracing × scale (another corner count, or a corner > 2 cm off).
export function realDiff(flat){
  const out = new Set();
  if (!flat.real) return out;
  const base = new Map(derived(flat).spaces.map(s => [s.id, s.poly]));
  for (const s of flat.real.spaces){
    const b = base.get(s.id);
    if (!b || b.length !== s.poly.length || s.poly.some((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) > 0.02)) out.add(s.id);
  }
  return out;
}

function inside(poly, x, y){
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const bboxOf = (p) => [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))];

// Shared area of two polygons in m², on a 2 cm grid.
function sharedArea(a, b, cell = 0.02){
  const A = bboxOf(a), B = bboxOf(b);
  const x0 = Math.max(A[0], B[0]), y0 = Math.max(A[1], B[1]), x1 = Math.min(A[2], B[2]), y1 = Math.min(A[3], B[3]);
  if (x1 <= x0 || y1 <= y0) return 0;
  let n = 0;
  for (let y = y0 + cell / 2; y < y1; y += cell) for (let x = x0 + cell / 2; x < x1; x += cell) if (inside(a, x, y) && inside(b, x, y)) n++;
  return n * cell * cell;
}

// Pairs of real spaces that overlap by more than 0.01 m².
export function realOverlaps(flat){
  const s = realOf(flat).spaces, out = [];
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (sharedArea(s[i].poly, s[j].poly) > 0.01) out.push([s[i].id, s[j].id]);
  return out;
}

export const resetReal = (flat) => ({...flat, real:null});

// Tracing above the real flat for wide or square plans; side by side for tall ones.
export const planLayout = (image) => image.w >= image.h ? "stacked" : "side";
