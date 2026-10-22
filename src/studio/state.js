// The room being designed, plus geometry helpers that only depend on it. No DOM here.
// Units are metres; x runs west→east, y runs north→south, origin at the top-left of the
// room's bounding box. Wall i runs from corner i to corner i+1 of S.poly (clockwise on screen).
import { FU } from "./catalog.js";
import { clamp } from "./utils.js";
import * as G from "./geometry.js";

const DEFAULT_FORM = {shape:"rect", lengthCm:500, widthCm:400, cutLengthCm:200, cutWidthCm:150, corner:"ne", heightCm:280};

export const S = {
  L:5, W:4, H:2.8,                       // bounding box and ceiling height (kept in sync with poly)
  poly:G.shapePoly(DEFAULT_FORM).poly,   // room outline
  form:{...DEFAULT_FORM},                // last setup form (centimetres)
  openings:[                             // {id, type:"door"|"window", wall, offset, width, height, sill}
    {id:"o1", type:"window", wall:0, offset:1.7, width:1.6, height:1.3, sill:0.9},
    {id:"o2", type:"door",   wall:2, offset:3.5, width:0.9, height:2.1, sill:0}
  ],
  walls:["paint-white", "paint-white", "paint-white", "paint-white"],   // finish per wall
  floor:"oak",
  items:[],
  sel:null,          // {kind:"item", id} | {kind:"wall", id:<wall index>} | {kind:"floor"} | null
  tab:"furn",        // library tab: "furn" | "wall" | "floor"
  nextId:1,
  replacing:null     // id of the item waiting to be swapped for a library piece
};

export const findItem = (id) => S.items.find(i => i.id === id);
export const selectedItem = () => S.sel && S.sel.kind === "item" ? findItem(S.sel.id) : null;
export const isSelectedItem = (id) => Boolean(S.sel && S.sel.kind === "item" && S.sel.id === id);

// Footprint on the floor, taking rotation into account.
export const foot = (it) => { const f = FU[it.type]; return (it.rot % 180) ? {w:f.d, d:f.w} : {w:f.w, d:f.d}; };
export const walls = () => G.wallsOf(S.poly);
export const wallLen = (i) => (walls()[i] || {len:0}).len;

// Keep a piece inside the room outline (cheap box clamp first; the full search only for L-shapes).
export function clampItem(it){
  const f = foot(it);
  it.x = f.w >= S.L ? S.L / 2 : clamp(it.x, f.w / 2, S.L - f.w / 2);
  it.y = f.d >= S.W ? S.W / 2 : clamp(it.y, f.d / 2, S.W - f.d / 2);
  const p = G.fitInside({x:it.x, y:it.y, w:f.w, d:f.d}, S.poly);
  it.x = p.x; it.y = p.y;
}

// The wall closest to a point, if it's reasonably close.
export const nearestWall = (x, y) => G.nearestWall(x, y, S.poly, Math.max(0.8, Math.min(S.L, S.W) * 0.3));

// Paintable wall area, minus every door and window on that wall.
export const wallArea = (i) => G.wallArea(i, S.poly, S.H, S.openings);

// Put a new room in place. keepDesign=false starts empty; true keeps finishes and furniture.
export function applyRoom({form, poly, openings, H}, {keepDesign = false} = {}){
  const n = poly.length;
  S.poly = poly.map(p => [p[0], p[1]]);
  const box = G.bbox(S.poly); S.L = box.L; S.W = box.W; S.H = H;
  S.form = {...form};
  S.openings = openings.map(o => ({...o}));
  if (keepDesign){
    S.walls = Array.from({length:n}, (_, i) => S.walls[i] || "paint-white");
    S.items.forEach(clampItem);
  } else {
    S.walls = Array(n).fill("paint-white");
    S.floor = "oak";
    S.items = [];
  }
  S.sel = null; S.replacing = null;
}
