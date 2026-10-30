// Smart guides while a piece is dragged (plan or 3D): it snaps into line with other pieces and the room's
// centre, or midway between the pieces on either side, when it comes within ALIGN_TOL. ui.guides lists the
// lines that coincide and the equal gaps, so the plan can draw them.
// Pieces carried on the dragged one (riders, see stacking.js) move with it, so they don't count.
import { S, foot } from "./state.js";
import { snapAlign, alignGuides, spacingGuides } from "./geometry.js";
import { openingRect } from "./openings.js";
import { ui } from "./store.js";
import { multiItems, multiOpenings } from "./selection.js";

export const ALIGN_TOL = 0.06;   // metres

const rectOf = (it) => { const f = foot(it); return {x:it.x, y:it.y, w:f.w, d:f.d}; };
// Windows and doors count too, as fixed lines along their wall (see openingRect).
const openingRects = (ops = S.openings) => ops.map(openingRect).filter(Boolean);
const others = (it, riders) => [...S.items.filter(o => o !== it && !riders.some(r => r.r === o)).map(rectOf), ...openingRects()];
const room = () => ({L:S.L, W:S.W});

// Before clamping: pull the piece onto a nearby line (skipped while Alt is held).
export function snapToGuides(it, riders){
  const p = snapAlign(rectOf(it), others(it, riders), room(), ALIGN_TOL);
  it.x = p.x; it.y = p.y;
}

// After clamping: the guides for where the piece actually is.
export function showGuides(it, riders){
  const r = rectOf(it), os = others(it, riders);
  ui.guides = [...alignGuides(r, os, room()), ...spacingGuides(r, os)];
}
export function clearGuides(){ ui.guides = null; }

// With several pieces selected: where they line up with each other or with the room's centre, merged
// into one guide per line (shown while they stay selected, e.g. after aligning them).
// With a window or door in the selection, the pieces' lines with it show too.
export function selectionGuides(){
  const its = multiItems(), ops = openingRects(multiOpenings()); if (its.length + ops.length < 2 || !its.length) return null;
  const out = [];
  for (const it of its){
    for (const g of alignGuides(rectOf(it), [...its.filter(o => o !== it).map(rectOf), ...ops], room())){
      const same = out.find(o => o.axis === g.axis && Math.abs(o.at - g.at) < 1e-4);
      if (same){ same.from = Math.min(same.from, g.from); same.to = Math.max(same.to, g.to); } else out.push({...g});
    }
  }
  return out;
}
