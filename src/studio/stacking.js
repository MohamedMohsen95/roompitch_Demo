// Automatic stacking: pieces rest on the floor or on the surface below them.
//
// A piece rests on a "surface" piece (tables, cabinets, the bed, desks...) when its centre is over
// that piece and it's smaller than it. It sits on the highest such surface, otherwise on the floor.
// A height set by hand (Shift + drag, the "From floor" field, PageUp/PageDown) turns this off for
// that piece (it.zAuto = false), e.g. for a wall-mounted TV; "Rest on surface" turns it back on.
import { S, foot, clampItem } from "./state.js";
import { FU } from "./catalog.js";

const area = (it) => FU[it.type].w * FU[it.type].d;
export const isAuto = (it) => it.zAuto !== false;
export const topOf = (it) => (it.z || 0) + FU[it.type].h;

// Can a piece of `type` rest on `support`? The support must be a surface, clearly bigger, and the
// piece must fit within its width and depth (either way round) — so a sofa never lands on a bed.
export function canRestOn(type, support){
  const f = FU[type], s = FU[support.type];
  const fits = (f.w <= s.w && f.d <= s.d) || (f.w <= s.d && f.d <= s.w);
  return Boolean(s.surface) && fits && f.w * f.d < s.w * s.d * .9;
}

// Is the point (x, y) over the support's top, a few cm in from its edges?
function over(support, x, y){
  const f = foot(support), m = .03;
  return Math.abs(x - support.x) <= f.w / 2 - m && Math.abs(y - support.y) <= f.d / 2 - m;
}

// The piece `it` would rest on at its current position (the highest one), or null for the floor.
export function supportUnder(it, x = it.x, y = it.y){
  let best = null;
  for (const s of S.items){
    if (s === it || !canRestOn(it.type, s) || !over(s, x, y)) continue;
    if (!best || topOf(s) > topOf(best)) best = s;
  }
  return best;
}

// Put every automatic piece on whatever is under it. Bigger pieces settle first, so stacks of
// stacks work in one pass (a piece only ever rests on a bigger one).
export function settleAll(){
  for (const it of [...S.items].sort((a, b) => area(b) - area(a))){
    if (!isAuto(it)) continue;
    const s = supportUnder(it);
    it.z = s ? Math.round(topOf(s) * 100) / 100 : 0;
  }
}

// Dragging: remember what rides on a piece when the drag starts, then after each move of the piece
// bring the riders along (same offset) and let everything settle.
export const startCarry = (it) => ridersOf(it).map(r => ({r, dx:r.x - it.x, dy:r.y - it.y}));
export function carry(it, riders){
  for (const {r, dx, dy} of riders){ r.x = it.x + dx; r.y = it.y + dy; clampItem(r); }
  settleAll();
}

// Pieces currently resting on `p`, and on those, and so on (they move with it).
export function ridersOf(p){
  const out = [], queue = [p];
  while (queue.length){
    const base = queue.shift();
    for (const it of S.items){
      if (it === p || out.includes(it) || !isAuto(it)) continue;
      if (supportUnder(it) === base){ out.push(it); queue.push(it); }
    }
  }
  return out;
}
