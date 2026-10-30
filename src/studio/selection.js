// Several things selected at once (Ctrl/Shift+click): pieces, plus windows and doors as fixed references to
// align them with. ui.multi holds the pieces' ids and ui.multiOps the openings'; they only count while the main
// selection (S.sel) is one of them, so anything that selects something else simply ends it.
import { S, findItem } from "./state.js";
import { findOpening } from "./openings.js";
import { ui } from "./store.js";

// Everything selected, as {items:[ids], ops:[ids]}, when two or more things are; otherwise empty lists.
function picked(){
  const s = S.sel, items = (ui.multi || []).filter(id => findItem(id)), ops = (ui.multiOps || []).filter(id => findOpening(id));
  const inIt = s && ((s.kind === "item" && items.includes(s.id)) || (s.kind === "opening" && ops.includes(s.id)));
  return inIt && items.length + ops.length >= 2 ? {items, ops} : {items:[], ops:[]};
}

// The selected pieces' ids when two or more things are selected, otherwise [].
export const multiIds = () => picked().items;
export const multiItems = () => multiIds().map(findItem);
// The windows and doors in a multi-selection (they never move).
export const multiOpIds = () => picked().ops;
export const multiOpenings = () => multiOpIds().map(findOpening);
export const multiCount = () => { const p = picked(); return p.items.length + p.ops.length; };
export const isMulti = () => multiCount() >= 2;

// Add a piece ("item") or a window/door ("opening") to the selection, or take it out (back to a single
// selection when one thing is left).
export function toggleInMulti(id, kind = "item"){
  const p = picked(), s = S.sel;
  let items = p.items, ops = p.ops;
  if (!items.length && !ops.length && s){   // starting from a single selection
    if (s.kind === "item") items = [s.id];
    else if (s.kind === "opening") ops = [s.id];
  }
  const list = kind === "item" ? items : ops, next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  if (kind === "item") items = next; else ops = next;
  if (items.length + ops.length >= 2){
    ui.multi = items; ui.multiOps = ops;
    S.sel = next.includes(id) ? {kind, id} : items.length ? {kind:"item", id:items[items.length - 1]} : {kind:"opening", id:ops[ops.length - 1]};
  } else {
    ui.multi = null; ui.multiOps = null;
    S.sel = items.length ? {kind:"item", id:items[0]} : ops.length ? {kind:"opening", id:ops[0]} : null;
  }
}
export function endMulti(){ ui.multi = null; ui.multiOps = null; }
