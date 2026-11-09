// Open parts of rooms (openings of type "open": no wall, floor to ceiling) that follow from the designer's
// edits: an erased stretch, and a gap left at the end of a drawn wall. Each is ONE opening on the stroke's
// own line (the wall's centre), over the part of it that runs along a room edge, so on a wall between two
// rooms both rooms see the same opening, as with a door. They are worked out again from the edits every time
// (fromEdit: true, ids from the edit: "oe:<edit id>:<n>", "og:<gap n>:<n>"); an open part drawn or resized by
// hand (fromEdit: false) is kept and the edit-made one leaves its stretch to it. A drawn wall over any open
// part closes the part it covers. An erase over a door or window the reading found replaces it.
// Everything in tracing (image) px.
import { newId } from "./flat.js";

const PAR = Math.cos(10 * Math.PI / 180);
const r1 = (v) => Math.round(v * 10) / 10;

// One tolerance for "runs along" (px): one and a half wall thicknesses.
export const openTol = (thick) => 1.5 * Math.max(4, thick || 0);

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
const union = (list) => {
  const out = [];
  for (const iv of [...list].sort((p, q) => p[0] - q[0])){ const last = out[out.length - 1]; if (last && iv[0] <= last[1] + 0.5) last[1] = Math.max(last[1], iv[1]); else out.push([...iv]); }
  return out;
};
const minus = (ivs, cut) => ivs.flatMap(([p0, p1]) => [[p0, Math.min(p1, cut[0])], [Math.max(p0, cut[1]), p1]]).filter(([p0, p1]) => p1 - p0 >= 1);
const distToSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
};

export function deriveOpens(flat, gaps, tolPx){
  const edits = flat.edits || [], H = Math.round(flat.H * 100);
  const erases = edits.filter(e => e.kind === "erase"), walls = edits.filter(e => e.kind === "wall");
  const edges = flat.spaces.flatMap(s => s.outline.map((p, i) => [p, s.outline[(i + 1) % s.outline.length]]));
  const mid = (o) => [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
  // what stays: everything but the edit-made open parts, and doors and windows the reading found where a
  // stretch was erased
  const kept = flat.openings.filter(o => !(o.type === "open" && o.fromEdit)
    && !(o.type !== "open" && o.fromAI && erases.some(e => distToSeg(mid(o), e.a, e.b) <= tolPx)));
  const hand = kept.filter(o => o.type === "open");

  // one stroke (an erase or a gap): open where it runs along a room edge, minus hand-made opens and drawn walls
  const made = [];
  const stroke = (a, b, idOf) => {
    let ivs = union(edges.map(([p, q]) => along(a, b, p, q, tolPx)).filter(Boolean));
    for (const o of hand){ const iv = along(a, b, o.a, o.b, tolPx); if (iv) ivs = minus(ivs, iv); }
    for (const w of walls){ const iv = along(a, b, w.a, w.b, tolPx); if (iv) ivs = minus(ivs, iv); }
    ivs.forEach(([t0, t1], j) => made.push({id:idOf(j), type:"open", a:at(a, b, t0), b:at(a, b, t1), heightCm:H, sillCm:0, fromAI:false, fromEdit:true}));
  };
  for (const e of erases) stroke(e.a, e.b, j => "oe:" + e.id + ":" + j);
  gaps.forEach((g, i) => stroke(g.a, g.b, j => "og:" + i + ":" + j));

  // drawn walls close what they cover of the hand-made open parts too
  const out = [];
  for (const o of kept){
    if (o.type !== "open" || !walls.length){ out.push(o); continue; }
    let pieces = [[0, Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1])]];
    for (const w of walls){ const iv = along(o.a, o.b, w.a, w.b, tolPx); if (iv) pieces = minus(pieces, iv); }
    pieces.forEach(([p0, p1], j) => out.push({...o, id:j ? newId("o") : o.id, a:at(o.a, o.b, p0), b:at(o.a, o.b, p1)}));
  }
  return {...flat, openings:[...out, ...made]};
}

// Removing an opening. One made by an erase removes that erase (the wall comes back); one made by a gap at a
// drawn wall closes the gap with a drawn wall; any other is simply removed.
export function removeOpen(flat, id){
  const o = flat.openings.find(x => x.id === id);
  if (!o) return flat;
  if (id.startsWith("oe:")){ const eid = id.split(":")[1]; return {...flat, edits:(flat.edits || []).filter(e => e.id !== eid), openings:flat.openings.filter(x => x.id !== id)}; }
  if (id.startsWith("og:")) return {...flat, edits:[...(flat.edits || []), {id:newId("e"), kind:"wall", a:o.a, b:o.b}], openings:flat.openings.filter(x => x.id !== id)};
  return {...flat, openings:flat.openings.filter(x => x.id !== id)};
}
