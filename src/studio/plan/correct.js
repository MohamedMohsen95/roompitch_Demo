// Size corrections on the real flat (metres): a room's width or length, or one wall's length. The side that
// moves is an interior wall when there is one; the wall it shares with a neighbour moves as one, so the
// neighbour resizes. When that wall runs on past the room, the caller chooses: the whole wall line moves
// (every room on it changes) or only this room's part (the neighbour gets a step). The tracing is never touched.
import { WALL_TOL_M, outlineProblem } from "./flat.js";
import { realOf, materialize, realOverlaps } from "./real.js";

const PAR = Math.sin(2 * Math.PI / 180);       // parallel / perpendicular within 2°
const EPS = 0.03;                              // corners on the same line (m)
const r6 = (v) => Math.round(v * 1e6) / 1e6 + 0;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const crs = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a, b) => { const d = sub(b, a), l = len(d) || 1; return [d[0] / l, d[1] / l]; };
const cm = (m) => Math.round(m * 1000) / 10;

function edge(poly, i){
  const n = poly.length, a = poly[i % n], b = poly[(i + 1) % n], u = unit(a, b);
  return {i:i % n, a, b, u, n:[u[1], -u[0]], len:len(sub(b, a))};   // n: outward for a clockwise poly (y down)
}

// Width = edge 0, length = edge 1 of a 4-corner right-angled poly; other polys: extents along edge 0's axes.
export function roomBox(flat, id){
  const s = realOf(flat).spaces.find(x => x.id === id);
  if (!s) return null;
  const p = s.poly, e0 = edge(p, 0);
  const rect = p.length === 4 && [0, 1, 2, 3].every(i => Math.abs(dot(edge(p, i).u, edge(p, i + 1).u)) <= PAR);
  if (rect) return {rect, width:cm(e0.len), length:cm(edge(p, 1).len)};
  const xs = p.map(q => dot(q, e0.u)), ys = p.map(q => dot(q, e0.n));
  return {rect, width:cm(Math.max(...xs) - Math.min(...xs)), length:cm(Math.max(...ys) - Math.min(...ys))};
}

