// What the designer can do to the room from the library, the selection bar and the keyboard.
import { S, clampItem, findItem, nearestWall, selectedItem } from "./state.js";
import { isRug } from "./catalog.js";
import { addOpening, nearestWallAny } from "./openings.js";
import { canRestOn } from "./stacking.js";
import { update } from "./app.js";
import { notify, ui } from "./store.js";
import { t } from "./i18n.js";
import { wallsOf } from "./geometry.js";

// Apply a dragged/clicked library entry ("furn:sofa", "open:window", "wall:paint-white", "floor:oak").
// `target` = {kind:'point', x, y} | {kind:'item', id, x?, y?} | {kind:'wall', id, along?} | {kind:'floor'} | null
export function applyPayload(payload, target){
  const [kind, id] = payload.split(":");
  if (kind === "furn"){
    // Dropped on a piece: if the new piece can sit on it (a vase on a table) it's placed on top,
    // otherwise it replaces that piece (same spot and direction). Rugs are never swapped: pieces go on top.
    if (target && target.kind === "item" && target.x !== undefined){
      const under = findItem(target.id);
      if (under && (canRestOn(id, under) || isRug(under.type))) target = {kind:"point", x:target.x, y:target.y};
    }
    const swapId = target && target.kind === "item" ? target.id : S.replacing;
    const old = swapId && findItem(swapId);
    if (old){
      const it = {id:S.nextId++, type:id, x:old.x, y:old.y, z:old.z || 0, zAuto:old.zAuto, rot:old.rot};
      clampItem(it);
      S.items = S.items.map(i => i.id === old.id ? it : i);
      S.sel = {kind:"item", id:it.id}; S.replacing = null;
      update(); return;
    }
    const p = target && target.kind === "point" ? target : {x:S.L / 2, y:S.W / 2};
    const it = {id:S.nextId++, type:id, x:p.x, y:p.y, rot:0};
    clampItem(it); S.items.push(it); S.sel = {kind:"item", id:it.id};
  } else if (kind === "open"){
    // onto the wall nearest the drop point, onto a wall dropped on in 3D, or the selected wall (middle)
    let at = null;
    if (target && target.kind === "point") at = nearestWallAny(target.x, target.y);
    else if (target && target.kind === "wall") at = {wall:target.id, along:target.along};
    else if (S.sel && S.sel.kind === "wall") at = {wall:S.sel.id};
    if (!at){ flashHint(t("hintOpenWallFirst")); return; }
    if (at.along === undefined) at.along = (wallsOf(S.poly)[at.wall] || {len:0}).len / 2;
    const o = addOpening(id, at.wall, at.along);
    if (!o){ flashHint(t("hintNoRoomOnWall")); return; }
    S.sel = {kind:"opening", id:o.id};
  } else if (kind === "wall"){
    let w = target && target.kind === "wall" ? target.id : null;
    if (w == null && target && target.kind === "point") w = nearestWall(target.x, target.y);
    if (w == null && S.sel && S.sel.kind === "wall") w = S.sel.id;
    if (w == null){ flashHint(t("hintWallFirst")); return; }
    S.walls[w] = id; S.sel = {kind:"wall", id:w};
  } else if (kind === "floor"){
    S.floor = id; S.sel = {kind:"floor"};
  }
  update();
}

// A message in place of the library hint for a few seconds.
let flashTimer = null;
export function flashHint(msg, ms = 2600){
  clearTimeout(flashTimer);
  ui.flash = msg; notify();
  flashTimer = setTimeout(() => { ui.flash = null; notify(); }, ms);
}

// Select something (or nothing); a selection-bar message belongs to the previous selection.
export function select(sel){ S.sel = sel; ui.inspectMsg = null; update(); }

export function rotateSel(){
  const it = selectedItem(); if (!it) return;
  it.rot = (it.rot + 90) % 360; clampItem(it); update();
}

// Delete anything: a piece or an opening is removed, a wall or the floor goes back to unfinished.
export function deleteSel(){
  const s = S.sel; if (!s) return;
  if (s.kind === "item"){ S.items = S.items.filter(i => i.id !== s.id); S.sel = null; }
  else if (s.kind === "opening"){ S.openings = S.openings.filter(o => o.id !== s.id); S.sel = null; }
  else if (s.kind === "wall") S.walls[s.id] = "bare-wall";
  else if (s.kind === "floor") S.floor = "bare-floor";
  update();
}

export function clearSelection(){ S.sel = null; S.replacing = null; ui.inspectMsg = null; update(); }

// Studio shortcuts. Returns true when the key was used.
export function studioKey(e){
  if (e.key === "Escape"){ clearSelection(); return true; }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return false;
  if (e.key === "Delete" || e.key === "Backspace"){ deleteSel(); return true; }
  if (e.key === "r" || e.key === "R"){ rotateSel(); return true; }
  if (e.key === "PageUp" || e.key === "PageDown"){
    // raise / lower the selected piece by 5 cm (pins its height)
    const it = selectedItem(); if (!it) return false;
    e.preventDefault();
    it.z = (it.z || 0) + (e.key === "PageUp" ? .05 : -.05); it.zAuto = false; clampItem(it); update();
    return true;
  }
  return false;
}
