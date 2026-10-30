// Room geometry, no DOM: shapes, walls, openings, fitting furniture inside.
// Metres everywhere except names ending in Cm. Plan coordinates: x → east, y → south,
// origin at the top-left of the bounding box. Corners run clockwise on screen.

export const toM = (cm) => Math.round(Number(cm)) / 100;
export const toCm = (m) => Math.round(Number(m) * 100);

const MIN_SIDE_CM = 100;
const EPS = 1e-9;

// form: {shape:"rect"|"L", lengthCm, widthCm, cutLengthCm, cutWidthCm, corner:"ne"|"nw"|"se"|"sw"}
export function shapePoly(form){
  const L = toM(form.lengthCm), W = toM(form.widthCm);
  if (!(form.lengthCm >= MIN_SIDE_CM && form.widthCm >= MIN_SIDE_CM)) return {error:"tooSmall"};
  const box = [[0, 0], [L, 0], [L, W], [0, W]];
  if (form.shape !== "L") return {poly:box};

  const cl = toM(form.cutLengthCm), cw = toM(form.cutWidthCm);
  if (!(form.cutLengthCm > 0 && form.cutWidthCm > 0)) return {error:"tooSmall"};
  if (cl >= L - EPS || cw >= W - EPS) return {error:"cutTooBig"};

  // Replace the chosen bounding-box corner with the three points of the notch.
  const notch = {
    nw: [[0, cw], [cl, cw], [cl, 0]],
    ne: [[L - cl, 0], [L - cl, cw], [L, cw]],
    se: [[L, W - cw], [L - cl, W - cw], [L - cl, W]],
    sw: [[cl, W], [cl, W - cw], [0, W - cw]]
  }[form.corner || "ne"];
  const idx = {nw:0, ne:1, se:2, sw:3}[form.corner || "ne"];
  const pts = [...box.slice(0, idx), ...notch, ...box.slice(idx + 1)];
  // Start at the top-left-most corner (smallest y, then smallest x).
  let start = 0;
  pts.forEach((p, i) => { const s = pts[start]; if (p[1] < s[1] - EPS || (Math.abs(p[1] - s[1]) < EPS && p[0] < s[0])) start = i; });
  return {poly:[...pts.slice(start), ...pts.slice(0, start)]};
}

export function wallsOf(poly){
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return {i, a, b, len:Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1e6) / 1e6};
  });
}

// Unit direction of a wall and its normal pointing into the room (corners run clockwise on screen).
export function wallFrame({a, b, len}){
  const dir = [(b[0] - a[0]) / len + 0, (b[1] - a[1]) / len + 0];
  return {dir, normal:[-dir[1] + 0, dir[0] + 0]};
}

// Point at distance s along a wall from its start corner.
export const alongWall = (w, s) => { const {dir} = wallFrame(w); return [w.a[0] + dir[0] * s, w.a[1] + dir[1] * s]; };

export function bbox(poly){
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return {L:Math.max(...xs) - Math.min(...xs), W:Math.max(...ys) - Math.min(...ys)};
}

export function polyArea(poly){
  let a = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; });
  return Math.abs(a) / 2;
}

export function pointInPoly(x, y, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Inside the room and at least `margin` from every wall (where someone walking around can stand).
export function standsInside(x, y, poly, margin){
  if (!pointInPoly(x, y, poly)) return false;
  return wallsOf(poly).every(({a, b, len}) => {
    const t = Math.min(1, Math.max(0, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len)));
    return Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y) >= margin;
  });
}

// Points exactly on an edge count as inside, so furniture can stand against a wall.
function onEdge(x, y, poly){
  return wallsOf(poly).some(({a, b, len}) => {
    const t = ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len);
    if (t < -EPS || t > 1 + EPS) return false;
    return Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y) < 1e-6;
  });
}
const inOrOn = (x, y, poly) => pointInPoly(x, y, poly) || onEdge(x, y, poly);