// Edges of other spaces facing edge e across a wall: parallel, on its outer side within a wall's thickness,
// overlapping it along its length. Each with its offset g from e's line and its range [t0, t1] along e.
function facing(spaces, selfId, e){
  const out = [];
  for (const s of spaces){
    if (s.id === selfId) continue;
    for (let i = 0; i < s.poly.length; i++){
      const f = edge(s.poly, i);
      if (Math.abs(crs(e.u, f.u)) > PAR || dot(e.u, f.u) > 0) continue;          // parallel, running the other way
      const g = dot(sub([(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2], e.a), e.n);
      if (g < -EPS || g > WALL_TOL_M + 0.001) continue;
      const ta = dot(sub(f.a, e.a), e.u), tb = dot(sub(f.b, e.a), e.u);
      const t0 = Math.min(ta, tb), t1 = Math.max(ta, tb);
      if (Math.min(t1, e.len) - Math.max(t0, 0) <= 0.05) continue;
      out.push({id:s.id, i, f, g, t0, t1});
    }
  }
  return out;
}

const distToSeg = (p, a, b) => {
  const d = sub(b, a), l2 = dot(d, d) || 1, t = Math.max(0, Math.min(1, dot(sub(p, a), d) / l2));
  return len(sub(p, [a[0] + d[0] * t, a[1] + d[1] * t]));
};

// The work behind planCorrection and applyCorrection: {plan, real} or {plan} when refused.
function compute(flat, c, opts = {}){
  if (!(flat.scale > 0)) return {plan:{ok:false, reason:"noScale"}};
  const real = realOf(flat), self = real.spaces.find(s => s.id === c.spaceId);
  if (!self) return {plan:{ok:false, reason:"noChange"}};
  const box = roomBox(flat, c.spaceId), poly = self.poly, n = poly.length;
  let sides, delta, mine = null, alone = false;
  if (c.kind === "room"){
    if (!box.rect) return {plan:{ok:false, reason:"notRect"}};
    sides = c.axis === "width" ? [1, 3] : [2, 0];
    delta = c.cm / 100 - (c.axis === "width" ? box.width : box.length) / 100;
  } else {
    const w = edge(poly, c.i), next = edge(poly, c.i + 1);
    delta = c.cm / 100 - w.len;
    const endT = dot(w.b, w.u);
    const perp = Math.abs(dot(w.u, next.u)) <= PAR;
    // corners past the wall's end (a corner up to EPS short of it still counts: tracings are rarely square);
    // with a perpendicular next wall, that whole wall always moves
    mine = poly.map((p, k) => dot(p, w.u) >= endT - (perp ? EPS : 1e-6) || (perp && (k === next.i || k === (next.i + 1) % n)) ? k : -1).filter(k => k >= 0);
    if (perp) sides = [next.i];
    else { sides = [next.i]; alone = true; }
  }
  if (Math.abs(delta) < 0.005) return {plan:{ok:false, reason:"noChange"}};

  const interior = (i) => facing(real.spaces, self.id, edge(poly, i)).length > 0;
  let side, otherSide = null, outsideMoved = false;
  if (sides.length === 1) side = sides[0];
  else {
    const [end, start] = sides, ie = interior(end), is = interior(start);
    side = ie || !is ? end : start;
    if (!ie && !is) outsideMoved = true;
    otherSide = side === end ? start : end;
    if (opts.side === otherSide){ [side, otherSide] = [otherSide, side]; outsideMoved = !interior(side) && !interior(otherSide); }
  }
  const e = edge(poly, side), mv = c.kind === "wall" ? edge(poly, c.i).u : e.n;
  const step = [mv[0] * delta, mv[1] * delta];
  const move = (p) => [r6(p[0] + step[0]), r6(p[1] + step[1])];

  // corners to move, per space; poly replacements (steps); segments that move (before), for the openings
  const moves = new Map(), replace = new Map(), segs = [];
  const add = (id, k) => (moves.get(id) || moves.set(id, new Set()).get(id)).add(k);
  for (const k of mine || [e.i, (e.i + 1) % n]) add(self.id, k);
  for (let k = 0; k < n; k++){ const q = edge(poly, k); if (moves.get(self.id).has(q.i) && moves.get(self.id).has((q.i + 1) % n)) segs.push([q.a, q.b]); }

  const face = alone ? [] : facing(real.spaces, self.id, e);
  const runsPast = face.some(x => x.t0 < -WALL_TOL_M || x.t1 > e.len + WALL_TOL_M);
  const whole = runsPast && opts.whole !== false;
  if (whole){
    // every edge on the wall's two face lines, connected along it to this room's side
    const lines = [0, ...face.map(x => x.g)];
    let lo = Math.min(0, ...face.map(x => x.t0)), hi = Math.max(e.len, ...face.map(x => x.t1)), grew = true;
    const on = [];
    for (const s of real.spaces) for (let i = 0; i < s.poly.length; i++){
      const f = edge(s.poly, i);
      if (Math.abs(crs(e.u, f.u)) > PAR) continue;
      const g = dot(sub(f.a, e.a), e.n), g2 = dot(sub(f.b, e.a), e.n);
      if (!lines.some(L => Math.abs(g - L) <= EPS && Math.abs(g2 - L) <= EPS)) continue;
      const ta = dot(sub(f.a, e.a), e.u), tb = dot(sub(f.b, e.a), e.u);
      on.push({id:s.id, f, t0:Math.min(ta, tb), t1:Math.max(ta, tb), used:false});
    }
    while (grew){
      grew = false;
      for (const x of on){
        if (x.used || x.t1 < lo - WALL_TOL_M || x.t0 > hi + WALL_TOL_M) continue;
        x.used = true; grew = true; lo = Math.min(lo, x.t0); hi = Math.max(hi, x.t1);
        add(x.id, x.f.i); add(x.id, (x.f.i + 1) % realOf(flat).spaces.find(s => s.id === x.id).poly.length);
        segs.push([x.f.a, x.f.b]);
      }
    }
  } else {
    for (const x of face){
      const s = real.spaces.find(q => q.id === x.id), m = s.poly.length;
      if (x.t0 >= -WALL_TOL_M && x.t1 <= e.len + WALL_TOL_M){ add(x.id, x.i); add(x.id, (x.i + 1) % m); segs.push([x.f.a, x.f.b]); continue; }
      // a step: the part of the neighbour's edge facing this room moves, the rest stays
      const lo = Math.max(x.t0, 0), hi = Math.min(x.t1, e.len);
      const at = (t) => [e.a[0] + e.u[0] * t + e.n[0] * x.g, e.a[1] + e.u[1] * t + e.n[1] * x.g];
      const tOf = (p) => dot(sub(p, e.a), e.u);
      const inR = (t) => t >= lo - WALL_TOL_M && t <= hi + WALL_TOL_M;
      const fa = x.f.a, fb = x.f.b, ta = tOf(fa), tb = tOf(fb), dir = Math.sign(tb - ta);
      // boundaries strictly inside the edge, in the edge's direction
      const bounds = [lo, hi].filter(t => (t - ta) * dir > WALL_TOL_M && (tb - t) * dir > WALL_TOL_M).sort((p, q) => (p - q) * dir);
      const pts = [];
      let moving = inR(ta), start = fa;
      for (const t of bounds){
        const q = at(t);
        if (moving){ pts.push(move(q), q); segs.push([start, q]); }
        else { pts.push(q, move(q)); start = q; }
        moving = !moving;
      }
      if (moving) segs.push([start, fb]);
      const out = [];
      for (let k = 0; k < m; k++){
        const p = s.poly[k];
        if (k === x.i) out.push(inR(ta) ? move(p) : p, ...pts);
        else if (k === (x.i + 1) % m) out.push(inR(tb) ? move(p) : p);
        else out.push(p);
      }
      replace.set(x.id, out);
    }
  }

  // build the new spaces
  const spaces = real.spaces.map(s => {
    const ks = moves.get(s.id), rep = replace.get(s.id);
    if (rep) return {...s, poly:rep};
    return ks ? {...s, poly:s.poly.map((p, k) => ks.has(k) ? move(p) : p)} : s;
  });
  const openings = real.openings.map(o => segs.some(([a, b]) => distToSeg(o.a, a, b) <= WALL_TOL_M && distToSeg(o.b, a, b) <= WALL_TOL_M)
    ? {...o, a:move(o.a), b:move(o.b)} : o);
  const next = {...real, spaces, openings};

  // what changed, and is it still a room
  const after = {...flat, real:next}, affected = [];
  const order = [self.id, ...real.spaces.map(s => s.id).filter(id => id !== self.id)];
  for (const id of order){
    const was = real.spaces.find(s => s.id === id), now = spaces.find(s => s.id === id);
    if (was === now) continue;
    const b0 = roomBox(flat, id), b1 = roomBox(after, id);
    if (now.poly.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1])) || outlineProblem(now.poly.map(p => [p[0] * 100, p[1] * 100]))
      || b1.width < 30 || b1.length < 30 || area(now.poly) <= 0) return {plan:{ok:false, reason:"tooSmall"}};
    affected.push({id, name:flat.spaces.find(s => s.id === id)?.name || id, before:[b0.width, b0.length], after:[b1.width, b1.length], confirmed:real.confirmed.includes(id)});
  }
  // no correction may make rooms overlap that didn't
  const key = (p) => p.join("|"), had = new Set(realOverlaps(flat).map(key));
  if (realOverlaps(after).some(p => !had.has(key(p)))) return {plan:{ok:false, reason:"overlap"}};
  return {plan:{ok:true, side, otherSide, runsPast, outsideMoved, affected}, real:next};
}
const area = (o) => { let a = 0; o.forEach((p, i) => { const q = o[(i + 1) % o.length]; a += p[0] * q[1] - q[0] * p[1]; }); return a / 2; };

export const planCorrection = (flat, c, opts) => compute(flat, c, opts).plan;

export function applyCorrection(flat, c, opts){
  const r = compute(materialize(flat), c, opts);
  if (!r.plan.ok) return flat;
  const confirmed = r.real.confirmed.includes(c.spaceId) ? r.real.confirmed : [...r.real.confirmed, c.spaceId];
  return {...flat, real:{...r.real, confirmed}};
}
