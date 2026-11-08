// Room candidates from the walls: each enclosed free area of the flat (doors closed) is a candidate, with a
// clean outline on the inside faces of its walls. fillAt() gives the candidate under a click.
// Outlines are in source-image pixels, clockwise.
import { components, distance } from "./raster.js";
import { toStraight, toSource } from "./walls.js";
import { orientCW } from "./flat.js";

const cacheOf = new WeakMap();

// Labels of the free areas inside the footprint, computed once per read.
// Doors that weren't bridged (between two wall ends, or beside a corner) still show as necks: an area is
// split where it narrows below a door's width. Room "cores" are the parts farther than NECK × the wall
// thickness from any wall; each core grows back over its area (nearest core wins), so two rooms joined by
// a door become two labels, while an open plan with no narrow passage stays one.
const NECK = 5;
// Parts of an area narrower than TRIM × the wall thickness are cut off it (a strip of a terrace
// along a bedroom's sliding door, a door recess): an opening of each label by a square.
const TRIM = 4;

// Opening of every label at once by a k × k square: a pixel stays if some k × k square of its own label
// covers it. Pixels that don't are unlabelled (0).
function trimThin(labels, w, h, k){
  const n = w * h, a = Math.floor(k / 2);
  const keep = new Uint8Array(n);        // centre of a full k × k square of one label
  // rows: length of the same-label run to the right
  const runR = new Int32Array(n);
  for (let y = 0; y < h; y++) for (let x = w - 1; x >= 0; x--){
    const i = y * w + x;
    runR[i] = labels[i] && x < w - 1 && labels[i + 1] === labels[i] ? runR[i + 1] + 1 : (labels[i] ? 1 : 0);
  }
  // a k-wide horizontal run starting at (x, y), then k such rows below with the same label
  const startOk = new Uint8Array(n);
  for (let i = 0; i < n; i++) startOk[i] = runR[i] >= k ? 1 : 0;
  const downOk = new Int32Array(n);
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--){
    const i = y * w + x;
    downOk[i] = startOk[i] ? (y < h - 1 && startOk[i + w] && labels[i + w] === labels[i] ? downOk[i + w] + 1 : 1) : 0;
  }
  // mark every pixel covered by a full square
  const cover = new Uint8Array(n);
  for (let y = 0; y + k <= h; y++) for (let x = 0; x + k <= w; x++){
    const i = y * w + x;
    if (downOk[i] < k) continue;
    for (let yy = y; yy < y + k; yy++){ const row = yy * w; if (cover[row + x] && cover[row + x + k - 1]) continue; for (let xx = x; xx < x + k; xx++) cover[row + xx] = 1; }
  }
  for (let i = 0; i < n; i++) if (labels[i] && !cover[i]) labels[i] = 0;
  void a; void keep;
}
function regions(read){
  let c = cacheOf.get(read);
  if (c) return c;
  const {w, h} = read.size, n = w * h, free = {w, h, m:new Uint8Array(n)};
  for (let i = 0; i < n; i++) free.m[i] = read.foot.m[i] && !read.closed.m[i] ? 1 : 0;
  const d = distance(free), r = NECK * Math.max(1, read.thick);
  const core = {w, h, m:new Uint8Array(n)};
  for (let i = 0; i < n; i++) core.m[i] = d[i] > r ? 1 : 0;
  const cc = components(core), minCore = r * r;
  const labels = new Int32Array(n), q = new Int32Array(n);
  let tail = 0, next = 0;
  const coreLabel = new Int32Array(cc.count + 1);
  cc.stats.forEach((s, k) => { if (s.area >= minCore) coreLabel[k + 1] = ++next; });
  for (let i = 0; i < n; i++){ const l = coreLabel[cc.labels[i]]; if (l){ labels[i] = l; q[tail++] = i; } }
  // grow the cores over the free pixels, one ring at a time, but only as far as a room reaches from its
  // core (2r plus two wall thicknesses, in city-block steps): a long narrow strip beyond that (a balcony strip, a corridor)
  // stays its own area instead of being swallowed by the nearest room
  const ring = new Int32Array(n), maxRing = Math.ceil(2 * r + 2 * Math.max(1, read.thick));   // rings are city-block steps
  for (let head = 0; head < tail; head++){
    const i = q[head], x = i % w, l = labels[i];
    if (ring[i] >= maxRing) continue;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]){
      if (j < 0 || j >= n || !free.m[j] || labels[j]) continue;
      labels[j] = l; ring[j] = ring[i] + 1; q[tail++] = j;
    }
  }
  // free areas without a core (closets, corridors narrower than a door, small leftovers) keep their own label
  const rest = components({w, h, m:free.m.map((v, i) => v && !labels[i] ? 1 : 0)});
  for (let i = 0; i < n; i++) if (rest.labels[i]) labels[i] = next + rest.labels[i];
  trimThin(labels, w, h, Math.max(3, Math.round(TRIM * Math.max(1, read.thick))));
  const count = next + rest.count, stats = Array.from({length:count}, () => ({area:0, x0:w, y0:h, x1:0, y1:0}));
  for (let i = 0; i < n; i++){
    const l = labels[i]; if (!l) continue;
    const s = stats[l - 1], x = i % w, y = (i - x) / w;
    s.area++; if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x; if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
  }
  // which areas meet: directly (split at a neck) or through free pixels that belong to no area (a trimmed
  // doorway), so rooms joined through an unbridged door still count as reachable from each other
  const meet = Array.from({length:count + 1}, () => new Set());
  for (let i = 0; i < n; i++){
    const l = labels[i]; if (!l) continue;
    const x = i % w;
    for (const j of [x < w - 1 ? i + 1 : -1, i + w < n ? i + w : -1]){
      if (j < 0) continue;
      const m = labels[j];
      if (m && m !== l){ meet[l].add(m); meet[m].add(l); }
    }
  }
  const loose = components({w, h, m:free.m.map((v, i) => v && !labels[i] ? 1 : 0)});
  const touch = Array.from({length:loose.count + 1}, () => new Set());
  for (let i = 0; i < n; i++){
    const g = loose.labels[i]; if (!g) continue;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && labels[j]) touch[g].add(labels[j]);
  }
  for (const set of touch) for (const a of set) for (const b of set) if (a !== b) meet[a].add(b);
  c = {free, comp:{labels, count, stats}, cands:new Map(), meet};
  cacheOf.set(read, c);
  return c;
}