// rect: {x, y, w, d} with x/y at the centre. Inside when its corners and centre are inside,
// and no room corner pokes into it (that catches the L notch).
export function rectInside({x, y, w, d}, poly){
  const pts = [[x, y], [x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]];
  if (!pts.every(([px, py]) => inOrOn(px, py, poly))) return false;
  return !poly.some(([px, py]) => px > x - w / 2 + EPS && px < x + w / 2 - EPS && py > y - d / 2 + EPS && py < y + d / 2 - EPS);
}

// Nearest position (5 cm grid) where the rect fits, searching outward from where it is.
export function fitInside(rect, poly){
  if (rectInside(rect, poly)) return {x:rect.x, y:rect.y};
  const {L, W} = bbox(poly), step = 0.05;
  const clampX = (v) => Math.min(Math.max(v, rect.w / 2), L - rect.w / 2);
  const clampY = (v) => Math.min(Math.max(v, rect.d / 2), W - rect.d / 2);
  const x0 = Math.round(clampX(rect.x) / step) * step, y0 = Math.round(clampY(rect.y) / step) * step;
  const maxR = Math.ceil(Math.max(L, W) / step);
  for (let r = 0; r <= maxR; r++){
    let best = null, bestD = Infinity;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++){
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const x = Math.round((x0 + i * step) * 100) / 100, y = Math.round((y0 + j * step) * 100) / 100;
      if (!rectInside({...rect, x, y}, poly)) continue;
      const dd = Math.hypot(x - rect.x, y - rect.y);
      if (dd < bestD){ bestD = dd; best = {x, y}; }
    }
    if (best) return best;
  }
  // Doesn't fit anywhere (piece bigger than the room): centre it.
  return {x:L / 2, y:W / 2};
}

export function nearestWall(x, y, poly, maxDist = 0.8){
  let best = null, bestD = Infinity;
  for (const {i, a, b, len} of wallsOf(poly)){
    const t = Math.min(1, Math.max(0, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len)));
    const dd = Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y);
    if (dd < bestD){ bestD = dd; best = i; }
  }
  return bestD <= maxDist ? best : null;
}

export function wallArea(i, poly, H, openings = []){
  const w = wallsOf(poly)[i]; if (!w) return 0;
  const cut = openings.filter(o => o.wall === i).reduce((s, o) => s + o.width * o.height, 0);
  return Math.max(0, w.len * H - cut);
}

// Opening: {id, type:"door"|"window", wall, offset, width, height, sill} in metres.
export function validateOpenings(poly, H, openings){
  const walls = wallsOf(poly), err = {};
  for (const o of openings){
    const w = walls[o.wall];
    if (o.width < 0.3 - EPS || o.height < 0.3 - EPS) err[o.id] = "tooSmall";
    else if (!w || o.offset < -EPS || o.offset + o.width > w.len + EPS) err[o.id] = "beyondWall";
    else if ((o.type === "door" ? 0 : o.sill) + o.height > H + EPS || o.sill < -EPS) err[o.id] = "tooTall";
  }
  for (let i = 0; i < openings.length; i++) for (let j = i + 1; j < openings.length; j++){
    const a = openings[i], b = openings[j];
    if (a.wall !== b.wall) continue;
    const overlap = Math.min(a.offset + a.width, b.offset + b.width) - Math.max(a.offset, b.offset);
    if (overlap > 0.001){ err[a.id] ||= "overlap"; err[b.id] ||= "overlap"; }
  }
  return err;
}

