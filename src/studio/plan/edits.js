// The designer's corrections to the wall reading: walls drawn where the program saw none, and stretches
// erased where it saw a wall that isn't there. They are applied to the masks of the first reading, after
// its filters, so a drawn wall always counts and an erase always removes. An erase keeps the room boundary
// (the two sides stay two spaces, open to each other); a drawn wall that stops short of the next wall closes
// the gap up to 1.5 m, and that gap is reported (it becomes an open part of the room).
import { toStraight, toSource } from "./walls.js";
import { maskNot, floodFromEdges } from "./raster.js";

const copy = (mk) => ({w:mk.w, h:mk.h, m:new Uint8Array(mk.m)});

// Every pixel within width / 2 of the segment a-b set to v.
function paint(mk, a, b, width, v){
  const r = width / 2, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r)), x1 = Math.min(mk.w - 1, Math.ceil(Math.max(a[0], b[0]) + r));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r)), y1 = Math.min(mk.h - 1, Math.ceil(Math.max(a[1], b[1]) + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
    const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2));
    const ex = a[0] + dx * t - px, ey = a[1] + dy * t - py;
    if (ex * ex + ey * ey <= r * r) mk.m[y * mk.w + x] = v;
  }
}

export function applyEdits(read, edits, k, scale = null){
  if (!edits || !edits.length) return read;
  const long = Math.max(read.src.w, read.src.h);
  const thick = read.thick >= 2 ? read.thick : Math.max(2, Math.round(0.01 * long));
  const walls = copy(read.walls), closed = copy(read.closed), outer = copy(read.outer || read.closed);
  const bridges = read.bridges.map(b => ({...b}));
  const maxGap = scale > 0 ? 1.5 / (scale / k) : Math.round(0.08 * long);
  const toS = (p) => toStraight(read, [p[0] * k, p[1] * k]);
  const on = (x, y) => { x = Math.floor(x); y = Math.floor(y); return x >= 0 && y >= 0 && x < closed.w && y < closed.h && closed.m[y * closed.w + x] === 1; };
  let n = 0;
  const drawn = [];
  for (const e of edits){
    const a = toS(e.a), b = toS(e.b);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
    if (e.kind === "erase"){
      const band = 1.6 * thick;
      paint(walls, a, b, band, 0); paint(closed, a, b, band, 0);
      paint(closed, a, b, thick, 1);                               // the room boundary stays
      for (const br of bridges){
        const m = [(br.a[0] + br.b[0]) / 2, (br.a[1] + br.b[1]) / 2], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        if (Math.hypot(a[0] + dx * t - m[0], a[1] + dy * t - m[1]) <= band / 2) br.erased = true;
      }
      continue;
    }
    paint(walls, a, b, thick, 1); paint(closed, a, b, thick, 1); paint(outer, a, b, thick, 1);
    drawn.push([a, b]);
  }
  // then, with every edit painted (so the order they were drawn in doesn't matter): from each end of each
  // drawn wall, straight ahead, the next wall within maxGap closes the gap
  for (const [a, b] of drawn){
    for (const [end, from] of [[b, a], [a, b]]){
      const len = Math.hypot(end[0] - from[0], end[1] - from[1]), u = [(end[0] - from[0]) / len, (end[1] - from[1]) / len];
      const start = thick / 2 + 1;
      if (on(end[0] + u[0] * start, end[1] + u[1] * start)) continue;           // already touching a wall
      for (let s = start + 1; s <= maxGap; s++){
        const p = [end[0] + u[0] * s, end[1] + u[1] * s];
        if (p[0] < 0 || p[1] < 0 || p[0] >= closed.w || p[1] >= closed.h) break;
        if (!on(p[0], p[1])) continue;
        paint(closed, end, p, thick, 1); paint(outer, end, p, thick, 1);
        bridges.push({id:"d" + n++, a:[end[0], end[1]], b:p, width:s, dir:Math.abs(u[0]) >= Math.abs(u[1]) ? "h" : "v", outside:false, drawn:true});
        break;
      }
    }
  }
  const outside = floodFromEdges(maskNot(outer)), foot = maskNot(outside);
  const off = Math.ceil(Math.max(thick, read.outerThick || thick)), W = foot.w;
  for (const br of bridges){
    const mx = (br.a[0] + br.b[0]) / 2, my = (br.a[1] + br.b[1]) / 2, len = Math.hypot(br.b[0] - br.a[0], br.b[1] - br.a[1]) || 1;
    const nx = -(br.b[1] - br.a[1]) / len, ny = (br.b[0] - br.a[0]) / len;
    br.outside = [[mx + nx * off, my + ny * off], [mx - nx * off, my - ny * off]].some(([x, y]) => {
      x = Math.round(x); y = Math.round(y);
      return x < 0 || y < 0 || x >= W || y >= foot.h || outside.m[y * W + x] === 1;
    });
  }
  return {...read, walls, closed, outer, foot, bridges};
}

// The gaps closed at drawn walls' ends, in image px.
export const drawnGaps = (read, k) => read.bridges.filter(b => b.drawn).map(b => {
  const a = toSource(read, b.a), c = toSource(read, b.b);
  return {a:[a[0] / k, a[1] / k], b:[c[0] / k, c[1] / k]};
});
