// From walls, room candidates and what the AI read (names, written sizes, where each name is written) to a
// flat: only rooms the program is confident about are drawn; names it couldn't place are kept as unplaced.
// The order is fixed: place the names, name the candidates, take the scale from the rooms that agree,
// then check every candidate against the scale, then the doors and windows from the wall gaps.
import { newFlat, scaleFromSizes, outlineProblem } from "./flat.js";
import { parseRoomSize, parseArea } from "./units.js";
import { toSource } from "./walls.js";
import { labelAt } from "./rooms.js";
import { fitRooms } from "./sizefit.js";

// Rooms that can't be part of an open area with another name (two of them in one area = rooms merged
// through an open door). Living, dining, kitchen, hall, entry and the like can.
const PRIVATE = /bed|bath|toilet|\bwc\b|w\.c|wash|shower|powder|closet|\bwic\b|wardrobe|dress|laundry|utility|storage|\bstore|study|office|\bden\b|guest|nursery|maid|نوم|حمام|مياه|غسيل|مكتب|تخزين|دولاب/i;
export const isPrivateName = (name) => PRIVATE.test(String(name || ""));

const polyArea = (o) => { let a = 0; o.forEach((p, i) => { const q = o[(i + 1) % o.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a) / 2; };

// Downscale for reading: at most max px on the long side. k = reading px per image px.
export function readScale(img, max = 2000){
  const long = Math.max(img.w, img.h);
  if (long <= max) return {img, k:1};
  const k = max / long, w = Math.round(img.w * k), h = Math.round(img.h * k), out = new Uint8ClampedArray(w * h * 4);
  // box filter
  for (let y = 0; y < h; y++){
    const y0 = Math.floor(y / k), y1 = Math.max(y0 + 1, Math.floor((y + 1) / k));
    for (let x = 0; x < w; x++){
      const x0 = Math.floor(x / k), x1 = Math.max(x0 + 1, Math.floor((x + 1) / k));
      const acc = [0, 0, 0, 0]; let n = 0;
      for (let yy = y0; yy < y1 && yy < img.h; yy++) for (let xx = x0; xx < x1 && xx < img.w; xx++){
        const d = (yy * img.w + xx) * 4; acc[0] += img.data[d]; acc[1] += img.data[d + 1]; acc[2] += img.data[d + 2]; acc[3] += img.data[d + 3]; n++;
      }
      const d = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = acc[c] / (n || 1);
    }
  }
  return {img:{w, h, data:out}, k};
}

// Overlap of two outlines' bounding boxes: shared area over the smaller box, so a big rectangle over a small
// room counts as fully overlapping.
const bboxOf = (o) => [Math.min(...o.map(p => p[0])), Math.min(...o.map(p => p[1])), Math.max(...o.map(p => p[0])), Math.max(...o.map(p => p[1]))];
export function boxOverlap(a, b){
  const A = bboxOf(a), B = bboxOf(b);
  const w = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), h = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / (Math.min((A[2] - A[0]) * (A[3] - A[1]), (B[2] - B[0]) * (B[3] - B[1])) || 1);
}

let seq = 0;
const nid = (p) => p + (++seq).toString(36) + Math.random().toString(36).slice(2, 5);

export function assembleFlat(read, cands, text, points, image){
  const k = read.src.w / image.w;                    // reading px per image px
  const up = (p) => [Math.round(p[0] / k * 10) / 10, Math.round(p[1] / k * 10) / 10];
  const flat = newFlat({w:image.w, h:image.h, ...(image.dataUrl ? {dataUrl:image.dataUrl} : {}), ...(image.path ? {path:image.path} : {})});
  const byLabel = new Map(cands.map(c => [c.label, c]));
  const thick = Math.max(1, read.thick);
  const footArea = read.foot.m.reduce((a, v) => a + v, 0);

  // 1. place the names: occurrence i of a name (points sorted top to bottom, left to right) takes the
  //    i-th written size of that name
  const texts = new Map();
  for (const r of text.rooms || []) (texts.get(r.name) || texts.set(r.name, []).get(r.name)).push(r);
  const named = new Map();                            // label -> [{name, size, area}]
  const unplaced = [];
  for (const [name, list] of texts){
    const pts = [...(points[name] || [])].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    list.forEach((t, i) => {
      const p = pts[i];
      const entry = {name, size:t.size ?? null, area:t.area ?? null, p:p ? [p[0] * k, p[1] * k] : null};
      if (!p || !read.quality.ok){ unplaced.push(entry); return; }
      const sp = entry.p;
      const label = labelAt(read, sp, Math.ceil(2 * thick));
      if (!label || !byLabel.has(label)){ unplaced.push(entry); return; }
      (named.get(label) || named.set(label, []).get(label)).push(entry);
    });
  }

  // 2. name the candidates
  const pending = [];
  for (const c of cands){
    const names = named.get(c.label) || [];
    if (names.length > 1){
      // an open area: only when no two are the same room name and none is a private room
      const distinct = new Set(names.map(n => n.name.trim().toLowerCase())).size === names.length;
      if (!distinct || names.some(n => isPrivateName(n.name))){ unplaced.push(...names); continue; }
    }
    pending.push({c, names});
  }

  // 3. scale from the named rooms with a written size or area
  const outlineImg = (c) => c.outline.map(up);
  const forScale = {spaces:pending.filter(p => p.names.length === 1 && (p.names[0].size || p.names[0].area))
    .map(p => ({id:p.c.id, outline:outlineImg(p.c), sizeText:p.names[0].size, areaText:p.names[0].area}))};
  const {scale} = scaleFromSizes(forScale);
  flat.scale = scale; flat.scaleFrom = scale ? "sizes" : null;

  // 4. checks. A named area that fails only a soft check (its shape, or its size against the written one)
  //    is kept as a suggestion.
  const drawn = [], suggested = [], outsideIds = new Set(read.bridges.filter(b => b.outside).map(b => b.id));
  for (const {c, names} of pending){
    const outline = outlineImg(c), aPx = polyArea(outline), m2 = scale ? aPx * scale * scale : null;
    const share = c.areaPx / (footArea || 1);
    // (unsure: its edge with a neighbour is where growth stopped, so its shape isn't worth suggesting)
    let hard = c.touchesOutside || c.unsure || (share > 0.7 && cands.length > 1) || outlineProblem(outline);
    let ok = !hard && c.hullRatio >= 0.6;
    if (ok && scale){
      if (m2 < (names.length ? 1 : 2)) ok = false;
      const n = names.length === 1 ? names[0] : null;
      const size = n && parseRoomSize(n.size), area = n && parseArea(n.area);
      const want = size ? size[0] * size[1] / 1e4 : area;
      if (want && Math.abs(m2 - want) / want > 0.25) ok = false;
    } else if (ok && !scale){
      if (share < (names.length ? 0.005 : 0.015)) ok = false;
    }
    // reachable: through a bridged gap or an open neck to another area, or a window or door to the
    // outside. A closed box (a title block, a legend) is none of these. Unnamed ones need another area.
    {
      const toArea = c.meets.length > 0 || c.bridgeIds.some(id => !outsideIds.has(id));
      const toOutside = c.bridgeIds.some(id => outsideIds.has(id));
      if (!toArea && (!names.length || !toOutside)){ ok = false; hard = true; }
    }
    const n = names.length === 1 ? names[0] : null;
    const space = {
      id:nid("s"), name:names.map(x => x.name).join(" / "), outline,
      sizeText:n?.size ?? null, areaText:n?.area ?? null, status:"todo", design:null,
      fromAI:names.length > 0, unnamed:names.length === 0
    };
    if (ok) drawn.push({c, names, s:space});
    else if (!hard && names.length && c.hullRatio >= 0.45 && (!m2 || m2 >= 1)) suggested.push({c, names, s:{...space, suggested:true}, score:c.hullRatio});
    else unplaced.push(...names);
  }

  // 4b. names still without a room, with a written size and a point: the rectangle of that size along
  //     the lines around the name, as a suggestion. Without a scale yet, the fit finds one too.
  const toFit = unplaced.filter(u => u.p && parseRoomSize(u.size));
  if (toFit.length){
    // (scales: the flat's are metres per image px, the fit's per reading px)
    const res = fitRooms(read, toFit.map(u => ({name:u.name, size:parseRoomSize(u.size), p:u.p})), flat.scale ? flat.scale / k : null);
    const good = res.fits.filter(f => f.score >= 0.5);
    if (!flat.scale && good.filter(f => f.score >= 0.6).length >= 2){
      flat.scale = res.scale * k; flat.scaleFrom = "sizes";
      // the rooms drawn before there was a scale: now their size against the written one
      for (const d of drawn.splice(0)){
        const m2 = polyArea(d.s.outline) * flat.scale ** 2, n = d.names.length === 1 ? d.names[0] : null;
        const size = n && parseRoomSize(n.size), area = n && parseArea(n.area), want = size ? size[0] * size[1] / 1e4 : area;
        if (m2 < (d.names.length ? 1 : 2)){ unplaced.push(...d.names); continue; }
        if (want && Math.abs(m2 - want) / want > 0.25){
          if (d.names.length) suggested.push({c:d.c, names:d.names, s:{...d.s, suggested:true}, score:d.c.hullRatio});
          else unplaced.push(...d.names);
          continue;
        }
        drawn.push(d);
      }
    }
    if (flat.scale) for (const f of good){
      const u = toFit[f.i];
      const [x0, y0, x1, y1] = f.rect;
      const outline = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => up(toSource(read, p)));
      suggested.push({s:{id:nid("s"), name:u.name, outline, sizeText:u.size, areaText:u.area ?? null, status:"todo", design:null,
        fromAI:true, unnamed:false, suggested:true}, score:f.score, fit:u});
    }
  }
  // a suggestion that mostly covers, or is mostly covered by, a drawn room or a better suggestion is dropped
  const kept = drawn.map(d => d.s);
  for (const sg of suggested.sort((a, b) => b.score - a.score)){
    if (kept.some(o => boxOverlap(sg.s.outline, o.outline) > 0.3)){ if (sg.names) unplaced.push(...sg.names); continue; }
    kept.push(sg.s);
    if (sg.fit) sg.fit.used = true;
  }
  flat.spaces = kept;
  flat.unplaced = unplaced.filter(u => !u.used).map(u => ({name:u.name, sizeText:u.size ?? null, areaText:u.area ?? null}));

  // 5. doors and windows from the bridges next to drawn spaces
  const drawnIds = new Set(drawn.flatMap(d => d.c.bridgeIds));
  const sides = new Map();                           // bridge id -> number of candidates using it
  for (const c of cands) for (const id of c.bridgeIds) sides.set(id, (sides.get(id) || 0) + 1);
  flat.openings = read.bridges.filter(b => drawnIds.has(b.id)).map(b => {
    const door = !b.outside && (sides.get(b.id) || 0) >= 1;
    return {id:nid("o"), type:door ? "door" : "window", a:up(toSource(read, b.a)), b:up(toSource(read, b.b)),
      heightCm:door ? 210 : 120, sillCm:door ? 0 : 90, fromAI:true};
  });
  return flat;
}