// How far each side of an axis-aligned rect {x, y, w, d} (centre, size) is from the walls it faces:
// for each side ("n" up, "e" right, "s" down, "w" left) the nearest wall parallel to it whose span overlaps
// the side, measured straight out. Each entry: {side, wall, dist, from, to}; from/to are the ends of the
// dimension line, at the middle of the stretch of the side that faces that wall. A side facing no wall is left out.
const SIDES = [
  {side:"n", axis:1, sign:-1}, {side:"e", axis:0, sign:1},
  {side:"s", axis:1, sign:1},  {side:"w", axis:0, sign:-1}
];
export function clearances({x, y, w, d}, poly){
  const half = [w / 2, d / 2], c = [x, y];
  const out = [];
  for (const {side, axis, sign} of SIDES){
    const o = 1 - axis;   // the axis the side runs along
    const edge = c[axis] + sign * half[axis], lo = c[o] - half[o], hi = c[o] + half[o];
    let best = null;
    for (const wl of wallsOf(poly)){
      if (Math.abs(wl.a[axis] - wl.b[axis]) > EPS) continue;   // not parallel to this side
      const dist = (wl.a[axis] - edge) * sign;
      if (dist < -EPS) continue;                                // behind the side
      const s0 = Math.max(lo, Math.min(wl.a[o], wl.b[o])), s1 = Math.min(hi, Math.max(wl.a[o], wl.b[o]));
      if (s1 - s0 <= EPS) continue;                             // doesn't face this side
      if (!best || dist < best.dist - EPS) best = {wall:wl.i, dist:Math.max(0, dist), mid:(s0 + s1) / 2};
    }
    if (!best) continue;
    const from = [0, 0], to = [0, 0];
    from[axis] = edge; to[axis] = edge + sign * best.dist; from[o] = to[o] = best.mid;
    out.push({side, wall:best.wall, dist:Math.round(best.dist * 1e6) / 1e6, from, to});
  }
  return out;
}

// Alignment between pieces (rects {x, y, w, d}, centre and size), like a drawing program's smart guides.
// Each rect has three lines per axis: its start edge, its centre and its end edge. Edges line up with edges
// and centres with centres (never a centre with an edge). `room` {L, W} adds the room's centre lines.
// A rect with `only: "x" | "y"` (a window or door, see openings.js openingRect) is a fixed reference on that axis
// alone: pieces line up with it along its wall, and it is never one of the pieces either side of an equal gap.
const lines3 = (c, size) => [c - size / 2, c, c + size / 2];
const pairs = (mine, theirs) => [[mine[1], theirs[1]], ...[0, 2].flatMap(i => [0, 2].map(j => [mine[i], theirs[j]]))];
const AXES = [{k:"x", size:"w", o:"y", osize:"d"}, {k:"y", size:"d", o:"x", osize:"w"}];

// The pieces right next to `rect` on each side along axis k: of those level with it (overlapping it across
// the axis) and not overlapping it along the axis, the nearest one before it and the nearest one after it.
function neighbours(rect, others, {k, size, o, osize}){
  const lo = (r, a, s) => r[a] - r[s] / 2, hi = (r, a, s) => r[a] + r[s] / 2;
  let before = null, after = null;
  for (const r of others){
    if (r.only) continue;
    if (hi(r, o, osize) <= lo(rect, o, osize) || lo(r, o, osize) >= hi(rect, o, osize)) continue;   // not level with it
    if (hi(r, k, size) <= rect[k] && (!before || hi(r, k, size) > hi(before, k, size))) before = r;
    else if (lo(r, k, size) >= rect[k] && (!after || lo(r, k, size) < lo(after, k, size))) after = r;
  }
  if (!before || !after) return null;
  const start = hi(before, k, size), end = lo(after, k, size);
  return end - start >= rect[size] ? {before, after, start, end, mid:(start + end) / 2} : null;   // it must fit between them
}

// Nudges the rect so that the closest pair of lines within `tol` coincide, separately on each axis.
// Being centred between the pieces on either side (equal gaps) counts as one more line.
export function snapAlign(rect, others, room, tol){
  const out = {x:rect.x, y:rect.y};
  for (const axis of AXES){
    const {k, size} = axis, mine = lines3(rect[k], rect[size]);
    let best = null;
    const consider = (diff) => { if (Math.abs(diff) <= tol && (best === null || Math.abs(diff) < Math.abs(best))) best = diff; };
    for (const o of others) if (!o.only || o.only === k) for (const [m, t] of pairs(mine, lines3(o[k], o[size]))) consider(t - m);
    if (room) consider((k === "x" ? room.L : room.W) / 2 - rect[k]);
    const n = neighbours(rect, others, axis);
    if (n) consider(n.mid - rect[k]);
    if (best !== null) out[k] = Math.round((rect[k] + best) * 1e6) / 1e6;
  }
  return out;
}

