// The room being designed, plus geometry helpers that only depend on it.
// Units are metres; x runs west→east (0..L), y runs north→south (0..W).
import { FU } from "./catalog.js";
import { clamp } from "./utils.js";
import { openingArea } from "./openings.js";

// Example living room
export const S = {
  L:5, W:4, H:2.8,
  walls:{n:"paint-white", e:"wood-panel", s:"paint-white", w:"paint-sage"},
  floor:"oak",
  items:[
    {id:1, type:"rug",      x:2.45, y:2,    rot:90},
    {id:2, type:"sofa",     x:.5,   y:2,    rot:90},
    {id:3, type:"ctable",   x:2.2,  y:2,    rot:90},
    {id:4, type:"tvunit",   x:4.75, y:2,    rot:270},
    {id:5, type:"armchair", x:2.6,  y:.75,  rot:0},
    {id:6, type:"plant",    x:4.65, y:.4,   rot:0}
  ],
  // Windows and doors (see openings.js). offset = metres from the wall's start corner.
  openings:[
    {id:7, type:"door",   wall:"s", offset:.6,  w:.9,  h:2.1, sill:0},
    {id:8, type:"window", wall:"n", offset:1.7, w:1.6, h:1.3, sill:.9}
  ],
  // Sunlight (see three/sun.js): time of day, which way the back wall faces, season.
  sun:{time:15, facing:"S", season:"equinox"},
  sel:null,          // {kind:"item"|"opening", id} | {kind:"wall", id:"n"|"e"|"s"|"w"} | {kind:"floor"} | null
  tab:"furn",        // library tab: "furn" | "open" | "wall" | "floor"
  nextId:9,
  replacing:null     // id of the item waiting to be swapped for a library piece
};

export const findItem = (id) => S.items.find(i => i.id === id);
export const selectedItem = () => S.sel && S.sel.kind === "item" ? findItem(S.sel.id) : null;
export const isSelectedItem = (id) => Boolean(S.sel && S.sel.kind === "item" && S.sel.id === id);

// Footprint on the floor, taking rotation into account.
export const foot = (it) => { const f = FU[it.type]; return (it.rot % 180) ? {w:f.d, d:f.w} : {w:f.w, d:f.d}; };
export const wallLen = (k) => (k === "n" || k === "s") ? S.L : S.W;

// Keep a piece inside the walls, and between the floor and the ceiling.
// it.z = height of its underside above the floor (metres); 0 or missing = standing on the floor.
export function clampItem(it){
  const f = foot(it);
  it.x = f.w >= S.L ? S.L / 2 : clamp(it.x, f.w / 2, S.L - f.w / 2);
  it.y = f.d >= S.W ? S.W / 2 : clamp(it.y, f.d / 2, S.W - f.d / 2);
  it.z = Math.round(clamp(it.z || 0, 0, Math.max(0, S.H - FU[it.type].h)) * 100) / 100;   // whole centimetres
}

// The wall closest to a point, if it's reasonably close.
export function nearestWall(x, y){
  const d = {n:y, s:S.W - y, w:x, e:S.L - x};
  const k = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
  return d[k] < Math.min(S.L, S.W) * .3 ? k : null;
}

// Paintable wall area, minus its windows and doors.
export const wallArea = (k) => Math.max(0, wallLen(k) * S.H - openingArea(k));
