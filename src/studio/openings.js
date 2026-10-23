// Windows and doors in the studio: library presets, and the rules for placing and moving them.
// The opening model is the room setup's: {id, type:"door"|"window", wall, offset, width, height, sill}
//   wall   = wall index (wall i runs from corner i to corner i+1 of S.poly)
//   offset = metres from the wall's start corner to the opening's near edge
//   sill   = height of the bottom edge above the floor (0 for doors; a window with sill 0 is a glass door)
import { S, walls, wallLen } from "./state.js";
import { clamp, snap } from "./utils.js";

// Library presets (sizes in metres). A preset is a starting point; the inspector edits sizes after.
export const OPENING_PRESETS = [
  {id:"window",      type:"window", name:"Window",               ar:"شباك",              width:1.2, height:1.3, sill:.9},
  {id:"wide-window", type:"window", name:"Wide window",          ar:"شباك عريض",          width:2.4, height:1.4, sill:.6},
  {id:"glass-door",  type:"window", name:"Glass / balcony door", ar:"باب زجاج / بلكونة",  width:1.6, height:2.2, sill:0},
  {id:"door",        type:"door",   name:"Door",                 ar:"باب",               width:.9,  height:2.1, sill:0}
];
export const OP = Object.fromEntries(OPENING_PRESETS.map(p => [p.id, p]));

// What kind of opening this is, for names and the AI prompt.
export const isGlassDoor = (o) => o.type === "window" && o.sill < .05;
export const openingKind = (o) => o.type === "door" ? "door" : isGlassDoor(o) ? "glass-door" : o.width >= 2 ? "wide-window" : "window";
export const openingDesc = (o) => ({door:"interior door", "glass-door":"floor-to-ceiling glass balcony door", "wide-window":"wide window", window:"window"})[openingKind(o)];

const GAP = .05;          // minimum distance to a corner or another opening
const TOP_GAP = .05;      // minimum distance below the ceiling

export const findOpening = (id) => S.openings.find(o => o.id === id);
export const openingsOn = (wall, exceptId) => S.openings.filter(o => o.wall === wall && o.id !== exceptId);

let seq = 0;
const newId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

// Nearest wall to a plan point and the distance along it from the wall's start corner.
export function nearestWallAny(x, y){
  let best = null, bestD = Infinity;
  for (const w of walls()){
    const t = clamp(((x - w.a[0]) * (w.b[0] - w.a[0]) + (y - w.a[1]) * (w.b[1] - w.a[1])) / (w.len * w.len), 0, 1);
    const d = Math.hypot(w.a[0] + t * (w.b[0] - w.a[0]) - x, w.a[1] + t * (w.b[1] - w.a[1]) - y);
    if (d < bestD){ bestD = d; best = {wall:w.i, along:t * w.len}; }
  }
  return best;
}

// Keep size and height sensible for the wall and ceiling.
export function clampSize(o){
  const len = wallLen(o.wall);
  o.width = clamp(snap(o.width), .4, Math.max(.4, len - 2 * GAP));
  o.sill = o.type === "door" ? 0 : clamp(snap(o.sill), 0, S.H - .4);
  o.height = clamp(snap(o.height), .3, S.H - TOP_GAP - o.sill);
}

const fitsAt = (o, offset) => offset >= GAP - 1e-6 && offset + o.width <= wallLen(o.wall) - GAP + 1e-6 &&
  openingsOn(o.wall, o.id).every(p => offset + o.width + GAP <= p.offset + 1e-6 || p.offset + p.width + GAP <= offset + 1e-6);

// The free offset closest to `wanted` on the opening's wall, or null if it doesn't fit anywhere.
export function freeOffset(o, wanted){
  const len = wallLen(o.wall);
  if (o.width > len - 2 * GAP) return null;
  const want = clamp(snap(wanted), GAP, len - GAP - o.width);
  if (fitsAt(o, want)) return want;
  // candidate spots: right after or right before each neighbour, and both ends of the wall
  const cands = [GAP, len - GAP - o.width];
  for (const p of openingsOn(o.wall, o.id)) cands.push(p.offset + p.width + GAP, p.offset - GAP - o.width);
  const ok = cands.map(c => Math.round(c * 1000) / 1000).filter(c => fitsAt(o, c));
  if (!ok.length) return null;
  return ok.sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
}

// Add an opening from preset `presetId`, centred near `along` on `wall`. Returns it, or null if there's no room.
export function addOpening(presetId, wall, along){
  const p = OP[presetId];
  const o = {id:newId(), type:p.type, wall, offset:0, width:p.width, height:p.height, sill:p.sill};
  clampSize(o);
  const off = freeOffset(o, along - o.width / 2);
  if (off === null) return null;
  o.offset = off; S.openings.push(o);
  return o;
}

// Move an opening to (wall, wanted offset). Stays where it was if the spot isn't free.
export function moveOpening(o, wall, wantedOffset){
  const prev = {wall:o.wall, offset:o.offset, width:o.width, height:o.height, sill:o.sill};
  o.wall = wall; clampSize(o);
  const want = clamp(snap(wantedOffset), GAP, wallLen(wall) - GAP - o.width);
  if (fitsAt(o, want)){ o.offset = want; delete o.fromAI; return true; }
  Object.assign(o, prev);
  return false;
}

// After a size change: keep it on its wall, shifting it to the nearest free spot if needed.
export function refit(o){
  clampSize(o);
  const off = freeOffset(o, o.offset);
  if (off !== null){ o.offset = off; delete o.fromAI; return true; }
  return false;
}
