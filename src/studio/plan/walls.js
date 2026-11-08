// Reading the walls of a floor plan image: straighten it, find the wall pixels and their thickness, bridge
// the door and window gaps along each wall's own line, find the flat's footprint, and judge whether the
// image is clean enough to read rooms from at all. Pure: runs in a Web Worker and in node tests.
//
// Everything in the result is in the straightened frame (the image rotated by −angle, same size);
// toStraight() / toSource() convert points.
import {
  paperColor, paperCoverage, contrastMask, openLine, openSquare, maskOr, maskNot, dilate,
  components, floodFromEdges, dominantAngle, angleContrast, rotateImg, rotatePoint
} from "./raster.js";

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// Otsu threshold of the image's luminance (transparent = white).
function otsu(img){
  const hist = new Float64Array(256), {data} = img, n = img.w * img.h;
  for (let i = 0; i < n; i++){ const d = i * 4; hist[data[d + 3] < 128 ? 255 : Math.round(lum(data, d))]++; }
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let wB = 0, sumB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++){
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best){ best = v; thr = t; }
  }
  return thr;
}

// Dark pixels: far from the paper colour and below 0.85 × the Otsu threshold.
function darkMask(img, paper){
  const c = contrastMask(img, paper, 60), t = otsu(img) * 0.85, {data} = img;
  for (let i = 0; i < c.m.length; i++) if (c.m[i] && lum(data, i * 4) >= t) c.m[i] = 0;
  return c;
}

// Lengths of runs of set pixels along dir.
function runLengths(mask, dir, cap, out){
  const {w, h, m} = mask;
  const lines = dir === "h" ? h : w, len = dir === "h" ? w : h;
  for (let a = 0; a < lines; a++){
    let run = 0;
    for (let b = 0; b <= len; b++){
      const on = b < len && (dir === "h" ? m[a * w + b] : m[b * w + a]);
      if (on) run++;
      else { if (run && run <= cap) out.push(run); run = 0; }
    }
  }
}

// Wall thickness: the mode of the widths of long lines, weighted by width² so thick walls outweigh
// thin furniture lines. {thick, share}: share is how much of the weight sits at the mode (±1).
function wallThickness(dark, L, cap){
  const v = openLine(dark, L, "v"), h = openLine(dark, L, "h"), runs = [];
  runLengths(v, "h", cap, runs);    // vertical lines measured across
  runLengths(h, "v", cap, runs);
  if (!runs.length) return {thick:0, share:0};
  const hist = new Float64Array(cap + 2);
  for (const r of runs) hist[r] += r * r;
  let best = 1, total = 0;
  for (let i = 1; i <= cap; i++){ total += hist[i]; if (hist[i] > hist[best]) best = i; }
  const share = (hist[best - 1] + hist[best] + hist[best + 1]) / total;
  return {thick:best, share};
}

// Bridge gaps along dir: from the end of a wall run that is long along dir (dirMask) to the next wall pixel
// on the same line, when the gap is shorter than maxLen. Returns the mask of new pixels.
function bridgeAlong(walls, dirMask, maxLen, dir){
  const {w, h} = walls, out = {w, h, m:new Uint8Array(w * h)};
  const lines = dir === "h" ? h : w, len = dir === "h" ? w : h;
  const idx = dir === "h" ? (a, b) => a * w + b : (a, b) => b * w + a;
  for (let a = 0; a < lines; a++){
    let lastWall = -1, lastWallDir = false;
    for (let b = 0; b < len; b++){
      const i = idx(a, b);
      if (!walls.m[i]) continue;
      const gap = b - lastWall - 1;
      const thisDir = dirMask.m[i] === 1;
      // a bridge needs a long wall run on at least one side of the gap
      if (lastWall >= 0 && gap > 0 && gap < maxLen && (lastWallDir || thisDir)){
        for (let k = lastWall + 1; k < b; k++) out.m[idx(a, k)] = 1;
      }
      lastWall = b; lastWallDir = thisDir;
    }
  }
  return out;
}