// Outer boundary of label id (Moore-neighbour tracing), as pixel-corner points in the straightened frame.
function trace(labels, w, h, id, start){
  // boundary along pixel edges: walk the cracks between region and non-region pixels, keeping the region on the right
  const inR = (x, y) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === id;
  const sx = start % w, sy = (start - sx) / w;            // the first pixel in scan order: its top edge is boundary
  let x = sx, y = sy, dir = 0;                             // at corner (x, y), heading 0=right 1=down 2=left 3=up
  const pts = [];
  const dx = [1, 0, -1, 0], dy = [0, 1, 0, -1];
  // pixel to the right/left of the edge from corner (x, y) heading d
  const right = (x, y, d) => d === 0 ? inR(x, y) : d === 1 ? inR(x - 1, y) : d === 2 ? inR(x - 1, y - 1) : inR(x, y - 1);
  const left = (x, y, d) => d === 0 ? inR(x, y - 1) : d === 1 ? inR(x, y) : d === 2 ? inR(x - 1, y) : inR(x - 1, y - 1);
  const limit = 4 * (w + h) * 8;
  for (let n = 0; n < limit; n++){
    pts.push([x, y]);
    x += dx[dir]; y += dy[dir];
    if (x === sx && y === sy) break;
    // turn: prefer left (outer corner of the boundary), then straight, then right
    const l = (dir + 3) % 4, r = (dir + 1) % 4;
    if (right(x, y, l) && !left(x, y, l)) dir = l;
    else if (right(x, y, dir) && !left(x, y, dir)) { /* straight */ }
    else dir = r;
  }
  // keep the corners only
  return pts.filter((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}

// Douglas–Peucker on a closed polygon.
function simplify(pts, eps){
  if (pts.length < 4) return pts;
  // split at the two farthest-apart points
  let i0 = 0, i1 = 0, best = -1;
  for (let i = 0; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > best){ best = d; i1 = i; } }
  const dp = (a) => {
    if (a.length < 3) return a;
    const [p, q] = [a[0], a[a.length - 1]], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    let k = -1, dmax = 0;
    for (let i = 1; i < a.length - 1; i++){
      const d = Math.abs((q[0] - p[0]) * (p[1] - a[i][1]) - (p[0] - a[i][0]) * (q[1] - p[1])) / L;
      if (d > dmax){ dmax = d; k = i; }
    }
    if (dmax <= eps) return [p, q];
    return [...dp(a.slice(0, k + 1)).slice(0, -1), ...dp(a.slice(k))];
  };
  const A = pts.slice(i0, i1 + 1), B = [...pts.slice(i1), pts[0]];
  return [...dp(A).slice(0, -1), ...dp(B).slice(0, -1)];
}

// Edges snapped to 0/45/90°, collinear runs merged, short steps dropped, corners at the line intersections.
function regularize(pts, thick){
  const n = pts.length;
  let lines = [];
  for (let i = 0; i < n; i++){
    const a = pts[i], b = pts[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    const snap = Math.round(ang / 45) * 45;
    // long edges snap when within 8°; short ones (pixel stairs, a jamb) always do
    if (Math.abs(ang - snap) <= 8 || len < 3 * thick) ang = snap;
    lines.push({ang, mx:(a[0] + b[0]) / 2, my:(a[1] + b[1]) / 2, len});
  }
  const same = (p, q) => Math.abs(((p.ang - q.ang) % 360 + 540) % 360 - 180) < 1e-6;
  const offset = (p, q) => { const t = p.ang * Math.PI / 180; return Math.abs(-(q.mx - p.mx) * Math.sin(t) + (q.my - p.my) * Math.cos(t)); };
  // merge neighbours with the same direction (and on nearly the same line)
  for (let changed = true; changed && lines.length > 3;){
    changed = false;
    for (let i = 0; i < lines.length && lines.length > 3; i++){
      const p = lines[i], j = (i + 1) % lines.length, q = lines[j];
      if (same(p, q) && offset(p, q) <= thick * 0.75){
        const L = p.len + q.len;
        const m = {ang:p.ang, mx:(p.mx * p.len + q.mx * q.len) / L, my:(p.my * p.len + q.my * q.len) / L, len:L};
        lines.splice(i, 1, m); lines.splice(j > i ? j : 0, 1); changed = true;
      }
    }
  }
  const corner = (p, q) => {
    const a = p.ang * Math.PI / 180, b = q.ang * Math.PI / 180;
    const d = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((q.mx - p.mx) * Math.sin(b) - (q.my - p.my) * Math.cos(b)) / d;
    return [p.mx + t * Math.cos(a), p.my + t * Math.sin(a)];
  };
  // drop short edges whose neighbours meet (a corner cut by the pixel stairs)
  for (let changed = true; changed && lines.length > 3;){
    changed = false;
    const cs = lines.map((p, i) => corner(lines[(i + lines.length - 1) % lines.length], p));
    for (let i = 0; i < lines.length && lines.length > 3; i++){
      const a = cs[i], b = cs[(i + 1) % lines.length];
      if (!a || !b) continue;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < thick * 0.75){
        const ip = (i + lines.length - 1) % lines.length, inx = (i + 1) % lines.length;
        const prev = lines[ip], next = lines[inx];
        if (corner(prev, next)){ lines.splice(i, 1); changed = true; break; }
        // a small step between two parallel edges: one straight edge, where the longer one was
        if (same(prev, next) && offset(prev, next) <= thick * 0.75){
          const L = prev.len + next.len, keep = prev.len >= next.len ? prev : next;
          const m = {ang:prev.ang, mx:(prev.mx * prev.len + next.mx * next.len) / L, my:(prev.my * prev.len + next.my * next.len) / L, len:L};
          // keep the longer edge's line: shift the merged midpoint onto it
          const t = keep.ang * Math.PI / 180, off = -(m.mx - keep.mx) * Math.sin(t) + (m.my - keep.my) * Math.cos(t);
          m.mx += off * Math.sin(t); m.my -= off * Math.cos(t);
          const rm = [ip, i, inx].sort((a, b) => b - a);
          for (const k of rm) lines.splice(k, 1);
          lines.splice(Math.min(ip, i, inx), 0, m);
          changed = true; break;
        }
      }
    }
  }
  const out = [];
  for (let i = 0; i < lines.length; i++){
    const prev = lines[(i + lines.length - 1) % lines.length], cur = lines[i], c = corner(prev, cur);
    if (c){ out.push(c); continue; }
    // two parallel edges with a step between them: the end of the first, then straight across to the second
    const t = prev.ang * Math.PI / 180, ex = prev.mx + Math.cos(t) * prev.len / 2, ey = prev.my + Math.sin(t) * prev.len / 2;
    const u = cur.ang * Math.PI / 180, along = (ex - cur.mx) * Math.cos(u) + (ey - cur.my) * Math.sin(u);
    out.push([ex, ey], [cur.mx + along * Math.cos(u), cur.my + along * Math.sin(u)]);
  }
  return out.length >= 3 ? out : pts;
}

const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++){ const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(s) / 2; };
function hull(points){
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p){ while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()){ while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

// The candidate for one labelled area (cached).
function candidate(read, reg, id){
  if (reg.cands.has(id)) return reg.cands.get(id);
  const {w, h} = read.size, {labels} = reg.comp, st = reg.comp.stats[id - 1];
  let start = -1;
  for (let y = st.y0; y <= st.y1 && start < 0; y++) for (let x = st.x0; x <= st.x1; x++) if (labels[y * w + x] === id){ start = y * w + x; break; }
  const raw = trace(labels, w, h, id, start);
  const straight = regularize(simplify(raw, Math.max(1, 0.5 * read.thick)), read.thick);
  // how much of its boundary opens straight onto the outside (only bridged for the footprint, e.g. a terrace edge)
  let edge = 0, open = 0;
  for (let y = st.y0; y <= st.y1; y++) for (let x = st.x0; x <= st.x1; x++){
    const i = y * w + x;
    if (labels[i] !== id) continue;
    for (const j of [i - 1, i + 1, i - w, i + w]){
      if (j < 0 || j >= w * h || labels[j] === id) continue;
      edge++;
      if (!read.foot.m[j]) open++;
    }
  }
  // bridges with this area on one side
  const off = Math.max(2, Math.ceil(read.thick));
  const bridgeIds = read.bridges.filter(b => {
    const mx = Math.round((b.a[0] + b.b[0]) / 2), my = Math.round((b.a[1] + b.b[1]) / 2);
    const sides = b.dir === "h" ? [[mx, my - off], [mx, my + off]] : [[mx - off, my], [mx + off, my]];
    return sides.some(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === id);
  }).map(b => b.id);
  const c = {
    id:"c" + id, label:id,
    outline:orientCW(straight.map(p => toSource(read, p)).map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10])),
    areaPx:st.area, hullRatio:area(straight) / (area(hull(straight)) || 1),
    touchesOutside:edge > 0 && open / edge > 0.25, bridgeIds, meets:[...reg.meet[id]]
  };
  reg.cands.set(id, c);
  return c;
}

