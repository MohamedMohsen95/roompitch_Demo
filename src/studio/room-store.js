// Save the current room and design in this browser, and bring it back on the next visit.
import { S } from "./state.js";
import { bbox } from "./geometry.js";
import { FU, WM, FM } from "./catalog.js";

const KEY = "rp_room";
let paused = false;

// While screen 1 is showing nothing is saved, so an untouched sample room never becomes "the last room".
export const setSaving = (on) => { paused = !on; };

export function saveRoom(){
  if (paused) return;
  const data = {v:1, form:S.form, poly:S.poly, openings:S.openings, H:S.H, walls:S.walls, floor:S.floor, items:S.items, nextId:S.nextId, sun:S.sun};
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked: keep working */ }
}

// The saved room, or null when there is none or it can't be trusted.
export function loadRoom(){
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!d || d.v !== 1 || !Array.isArray(d.poly) || d.poly.length < 4) return null;
    if (!d.poly.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return null;
    if (!Array.isArray(d.openings) || !Array.isArray(d.walls) || !Array.isArray(d.items) || !(d.H > 0)) return null;
    return d;
  } catch { return null; }
}

// Pieces and finishes the catalog doesn't know (a model file removed since, or not loaded) are left out.
// Returns {dropped}: how many pieces were left out.
export function restoreRoom(d){
  S.poly = d.poly; S.form = d.form; S.openings = d.openings; S.H = d.H;
  const box = bbox(d.poly); S.L = box.L; S.W = box.W;
  S.walls = d.poly.map((_, i) => WM[d.walls[i]] ? d.walls[i] : "paint-white");
  S.floor = FM[d.floor] ? d.floor : "oak";
  S.items = d.items.filter(it => FU[it.type]);
  S.nextId = d.nextId || (Math.max(0, ...d.items.map(i => i.id)) + 1);
  // sunlight settings (rooms saved before they existed keep the defaults)
  const ok = d.sun && ["summer", "equinox", "winter"].includes(d.sun.season) && /^(N|NE|E|SE|S|SW|W|NW)$/.test(d.sun.facing) && d.sun.time >= 5 && d.sun.time <= 20;
  if (ok) S.sun = {time:d.sun.time, facing:d.sun.facing, season:d.sun.season};
  S.sel = null; S.replacing = null;
  return {dropped:d.items.length - S.items.length};
}
