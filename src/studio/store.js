// Tells the React interface (ui/hooks.ts) that the room in state.js, or the interface state below, changed.
// The room stays one mutable object that the plan, the 3D view and the actions all change in place;
// notify() after a change is what redraws the panels.
let version = 0;
const subs = new Set();

export function notify(){ version++; for (const fn of subs) fn(); }
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const getVersion = () => version;

// Interface state that isn't part of the saved room.
export const ui = {
  flash:null,          // a short message shown in place of the library hint (flashHint in actions.js)
  canUpload:false,     // "Upload 3D model" shows once Supabase is reachable
  inspectMsg:null,     // a short message in the selection bar (e.g. a size that doesn't fit), cleared on the next selection
  guides:null,         // alignment guides while a piece is dragged (align.js), drawn on the plan
  multi:null,          // ids of several selected pieces (selection.js)
  multiOps:null,       // ids of windows/doors selected with them, to align to (selection.js)
  keyView:"plan"       // the view last clicked, "plan" | "3d": arrow keys move pieces as seen there (nudge.js)
};