export function roomCandidates(read){
  if (!read.quality.ok && read.quality.reason !== "noEnclosure" && !read.thick) return [];
  const reg = regions(read), min = 0.002 * read.size.w * read.size.h;
  const out = [];
  reg.comp.stats.forEach((s, k) => { if (s.area >= min) out.push(candidate(read, reg, k + 1)); });
  return out;
}

// The label under a source-image point, moved to the nearest free pixel within maxDist (straightened px).
export function labelAt(read, p, maxDist){
  const reg = regions(read), {w, h} = read.size, [sx, sy] = toStraight(read, p).map(Math.round);
  let best = 0, bestD = Infinity;
  for (let dy = -maxDist; dy <= maxDist; dy++) for (let dx = -maxDist; dx <= maxDist; dx++){
    const x = sx + dx, y = sy + dy, d = dx * dx + dy * dy;
    if (x < 0 || y < 0 || x >= w || y >= h || d >= bestD || d > maxDist * maxDist) continue;
    const l = reg.comp.labels[y * w + x];
    if (l){ best = l; bestD = d; }
  }
  return best;
}

export function candidateByLabel(read, label){
  return label ? candidate(read, regions(read), label) : null;
}

// The room under a click: null when there is none, it opens onto the outside, or it isn't room-shaped.
export function fillAt(read, p){
  const label = labelAt(read, p, Math.max(2, Math.ceil(read.thick)));
  if (!label) return null;
  const reg = regions(read), st = reg.comp.stats[label - 1];
  if (st.area < 0.002 * read.size.w * read.size.h) return null;
  const c = candidate(read, reg, label);
  return c.touchesOutside || c.hullRatio < 0.6 ? null : c;
}
