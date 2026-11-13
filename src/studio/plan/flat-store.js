// The flat being designed, kept in this browser (and copied to the cloud through onFlatSaved), and which
// of its spaces is open in the studio. Opening a space and saving its design are pure (flat in, flat out).
import { spaceRoom, writeBackOpenings } from "./flat.js";

const KEY = "rp_flat", SPACE_KEY = "rp_flat_space", IMAGE_KEY = "rp_flat_image";
let afterSave = null;

export const onFlatSaved = (fn) => { afterSave = fn; };

const okPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

const okReal = (r) => r == null || (Array.isArray(r.spaces) && Array.isArray(r.openings) && Array.isArray(r.confirmed)
  && r.confirmed.every(c => typeof c === "string")
  && r.spaces.every(s => s && typeof s.id === "string" && Array.isArray(s.poly) && s.poly.length >= 3 && s.poly.every(okPoint))
  && r.openings.every(o => o && typeof o.id === "string" && okPoint(o.a) && okPoint(o.b)));

// A v1 flat (before the real flat) as v2.
export const upgradeFlat = (f) => f.v === 2 ? f : {...f, v:2, scaleAsked:false, real:null};

const okEdits = (e) => e == null || (Array.isArray(e) && e.every(x => x && typeof x.id === "string" && (x.kind === "wall" || x.kind === "erase") && okPoint(x.a) && okPoint(x.b)));

export function validFlat(f){
  if (!f || (f.v !== 1 && f.v !== 2) || !okReal(f.real) || !okEdits(f.edits) || !f.image || !(f.image.w > 0 && f.image.h > 0) || !(f.H > 0)) return false;
  if (f.scale != null && !(f.scale > 0)) return false;
  if (!Array.isArray(f.spaces) || !Array.isArray(f.openings)) return false;
  if (f.unplaced != null && !(Array.isArray(f.unplaced) && f.unplaced.every(u => u && typeof u.name === "string"))) return false;
  if (!f.spaces.every(s => s && typeof s.id === "string" && Array.isArray(s.outline) && s.outline.length >= 3 && s.outline.every(okPoint))) return false;
  return f.openings.every(o => o && typeof o.id === "string" && okPoint(o.a) && okPoint(o.b));
}

// The plan image (a JPEG data URL, often 1–2 MB) is kept apart from the flat: written only when it changes,
// not on every edit of a room, and kept in memory too, so a plan too big for this browser's storage still
// works until a reload (by then the cloud copy has it: image.path, see setFlatImagePath).
let image = null;   // the data URL last saved or loaded
function keepImage(dataUrl){
  if (dataUrl === image) return;
  image = dataUrl || null;
  try {
    if (image) localStorage.setItem(IMAGE_KEY, image); else localStorage.removeItem(IMAGE_KEY);
  } catch {
    try { localStorage.removeItem(IMAGE_KEY); } catch { /* ignore */ }   // too big: an old image mustn't stay behind
    if (import.meta.env?.DEV) console.warn("[flat] the plan image is too big for this browser's storage; it is kept for this visit and in the cloud");
  }
}

export function saveFlat(flat){
  const { dataUrl, ...rest } = flat.image;
  keepImage(dataUrl);
  try { localStorage.setItem(KEY, JSON.stringify({...flat, image:rest})); } catch { /* storage full or blocked: keep working */ }
  afterSave?.(flat);
}

export function loadFlat(){
  try {
    const f = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!validFlat(f)) return null;
    if (!f.image.dataUrl){   // flats saved before the image was kept apart have it inline
      image ??= localStorage.getItem(IMAGE_KEY);
      if (image) f.image = {...f.image, dataUrl:image};
    }
    return upgradeFlat(f);
  } catch { return null; }
}

// The plan image (dataUrl) is in cloud storage at `path`: remember it, so it isn't uploaded again after a reload
// and can be fetched from there when this browser couldn't keep it. Not a change to the flat, so nothing is sent
// again. Only while that image is still this browser's plan (an upload can finish after a new plan was picked).
export function setFlatImagePath(path, dataUrl){
  if (!dataUrl || dataUrl !== image) return;
  try {
    const f = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!f?.image || f.image.path === path) return;
    localStorage.setItem(KEY, JSON.stringify({...f, image:{...f.image, path}}));
  } catch { /* ignore */ }
}

export function clearFlat(){
  image = null;
  try { localStorage.removeItem(KEY); localStorage.removeItem(SPACE_KEY); localStorage.removeItem(IMAGE_KEY); } catch { /* ignore */ }
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
