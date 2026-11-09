// Open parts of rooms (openings of type "open": no wall, floor to ceiling) that follow from the designer's
// edits: an erase along a room's edge, and a gap left at the end of a drawn wall. They are worked out again
// from the edits every time (fromEdit: true); an open part drawn or resized by hand (fromEdit: false) is kept.
// A drawn wall over any open part closes the part it covers. Everything in tracing (image) px.
import { newId } from "./flat.js";

const PAR = Math.cos(10 * Math.PI / 180);
const r1 = (v) => Math.round(v * 10) / 10;

// Where segment p-q runs along segment a-b: [t0, t1] along a-b (px from a), or null.
function along(a, b, p, q, tol){
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!len) return null;
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const pl = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (pl && Math.abs(((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]) / pl) < PAR) return null;
  const off = (s) => Math.abs((s[0] - a[0]) * u[1] - (s[1] - a[1]) * u[0]);
  if (off(p) > tol || off(q) > tol) return null;
  const tp = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1], tq = (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1];
  const t0 = Math.max(0, Math.min(tp, tq)), t1 = Math.min(len, Math.max(tp, tq));
  return t1 - t0 >= 1 ? [t0, t1] : null;
}
const at = (a, b, t) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); return [r1(a[0] + (b[0] - a[0]) * t / len), r1(a[1] + (b[1] - a[1]) * t / len)]; };

export function deriveOpens(flat, gaps, tolPx){
  const edits = flat.edits || [], H = Math.round(flat.H * 100);
  const kept = flat.openings.filter(o => !(o.type === "open" && o.fromEdit));
  // per space edge, the stretches that are open
  const spans = new Map();                       // "spaceId:i" -> {a, b, list:[[t0, t1]]}
  const addSpan = (s, i, a, b, iv) => { const key = s.id + ":" + i; (spans.get(key) || spans.set(key, {a, b, list:[]}).get(key)).list.push(iv); };
  for (const s of flat.spaces){
    const o = s.outline, n = o.length;
    for (let i = 0; i < n; i++){
      const a = o[i], b = o[(i + 1) % n];
      for (const e of edits) if (e.kind === "erase"){ const iv = along(a, b, e.a, e.b, tolPx); if (iv) addSpan(s, i, a, b, iv); }
      for (const g of gaps){ const iv = along(a, b, g.a, g.b, tolPx); if (iv) addSpan(s, i, a, b, iv); }
    }
  }
  const made = [];
  for (const {a, b, list} of spans.values()){
    list.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const iv of list){ const last = merged[merged.length - 1]; if (last && iv[0] <= last[1] + 0.5) last[1] = Math.max(last[1], iv[1]); else merged.push([...iv]); }
    for (const [t0, t1] of merged) made.push({id:newId("o"), type:"open", a:at(a, b, t0), b:at(a, b, t1), heightCm:H, sillCm:0, fromAI:false, fromEdit:true});
  }
  // drawn walls close what they cover
  const walls = edits.filter(e => e.kind === "wall"), out = [];
  for (const o of [...kept, ...made]){
    if (o.type !== "open" || !walls.length){ out.push(o); continue; }
    let pieces = [[0, Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1])]];
    for (const w of walls){
      const iv = along(o.a, o.b, w.a, w.b, tolPx);
      if (!iv) continue;
      pieces = pieces.flatMap(([p0, p1]) => [[p0, Math.min(p1, iv[0])], [Math.max(p0, iv[1]), p1]]).filter(([p0, p1]) => p1 - p0 >= 1);
    }
    pieces.forEach(([p0, p1], j) => out.push({...o, id:j ? newId("o") : o.id, a:at(o.a, o.b, p0), b:at(o.a, o.b, p1)}));
  }
  return {...flat, openings:out};
}
