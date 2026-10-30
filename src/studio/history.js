// Undo / redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y). Every save of the room (room-store.js) is a step;
// a step that repeats the same kind of change within a moment (holding an arrow key, tapping it)
// is folded into the one before, so one undo takes back the whole move.
import { S, findItem } from "./state.js";
import { bbox } from "./geometry.js";
import { rebuildAll } from "./app.js";
import { ui } from "./store.js";

const MAX = 100, MERGE_MS = 800;
let past = [], future = [], cur = null;
let pending = null, lastGroup = null, lastAt = 0, applying = false;

const snapshot = () => JSON.stringify({form:S.form, poly:S.poly, openings:S.openings, H:S.H, walls:S.walls,
  floor:S.floor, items:S.items, nextId:S.nextId, sun:S.sun});

// A new room is open: its current state is where undo stops.
export function resetHistory(){ past = []; future = []; cur = null; lastGroup = null; }

// The next change belongs to `key` (e.g. "nudge"), so it can merge with the one before.
export function groupNext(key){ pending = key; }

// Called after every save.
export function record(){
  const snap = snapshot(), group = pending; pending = null;
  if (cur === null || applying){ cur = snap; return; }
  if (snap === cur) return;
  const now = Date.now();
  if (!(group && group === lastGroup && now - lastAt < MERGE_MS)){ past.push(cur); if (past.length > MAX) past.shift(); }
  lastGroup = group; lastAt = now;
  cur = snap; future = [];
}

function apply(snap){
  const d = JSON.parse(snap);
  Object.assign(S, d);
  const box = bbox(S.poly); S.L = box.L; S.W = box.W;
  // keep the selection when it still exists
  const s = S.sel;
  if (s && ((s.kind === "item" && !findItem(s.id)) || (s.kind === "opening" && !S.openings.some(o => o.id === s.id)) ||
            (s.kind === "wall" && s.id >= S.poly.length))) S.sel = null;
  if (ui.multi) ui.multi = ui.multi.filter(id => findItem(id));
  if (ui.multiOps) ui.multiOps = ui.multiOps.filter(id => S.openings.some(o => o.id === id));
  S.replacing = null; ui.guides = null; lastGroup = null;
  cur = snap;
  applying = true; try { rebuildAll(); } finally { applying = false; }
}

export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;
export function undo(){ if (!past.length) return false; future.push(cur); apply(past.pop()); return true; }
export function redo(){ if (!future.length) return false; past.push(cur); apply(future.pop()); return true; }