// Group bridge pixels into bridges: {id, a, b, width, dir} along the bridged direction.
function bridgeList(hNew, vNew, thick){
  const list = [];
  for (const [mk, dir] of [[hNew, "h"], [vNew, "v"]]){
    const c = components(mk);
    c.stats.forEach((s, k) => {
      if (s.area < 2) return;
      const across = dir === "h" ? s.y1 - s.y0 + 1 : s.x1 - s.x0 + 1;
      if (across < Math.max(2, thick * 0.4)) return;          // a sliver along a wall's edge, not a gap through it
      if (dir === "h"){ const y = (s.y0 + s.y1 + 1) / 2; list.push({id:"b" + list.length, a:[s.x0, y], b:[s.x1 + 1, y], width:s.x1 - s.x0 + 1, dir, outside:false}); }
      else { const x = (s.x0 + s.x1 + 1) / 2; list.push({id:"b" + list.length, a:[x, s.y0], b:[x, s.y1 + 1], width:s.y1 - s.y0 + 1, dir, outside:false}); }
    });
  }
  return list;
}

// Points between the source image and the straightened frame.
export const toStraight = (read, p) => Math.abs(read.angle) < 1e-9 ? [p[0], p[1]] : rotatePoint(p, -read.angle, read.src, read.size);
export const toSource = (read, p) => Math.abs(read.angle) < 1e-9 ? [p[0], p[1]] : rotatePoint(p, read.angle, read.size, read.src);

