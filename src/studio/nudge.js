// Arrow keys move the selected piece (or every selected piece): a tap moves it 1 cm (Shift: 10 cm),
// holding a key glides it, speeding up the longer it is held (Shift: faster). Two arrows go diagonally.
// While gliding it lines up with other pieces like a drag does (Alt: place freely). In the 3D view "up" is away from
// the camera, rounded to the nearest wall direction. One undo takes back the whole move.
import { S, clampItem, selectedItem, isLocked } from "./state.js";
import { startCarry, carry } from "./stacking.js";
import { snapToGuides, showGuides, clearGuides } from "./align.js";
import { multiItems } from "./selection.js";
import { update } from "./app.js";
import { notify, ui } from "./store.js";
import { syncAll } from "./three/items.js";
import { Vector3 } from "three";
import { camera } from "./three/scene.js";
import { groupNext } from "./history.js";

const DIRS = {ArrowUp:[0, -1], ArrowDown:[0, 1], ArrowLeft:[-1, 0], ArrowRight:[1, 0]};
const TAP = .01, BIG_TAP = .1, HOLD_MS = 250;       // metres; how long a press is a tap
const SPEED0 = .2, ACCEL = .8, SPEED_MAX = 1;       // m/s, m/s², m/s (Shift: ×3)
const held = new Set();
let glide = null;   // {pieces:[{it, riders, fx, fy}], t0, last, raf, shift, alt}

// Quarter turns from the plan's "up" (north) to the direction the 3D camera looks.
function turns(){
  if (ui.keyView !== "3d" || !camera) return 0;
  const {x:fx, z:fz} = camera.getWorldDirection(new Vector3());   // orbiting or walking
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 1 : 3;
  return fz > 0 ? 2 : 0;
}
const turn = ([x, y], n) => { for (let i = 0; i < n; i++) [x, y] = [-y, x]; return [x, y]; };

function heldDir(){
  let x = 0, y = 0;
  for (const k of held){ x += DIRS[k][0]; y += DIRS[k][1]; }
  const n = Math.hypot(x, y); if (!n) return null;
  return turn([x / n, y / n], turns());
}

// Move by (dx, dy). One piece slides along a wall it meets and lines up with others; several move
// together and stop as a group when one of them reaches a wall. Taps don't line up (they're for fine moves).
function moveBy(dx, dy, lineUp){
  const ps = glide.pieces;
  if (ps.length === 1){
    const p = ps[0], it = p.it;
    it.x = p.fx + dx; it.y = p.fy + dy; clampItem(it);
    p.fx = it.x; p.fy = it.y;   // the unsnapped position, so lining up never holds the piece back
    if (lineUp) snapToGuides(it, p.riders);
    clampItem(it); carry(it, p.riders); showGuides(it, p.riders);
    return;
  }
  const allowed = (axis, d) => {
    let best = d;
    for (const {it} of ps){
      const test = {...it, [axis]:it[axis] + d}; clampItem(test);
      const got = test[axis] - it[axis];
      if (Math.sign(got) !== Math.sign(d)) return 0;
      if (Math.abs(got) < Math.abs(best)) best = got;
    }
    return best;
  };
  const mx = dx ? allowed("x", dx) : 0, my = dy ? allowed("y", dy) : 0;
  for (const p of ps){ p.it.x += mx; p.it.y += my; carry(p.it, p.riders); }
}

function frame(now){
  if (!glide) return;
  const d = heldDir(), held_ms = now - glide.t0, dt = Math.min(.05, (now - glide.last) / 1000);
  glide.last = now;
  if (d && held_ms > HOLD_MS){
    const v = Math.min(SPEED_MAX, SPEED0 + ACCEL * (held_ms - HOLD_MS) / 1000) * (glide.shift ? 3 : 1);
    moveBy(d[0] * v * dt, d[1] * v * dt, !glide.alt);
    notify(); syncAll();
  }
  glide.raf = requestAnimationFrame(frame);
}

function stop(){
  if (!glide) return;
  cancelAnimationFrame(glide.raf); glide = null; held.clear(); clearGuides();
  groupNext("nudge"); update();
}

// keydown: true when the key was used.
export function nudgeKey(e){
  if (!DIRS[e.key] || e.ctrlKey || e.metaKey) return false;
  const many = multiItems(), one = selectedItem();
  const its = (many.length ? many : one ? [one] : []).filter(it => !isLocked(it));   // locked pieces stay put
  if (!its.length) return false;
  e.preventDefault();
  if (e.repeat) return true;   // holding is handled by the glide
  held.add(e.key);
  if (!glide){
    const picked = new Set(its);
    glide = {pieces:its.map(it => ({it, riders:startCarry(it).filter(r => !picked.has(r.r)), fx:it.x, fy:it.y})),
      t0:performance.now(), last:performance.now(), raf:0, shift:e.shiftKey, alt:e.altKey};
    glide.raf = requestAnimationFrame(frame);
  } else glide.t0 = performance.now();   // another arrow: a fresh tap, then glide again
  glide.shift = e.shiftKey; glide.alt = e.altKey;
  const [x, y] = turn(DIRS[e.key], turns()), step = e.shiftKey ? BIG_TAP : TAP;
  moveBy(x * step, y * step, false); notify(); syncAll();
  return true;
}

export function nudgeKeyUp(e){
  if (!DIRS[e.key] || !held.has(e.key)) return;
  held.delete(e.key);
  if (!held.size) stop();
}

// The window lost focus mid-move (the key-up would never arrive).
export const nudgeStop = stop;