// The guides to draw for lines that coincide exactly: {axis:"x"|"y", at, from, to}. A guide on axis "x" is a
// vertical line at x = at running from y = from to y = to, across both pieces (the whole room for its centre).
export function alignGuides(rect, others, room, eps = 1e-4){
  const guides = [];
  const add = (axis, at, from, to) => {
    const g = guides.find(g => g.axis === axis && Math.abs(g.at - at) < eps);
    if (g){ g.from = Math.min(g.from, from); g.to = Math.max(g.to, to); }
    else guides.push({axis, at:Math.round(at * 1e6) / 1e6, from, to});
  };
  for (const {k, size, o, osize} of AXES){
    const mine = lines3(rect[k], rect[size]);
    for (const other of others){
      if (other.only && other.only !== k) continue;
      const theirs = lines3(other[k], other[size]);
      const from = Math.min(rect[o] - rect[osize] / 2, other[o] - other[osize] / 2);
      const to = Math.max(rect[o] + rect[osize] / 2, other[o] + other[osize] / 2);
      for (const [m, t] of pairs(mine, theirs)) if (Math.abs(t - m) < eps) add(k, m, from, to);
    }
    if (room && Math.abs((k === "x" ? room.L : room.W) / 2 - rect[k]) < eps) add(k, rect[k], 0, k === "x" ? room.W : room.L);
  }
  return guides;
}

// Equal gaps: where the rect sits exactly midway between the pieces on either side, one guide per axis,
// {along:"x"|"y", gaps:[{from, to, at}, {from, to, at}]}. Each gap runs along the axis from one piece's
// edge to the next, drawn at `at` across it (the middle of where the two pieces are level). Gaps under 1 cm don't count.
export function spacingGuides(rect, others, eps = 1e-4){
  const out = [];
  for (const axis of AXES){
    const {k, size, o, osize} = axis, n = neighbours(rect, others, axis);
    if (!n || Math.abs(n.mid - rect[k]) >= eps || (n.end - n.start - rect[size]) / 2 < .01) continue;
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const level = (r) => r6((Math.max(rect[o] - rect[osize] / 2, r[o] - r[osize] / 2) + Math.min(rect[o] + rect[osize] / 2, r[o] + r[osize] / 2)) / 2);
    out.push({along:k, gaps:[
      {from:r6(n.start), to:r6(rect[k] - rect[size] / 2), at:level(n.before)},
      {from:r6(rect[k] + rect[size] / 2), to:r6(n.end), at:level(n.after)}
    ]});
  }
  return out;
}

// Line several pieces up against their combined bounding box: "left" | "hcenter" | "right" move them
// sideways, "top" | "vcenter" | "bottom" up or down. Returns each rect's new centre, in order.
// `anchors` (windows and doors) stay put: when any of them lies on the mode's axis, the pieces line up with
// those instead of with each other.
export const ALIGN_AXIS = {left:"x", hcenter:"x", right:"x", top:"y", vcenter:"y", bottom:"y"};
export function alignRects(rects, mode, anchors = []){
  const fixed = anchors.filter(a => !a.only || a.only === ALIGN_AXIS[mode]), ref = fixed.length ? fixed : rects;
  const minX = Math.min(...ref.map(r => r.x - r.w / 2)), maxX = Math.max(...ref.map(r => r.x + r.w / 2));
  const minY = Math.min(...ref.map(r => r.y - r.d / 2)), maxY = Math.max(...ref.map(r => r.y + r.d / 2));
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  return rects.map(r => {
    switch (mode){
      case "left":    return {x:r6(minX + r.w / 2), y:r.y};
      case "hcenter": return {x:r6((minX + maxX) / 2), y:r.y};
      case "right":   return {x:r6(maxX - r.w / 2), y:r.y};
      case "top":     return {x:r.x, y:r6(minY + r.d / 2)};
      case "vcenter": return {x:r.x, y:r6((minY + maxY) / 2)};
      case "bottom":  return {x:r.x, y:r6(maxY - r.d / 2)};
      default:        return {x:r.x, y:r.y};
    }
  });
}
