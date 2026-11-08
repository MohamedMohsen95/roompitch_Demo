// Rooms from their written sizes: for each room name with a written size and a point (where the name is
// written), the rectangle of that size around the point whose four edges run along straight lines in the
// image (thin, hollow or solid walls alike). Without a scale, a range of scales is tried and the one that
// fits the rooms best wins. Rectangles are in the straightened frame of the wall reading.
import { toStraight } from "./walls.js";

// Per row, prefix sums of the horizontal-line pixels within ±band rows (and per column for vertical lines),
// so the share of an edge lying on a line is two lookups.
function coverage(read, band){
  const {w, h} = read.size, H = read.hLines.m, V = read.vLines.m;
  const rowPre = new Uint32Array((w + 1) * h), colPre = new Uint32Array((h + 1) * w);
  for (let y = 0; y < h; y++){
    let acc = 0;
    for (let x = 0; x < w; x++){
      let on = 0;
      for (let dy = -band; dy <= band && !on; dy++){ const yy = y + dy; if (yy >= 0 && yy < h && H[yy * w + x]) on = 1; }
      acc += on; rowPre[y * (w + 1) + x + 1] = acc;
    }
  }
  for (let x = 0; x < w; x++){
    let acc = 0;
    for (let y = 0; y < h; y++){
      let on = 0;
      for (let dx = -band; dx <= band && !on; dx++){ const xx = x + dx; if (xx >= 0 && xx < w && V[y * w + xx]) on = 1; }
      acc += on; colPre[x * (h + 1) + y + 1] = acc;
    }
  }
  const row = (y, x0, x1) => (rowPre[y * (w + 1) + x1 + 1] - rowPre[y * (w + 1) + x0]) / (x1 - x0 + 1);
  const col = (x, y0, y1) => (colPre[x * (h + 1) + y1 + 1] - colPre[x * (h + 1) + y0]) / (y1 - y0 + 1);
  return {row, col, w, h};
}

// Best rectangle of rw × rh px containing p: {rect, score}, score = mean edge coverage, held down by the
// weakest edge (a rectangle with one edge in empty space is not a room).
function bestRect(cov, p, rw, rh, step){
  const {w, h} = cov;
  rw = Math.round(rw); rh = Math.round(rh);
  if (rw < 8 || rh < 8 || rw >= w || rh >= h) return null;
  const m = Math.max(2, Math.round(Math.min(rw, rh) * 0.05));       // the name sits inside, not on an edge
  let best = null;
  const xs = Math.max(0, Math.ceil(p[0] - rw + m)), xe = Math.min(w - rw - 1, Math.floor(p[0] - m));
  const ys = Math.max(0, Math.ceil(p[1] - rh + m)), ye = Math.min(h - rh - 1, Math.floor(p[1] - m));
  for (let y0 = ys; y0 <= ye; y0 += step){
    const y1 = y0 + rh;
    for (let x0 = xs; x0 <= xe; x0 += step){
      const x1 = x0 + rw;
      const t = cov.row(y0, x0, x1), b = cov.row(y1, x0, x1), l = cov.col(x0, y0, y1), r = cov.col(x1, y0, y1);
      const score = 0.5 * (t + b + l + r) / 4 + 0.5 * Math.min(t, b, l, r);
      if (!best || score > best.score) best = {rect:[x0, y0, x1, y1], score};
    }
  }
  return best;
}

// The best fit of one room at one scale (both orientations).
function fitAt(cov, e, scale, step){
  const a = e.size[0] / 100 / scale, b = e.size[1] / 100 / scale;
  const one = bestRect(cov, e.sp, a, b, step), two = a === b ? null : bestRect(cov, e.sp, b, a, step);
  return !one ? two : !two ? one : (two.score > one.score ? two : one);
}

// entries: [{name, size:[cm, cm], p:[x, y] source px}] -> {fits:[{name, rect, score}], scale}
export function fitRooms(read, entries, scale){
  const list = entries.filter(e => e.size && e.p).map(e => ({...e, sp:toStraight(read, e.p)}));
  if (!list.length || !read.hLines) return {fits:[], scale};
  const cov = coverage(read, Math.max(1, Math.round(read.thick / 2)));
  const total = (s, step) => list.reduce((acc, e) => acc + (fitAt(cov, e, s, step)?.score || 0), 0);
  if (!scale){
    // coarse: a room 1–15 m across in an image of this size; then refine around the best
    const long = Math.max(read.size.w, read.size.h);
    const lo = 1.5 / long, hi = 60 / long;
    let best = null;
    for (let s = lo; s <= hi; s *= 1.04){ const t = total(s, 4); if (!best || t > best.t) best = {s, t}; }
    for (let s = best.s * 0.95; s <= best.s * 1.05; s *= 1.005){ const t = total(s, 2); if (t > best.t) best = {s, t}; }
    scale = best.s;
  }
  const fits = list.map(e => { const f = fitAt(cov, e, scale, 1); return f ? {name:e.name, rect:f.rect, score:f.score} : null; }).filter(Boolean);
  return {fits, scale};
}
