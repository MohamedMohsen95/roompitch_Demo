// The plan reading in a Web Worker, so the page doesn't freeze: walls and room candidates on the first
// message; then naming and checking (assemble), click-to-fill and gap lookups against the same reading.
// Messages: {id, type:"read", rgba, w, h} | {id, type:"assemble", text, points, image} |
//           {id, type:"fill", p} | {id, type:"gap", p, tol}. Points are in the plan image's pixels.
import { readWalls, toSource, toStraight } from "./walls.js";
import { roomCandidates, fillAt } from "./rooms.js";
import { assembleFlat, readScale } from "./assemble.js";
import { orientCW } from "./flat.js";

let read = null, cands = [], k = 1;

function handle(msg){
  if (msg.type === "read"){
    const scaled = readScale({w:msg.w, h:msg.h, data:new Uint8ClampedArray(msg.rgba)});
    k = scaled.k;
    read = readWalls(scaled.img);
    cands = read.quality.ok ? roomCandidates(read) : [];
    return {quality:read.quality, thick:read.thick / k, candidates:cands.length};
  }
  if (!read) return null;
  if (msg.type === "assemble") return assembleFlat(read, cands, msg.text, msg.points, msg.image);
  if (msg.type === "fill"){
    if (!read.quality.ok) return null;
    const c = fillAt(read, [msg.p[0] * k, msg.p[1] * k]);
    return c ? {outline:orientCW(c.outline.map(p => [p[0] / k, p[1] / k])), areaPx:c.areaPx / (k * k)} : null;
  }
  if (msg.type === "gap"){
    const p = toStraight(read, [msg.p[0] * k, msg.p[1] * k]), tol = msg.tol * k;
    let best = null, bestD = Infinity;
    for (const b of read.bridges){
      // distance from p to the bridge's segment
      const [ax, ay] = b.a, [bx, by] = b.b, L = Math.hypot(bx - ax, by - ay) || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / (L * L)));
      const d = Math.hypot(ax + t * (bx - ax) - p[0], ay + t * (by - ay) - p[1]);
      if (d <= tol && d < bestD){ bestD = d; best = b; }
    }
    if (!best) return null;
    const a = toSource(read, best.a), b = toSource(read, best.b);
    return {a:[a[0] / k, a[1] / k], b:[b[0] / k, b[1] / k], width:best.width / k, outside:best.outside};
  }
  return null;
}

self.onmessage = (e) => {
  const {id} = e.data;
  try { self.postMessage({id, ok:true, value:handle(e.data)}); }
  catch (err){ self.postMessage({id, ok:false, error:String(err && err.message || err)}); }
};