export function readWalls(source){
  const src = {w:source.w, h:source.h};
  const long = Math.max(src.w, src.h);
  const empty = (reason, extra = {}) => {
    const z = {w:src.w, h:src.h, m:new Uint8Array(src.w * src.h)};
    return {angle:0, size:src, src, thick:0, walls:z, closed:z, foot:z, bridges:[], quality:{ok:false, reason}, ...extra};
  };
  const paper = paperColor(source);
  if (paperCoverage(source, paper, 40) < 0.4) return empty("noPaper");

  // 1. straighten
  let img = source, dark = darkMask(source, paper);
  let angle = dominantAngle(dark);
  if (Math.abs(angle) >= 0.3){ img = rotateImg(source, -angle, [...paper], true); dark = darkMask(img, paper); }
  else angle = 0;

  // 2. thickness
  const L = Math.max(9, Math.round(0.025 * long)), cap = Math.max(4, Math.round(0.03 * long));
  const {thick, share} = wallThickness(dark, L, cap);
  if (!thick || thick < 2) return empty("noThickness", {angle});

  // 3. walls: hatching closed, thin lines (furniture, text, dimensions) opened away, long lines kept,
  //    filled blobs (rugs, bedspreads) and short bits (text) dropped
  // (Hatched walls are not closed into solid ones: closing also turns bold room names into wall-like bars.)
  const solid = openSquare(dark, Math.max(1, Math.round(0.6 * thick)));
  let walls = maskOr(openLine(solid, L, "h"), openLine(solid, L, "v"));
  const cores = openSquare(walls, Math.ceil(2.5 * thick) + 1);
  const comp = components(walls), hasCore = new Uint8Array(comp.count + 1);
  for (let i = 0; i < cores.m.length; i++) if (cores.m[i]) hasCore[comp.labels[i]] = 1;
  const keep = new Uint8Array(comp.count + 1);
  comp.stats.forEach((s, k) => {
    const id = k + 1, size = Math.max(s.x1 - s.x0 + 1, s.y1 - s.y0 + 1);
    keep[id] = !(hasCore[id] && s.area < 0.02 * img.w * img.h) ? 1 : 0;
  });
  for (let i = 0; i < walls.m.length; i++) if (walls.m[i] && !keep[comp.labels[i]]) walls.m[i] = 0;
  // Short pieces far from the main walls are not walls (text, symbols): a piece shorter than 12 % of the
  // image is kept only within 20 % of the image of a long wall (wall pieces between windows and doors are).
  const doorLen = Math.round(0.08 * long);
  {
    const c2 = components(walls), big = {w:img.w, h:img.h, m:new Uint8Array(img.w * img.h)}, isBig = new Uint8Array(c2.count + 1);
    c2.stats.forEach((s, k) => { if (Math.max(s.x1 - s.x0 + 1, s.y1 - s.y0 + 1) >= 0.12 * long) isBig[k + 1] = 1; });
    for (let i = 0; i < walls.m.length; i++) if (isBig[c2.labels[i]]) big.m[i] = 1;
    const near = dilate(big, Math.round(0.2 * long)), nearBig = new Uint8Array(c2.count + 1);
    for (let i = 0; i < walls.m.length; i++) if (walls.m[i] && near.m[i]) nearBig[c2.labels[i]] = 1;
    for (let i = 0; i < walls.m.length; i++) if (walls.m[i] && !isBig[c2.labels[i]] && !nearBig[c2.labels[i]]) walls.m[i] = 0;
  }

  let wallCount = 0; for (let i = 0; i < walls.m.length; i++) wallCount += walls.m[i];
  const quality = {ok:true, reason:null};
  if (wallCount < 0.005 * img.w * img.h) { quality.ok = false; quality.reason = "noWalls"; }
  // walls thinner than 0.6 % of the image (hairline drawings, small or faint images) can't be told from
  // furniture and fixture lines reliably
  else if (share < 0.15 || thick < 0.006 * long) { quality.ok = false; quality.reason = "noThickness"; }
  else {
    const ac = angleContrast(walls, 10, 1);
    if (ac.best < 1.2 * ac.worst) { quality.ok = false; quality.reason = "noAngle"; }
  }

  // 4. door and window gaps, bridged along each wall's own line
  const hl = Math.max(9, Math.ceil(1.5 * thick));
  const hMask = openLine(walls, hl, "h"), vMask = openLine(walls, hl, "v");
  const hNew = bridgeAlong(walls, hMask, doorLen, "h"), vNew = bridgeAlong(walls, vMask, doorLen, "v");
  const closed = maskOr(walls, hNew, vNew);
  const bridges = bridgeList(hNew, vNew, thick);

  // 5. footprint: long glass runs bridged too, then everything not reachable from outside
  const bigLen = Math.round(0.4 * long);
  const outer = maskOr(walls, bridgeAlong(walls, hMask, bigLen, "h"), bridgeAlong(walls, vMask, bigLen, "v"));
  const outside = floodFromEdges(maskNot(outer));
  const foot = maskNot(outside);
  const W = img.w;
  for (const b of bridges){
    const mx = Math.round((b.a[0] + b.b[0]) / 2), my = Math.round((b.a[1] + b.b[1]) / 2), off = Math.ceil(thick);
    const probe = b.dir === "h" ? [[mx, my - off], [mx, my + off]] : [[mx - off, my], [mx + off, my]];
    b.outside = probe.some(([x, y]) => x < 0 || y < 0 || x >= W || y >= img.h || outside.m[y * W + x] === 1);
  }

  // An image whose walls don't enclose anything (thin or broken walls: the inside leaks to the outside)
  // can't be read: the footprint must cover most of the walls' bounding box.
  if (quality.ok){
    let x0 = img.w, y0 = img.h, x1 = 0, y1 = 0, fa = 0;
    for (let i = 0; i < walls.m.length; i++){
      if (foot.m[i] && !walls.m[i]) fa++;
      if (!walls.m[i]) continue;
      const x = i % W, y = (i - x) / W;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (fa < 0.35 * (x1 - x0 + 1) * (y1 - y0 + 1)){ quality.ok = false; quality.reason = "noEnclosure"; }
  }

  return {angle, size:{w:img.w, h:img.h}, src, thick, walls, closed, foot, bridges, quality};
}
