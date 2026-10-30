// What the designer can do to the room from the library, the selection bar and the keyboard.
import { S, clampItem, findItem, nearestWall, selectedItem, isLocked } from "./state.js";
import { isRug } from "./catalog.js";
import { addOpening, nearestWallAny, openingRect } from "./openings.js";
import { canRestOn } from "./stacking.js";
import { update } from "./app.js";
import { notify, ui } from "./store.js";
import { t } from "./i18n.js";
import { wallsOf, alignRects, ALIGN_AXIS } from "./geometry.js";
import { foot } from "./state.js";
import { startCarry, carry } from "./stacking.js";
import { multiIds, multiItems, multiOpenings, multiOpIds, isMulti, endMulti } from "./selection.js";
import { undo, redo } from "./history.js";
import { nudgeKey } from "./nudge.js";
import { focusBox } from "./three/scene.js";
import { itemsBox } from "./three/items.js";
import { walkKey } from "./three/walk.js";

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
    if (old && isLocked(old)){ S.replacing = null; flashHint(t("lockedHint")); return; }
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
export function select(sel){ S.sel = sel; endMulti(); ui.inspectMsg = null; update(); }

// Line the selected pieces up (see geometry.js alignRects). Whatever rests on a piece moves with it.
// A selected window or door stays where it is: the pieces line up with it (along its wall only).
// Locked pieces stay put the same way, as anchors on both axes.
const footRect = (it) => { const f = foot(it); return {x:it.x, y:it.y, w:f.w, d:f.d}; };
const anchorRects = () => [...multiOpenings().map(openingRect).filter(Boolean), ...multiItems().filter(isLocked).map(footRect)];
export function canAlign(mode){
  const n = multiItems().filter(it => !isLocked(it)).length;
  return n >= 2 || (n >= 1 && anchorRects().some(a => !a.only || a.only === ALIGN_AXIS[mode]));
}
export function alignSelected(mode){
  if (!canAlign(mode)) return;
  const its = multiItems().filter(it => !isLocked(it)), moved = new Set(its);
  const riders = its.map(it => startCarry(it).filter(r => !moved.has(r.r)));
  alignRects(its.map(footRect), mode, anchorRects()).forEach((p, i) => {
    const it = its[i]; it.x = p.x; it.y = p.y; clampItem(it); carry(it, riders[i]);
  });
  update();
}

// A quarter turn: counter-clockwise (as seen from above), or clockwise with dir -1.
export function rotateSel(dir = 1){
  const it = selectedItem(); if (!it || isLocked(it)) return;
  it.rot = (it.rot + 90 * dir + 360) % 360; clampItem(it); update();
}

// Lock the selected piece (or pieces) in place, or unlock them: with any of them unlocked, all get locked.
export function toggleLock(){
  const its = multiItems().length ? multiItems() : [selectedItem()].filter(Boolean);
  if (!its.length) return;
  const lock = its.some(it => !isLocked(it));
  for (const it of its){ if (lock) it.locked = true; else delete it.locked; }
  update();
}

// Glide the 3D camera up to the selected piece (or pieces) and orbit around it. False when nothing is selected.
export function focusSel(){
  const ids = multiIds().length ? multiIds() : S.sel && S.sel.kind === "item" ? [S.sel.id] : [];
  const box = ids.length && itemsBox(ids);
  if (!box) return false;
  focusBox(box);
  return true;
}

// Delete anything: a piece or an opening is removed, a wall or the floor goes back to unfinished.
export function deleteSel(){
  const s = S.sel; if (!s) return;
  if (isMulti()){
    const many = multiIds(), ops = multiOpIds();
    S.items = S.items.filter(i => !many.includes(i.id) || isLocked(i));   // locked pieces stay
    S.openings = S.openings.filter(o => !ops.includes(o.id));
    S.sel = null; endMulti(); update(); return;
  }
  if (s.kind === "item"){ if (isLocked(findItem(s.id))) return; S.items = S.items.filter(i => i.id !== s.id); S.sel = null; }
  else if (s.kind === "opening"){ S.openings = S.openings.filter(o => o.id !== s.id); S.sel = null; }
  else if (s.kind === "wall") S.walls[s.id] = "bare-wall";
  else if (s.kind === "floor") S.floor = "bare-floor";
  update();
}

export function clearSelection(){ S.sel = null; endMulti(); S.replacing = null; ui.inspectMsg = null; update(); }

// Studio shortcuts. Returns true when the key was used.
export function studioKey(e){
  if (e.key === "Escape"){ clearSelection(); return true; }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return false;   // typing: the field's own undo
  // Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo (by key position, so it works with any keyboard layout)
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === "KeyZ" || e.code === "KeyY")){
    e.preventDefault();
    if (e.code === "KeyY" || e.shiftKey) redo(); else undo();
    return true;
  }
  if (!e.defaultPrevented && walkKey(e, Boolean(selectedItem() || multiItems().length))) return true;
  if (!e.defaultPrevented && nudgeKey(e)) return true;
  if (e.key === "Delete" || e.key === "Backspace"){ deleteSel(); return true; }
  if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey){ rotateSel(e.shiftKey ? -1 : 1); return true; }
  if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) return focusSel();
  if (e.key === "PageUp" || e.key === "PageDown"){
    // raise / lower the selected piece by 5 cm (pins its height)
    const it = selectedItem(); if (!it || isLocked(it)) return false;
    e.preventDefault();
    it.z = (it.z || 0) + (e.key === "PageUp" ? .05 : -.05); it.zAuto = false; clampItem(it); update();
    return true;
  }
  return false;
}
