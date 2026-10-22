// Windows and doors: types, where they sit on a wall, and the rules for placing them.
//
// An opening lives on one wall: {id, type, wall:"n"|"e"|"s"|"w", offset, w, h, sill}
//   offset = metres from the wall's start corner to the opening's left edge (seen in the plan:
//            north/south walls start at the west corner, east/west walls at the north corner)
//   sill   = height of the bottom edge above the floor (0 for doors)
import { S, wallLen } from "./state.js";
import { clamp, snap } from "./utils.js";

export const OPENING_TYPES = [
  {id:"window",      kind:"window", name:"Window",              w:1.2, h:1.3, sill:.9, desc:"window"},
  {id:"wide-window", kind:"window", name:"Wide window",         w:2.4, h:1.4, sill:.6, desc:"wide window"},
  {id:"glass-door",  kind:"window", name:"Glass / balcony door", w:1.6, h:2.2, sill:0,  desc:"floor-to-ceiling glass balcony door"},
  {id:"door",        kind:"door",   name:"Door",                w:.9,  h:2.1, sill:0,  desc:"interior door"}
];
export const OT = Object.fromEntries(OPENING_TYPES.map(t => [t.id, t]));

const GAP = .05;          // minimum distance to a corner or another opening
const TOP_GAP = .05;      // minimum distance below the ceiling

export const findOpening = (id) => S.openings.find(o => o.id === id);
export const openingsOn = (wall, exceptId) => S.openings.filter(o => o.wall === wall && o.id !== exceptId);

// Wall lines in plan coordinates: start corner and direction (unit vector along the wall).
export function wallLine(k){
  const {L, W} = S;
  return {n:{x:0, y:0, dx:1, dy:0}, s:{x:0, y:W, dx:1, dy:0}, w:{x:0, y:0, dx:0, dy:1}, e:{x:L, y:0, dx:0, dy:1}}[k];
}
// Direction pointing into the room from each wall.
export const INWARD = {n:{x:0, y:1}, s:{x:0, y:-1}, w:{x:1, y:0}, e:{x:-1, y:0}};

// Nearest wall to a plan point and the distance along it.
export function nearestWallAny(x, y){
  const d = {n:Math.abs(y), s:Math.abs(S.W - y), w:Math.abs(x), e:Math.abs(S.L - x)};
  const k = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
  return {wall:k, along:(k === "n" || k === "s") ? x : y};
}

// Keep size and height sensible for the room.
export function clampSize(o){
  const len = wallLen(o.wall);
  o.w = clamp(snap(o.w), .4, Math.max(.4, len - 2 * GAP));
  o.sill = clamp(snap(o.sill), 0, S.H - .4);
  o.h = clamp(snap(o.h), .3, S.H - TOP_GAP - o.sill);
}

const fitsAt = (o, offset) => offset >= GAP - 1e-6 && offset + o.w <= wallLen(o.wall) - GAP + 1e-6 &&
  openingsOn(o.wall, o.id).every(p => offset + o.w + GAP <= p.offset + 1e-6 || p.offset + p.w + GAP <= offset + 1e-6);

// The free offset closest to `wanted` on the opening's wall, or null if it doesn't fit anywhere.
export function freeOffset(o, wanted){
  const len = wallLen(o.wall);
  if (o.w > len - 2 * GAP) return null;
  const want = clamp(snap(wanted), GAP, len - GAP - o.w);
  if (fitsAt(o, want)) return want;
  // candidate spots: right after or right before each neighbour, and both ends of the wall
  const cands = [GAP, len - GAP - o.w];
  for (const p of openingsOn(o.wall, o.id)) cands.push(p.offset + p.w + GAP, p.offset - GAP - o.w);
  const ok = cands.map(c => Math.round(c * 1000) / 1000).filter(c => fitsAt(o, c));
  if (!ok.length) return null;
  return ok.sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
}

// Add an opening of `typeId` centred near `along` on `wall`. Returns it, or null if there's no room.
export function addOpening(typeId, wall, along){
  const t = OT[typeId];
  const o = {id:S.nextId++, type:typeId, wall, offset:0, w:t.w, h:t.h, sill:t.sill};
  clampSize(o);
  const off = freeOffset(o, along - o.w / 2);
  if (off === null) return null;
  o.offset = off; S.openings.push(o);
  return o;
}

// Move an opening to (wall, wanted offset). Stays where it was if the spot isn't free.
export function moveOpening(o, wall, wantedOffset){
  const prev = {wall:o.wall, offset:o.offset};
  o.wall = wall; clampSize(o);
  const len = wallLen(wall), want = clamp(snap(wantedOffset), GAP, len - GAP - o.w);
  if (fitsAt(o, want)){ o.offset = want; return true; }
  Object.assign(o, prev); clampSize(o);
  return false;
}

// After a size change: keep it on its wall, shifting it to the nearest free spot if needed.
export function refit(o){
  clampSize(o);
  const off = freeOffset(o, o.offset);
  if (off !== null){ o.offset = off; return true; }
  return false;
}

// After the room size changed: shrink/shift openings to fit, drop the ones that can't.
// Returns how many were removed.
export function refitAll(){
  let removed = 0;
  for (const o of [...S.openings]) if (!refit(o)){ S.openings = S.openings.filter(p => p !== o); removed++; }
  return removed;
}

// Opening area per wall (for the paintable wall area).
export const openingArea = (wall) => openingsOn(wall).reduce((a, o) => a + o.w * o.h, 0);
