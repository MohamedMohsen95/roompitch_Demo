// The flat being designed, kept in this browser (and copied to the cloud through onFlatSaved), and which
// of its spaces is open in the studio. Opening a space and saving its design are pure (flat in, flat out).
import { spaceRoom, writeBackOpenings } from "./flat.js";

const KEY = "rp_flat", SPACE_KEY = "rp_flat_space";
let afterSave = null;

export const onFlatSaved = (fn) => { afterSave = fn; };

const okPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

export function validFlat(f){
  if (!f || f.v !== 1 || !f.image || !(f.image.w > 0 && f.image.h > 0) || !(f.H > 0)) return false;
  if (f.scale != null && !(f.scale > 0)) return false;
  if (!Array.isArray(f.spaces) || !Array.isArray(f.openings)) return false;
  if (!f.spaces.every(s => s && typeof s.id === "string" && Array.isArray(s.outline) && s.outline.length >= 3 && s.outline.every(okPoint))) return false;
  return f.openings.every(o => o && typeof o.id === "string" && okPoint(o.a) && okPoint(o.b));
}

export function saveFlat(flat){
  try { localStorage.setItem(KEY, JSON.stringify(flat)); } catch { /* storage full or blocked: keep working */ }
  afterSave?.(flat);
}

export function loadFlat(){
  try {
    const f = JSON.parse(localStorage.getItem(KEY) || "null");
    return validFlat(f) ? f : null;
  } catch { return null; }
}

export function clearFlat(){
  try { localStorage.removeItem(KEY); localStorage.removeItem(SPACE_KEY); } catch { /* ignore */ }
}

export function setCurrentSpace(id){
  try { if (id) localStorage.setItem(SPACE_KEY, id); else localStorage.removeItem(SPACE_KEY); } catch { /* ignore */ }
}
export function currentSpace(){
  try { return localStorage.getItem(SPACE_KEY) || null; } catch { return null; }
}

// What the studio needs to open a space: the room from the flat, its saved design (with the outline,
// doors and windows always taken from the flat) or null, and the flat with the space marked in progress.
export function openSpace(flat, spaceId){
  const room = spaceRoom(flat, spaceId);
  const space = flat.spaces.find(s => s.id === spaceId);
  const saved = space.design ? {...space.design, poly:room.poly, openings:room.openings, H:room.H, form:room.form} : null;
  const next = space.status === "todo"
    ? {...flat, spaces:flat.spaces.map(s => s.id === spaceId ? {...s, status:"doing"} : s)}
    : flat;
  return {room, saved, flat:next};
}

// A room save while a space is open: the design is kept on the space and its doors and windows go back to the flat.
export function designSaved(flat, spaceId, data){
  const f = writeBackOpenings(flat, spaceId, data.openings || []);
  return {...f, spaces:f.spaces.map(s => s.id === spaceId ? {...s, design:data} : s)};
}
