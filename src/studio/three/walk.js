// Walk mode: look around the room like someone standing in it.
//   W A S D (or the arrows, when no piece is selected) walk, Shift runs, Q / E go down / up,
//   dragging looks around, the wheel steps forward or back. On a touch screen: one finger looks,
//   two fingers walk (slide) or step (pinch).
// The walls stop you, furniture doesn't (so you can get right up to a piece). Clicking and dragging
// pieces works as in the orbit view (interaction.js takes those presses before they get here).
import * as THREE from "three";
import { S } from "../state.js";
import { standsInside } from "../geometry.js";
import { notify } from "../store.js";
import { renderer, camera, controls, nav, setCam, stopGlide } from "./scene.js";
import { wakeAudio, blinkSound, stepSound } from "./walk-sound.js";

const EYE = 1.6, WALK = 1.4, RUN = 3.5, CLIMB = 1;   // metres, m/s, m/s, m/s
const MARGIN = .25;                                   // closest you get to a wall
const LOOK = .005, PITCH_MAX = 1.45;                  // radians per pixel dragged; ~83° up or down
// Entering, you blink twice (WalkBlink in ThreeView.tsx): a quick blink, during which the camera moves to
// eye height, then a slower one as your eyes settle.
const SHUT_AT = 90, MOVE_MS = 30;   // ms after the click; how long the move takes
// Leaving, the view blurs behind an "Exiting walk mode" card (WalkExit in ThreeView.tsx) and the camera
// glides back out to the corner view, so it's clear the walk is over.
const EXIT_GLIDE_AT = 350, EXIT_GLIDE_MS = 1300;   // ms after leaving; how long the glide takes
const STRIDE = .75, STRIDE_RUN = 1.15;   // metres per footstep
const KEYS = {KeyW:[0, 1], KeyS:[0, -1], KeyA:[-1, 0], KeyD:[1, 0],
  ArrowUp:[0, 1], ArrowDown:[0, -1], ArrowLeft:[-1, 0], ArrowRight:[1, 0]};

const held = new Set();
let yaw = 0, pitch = 0, run = false, hover = false;
let vel = new THREE.Vector2();            // current walking speed: x = right, y = forward (m/s)
let enter = null;                         // {p0, q0, p1, q1, start} while moving in
let blinkAt = 0;                          // when the last blink started (performance.now), 0 before any
let exitAt = 0, exitTimer = 0;            // when the last walk ended; the pending glide to the corner
let strideLeft = 0;                       // metres to the next footstep
const pointers = new Map();               // pointer id -> {x, y} for look / two-finger walk

export const isWalking = () => nav.mode === "walk";
export const lastBlink = () => blinkAt;
export const lastExit = () => exitAt;

// Room coordinates of a scene point, and whether someone can stand there.
const canStand = (x, z) => standsInside(x + S.L / 2, z + S.W / 2, S.poly, MARGIN);

// Somewhere to start: where the camera is if that's in the room, else the furthest point on the
// way from what it was looking at back towards the camera, else the middle of the room.
function startPoint(){
  const p = camera.position, t = controls.target;
  if (canStand(p.x, p.z)) return new THREE.Vector2(p.x, p.z);
  for (let k = 1; k >= 0; k -= .02){
    const x = t.x + (p.x - t.x) * k, z = t.z + (p.z - t.z) * k;
    if (canStand(x, z)) return new THREE.Vector2(x, z);
  }
  // the free spot nearest the middle (an L-shaped room's middle can be outside it)
  let best = new THREE.Vector2(), bestD = Infinity;
  for (let x = -S.L / 2; x <= S.L / 2; x += .1) for (let z = -S.W / 2; z <= S.W / 2; z += .1){
    if (x * x + z * z < bestD && canStand(x, z)){ best.set(x, z); bestD = x * x + z * z; }
  }
  return best;
}

export function startWalk(){
  if (isWalking()) return;
  clearTimeout(exitTimer); exitAt = 0; stopGlide();   // back in before the glide out finished
  // Face the way the camera was looking, level-ish.
  const f = controls.target.clone().sub(camera.position);
  yaw = Math.atan2(-f.x, -f.z); pitch = -.08;
  const at = startPoint();
  const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  blinkAt = performance.now();
  enter = {p0:camera.position.clone(), q0:camera.quaternion.clone(), p1:new THREE.Vector3(at.x, EYE, at.y), q1, start:blinkAt + SHUT_AT};
  wakeAudio(); blinkSound();
  controls.enabled = false;
  vel.set(0, 0); held.clear(); pointers.clear();
  nav.mode = "walk"; nav.step = step; nav.exit = stopWalk;
  notify();
}

// Back to orbiting, around a point a little in front of where you stand, then out to the corner view
// (unless `toCorner` is false: a view or a focus that ended the walk takes the camera itself).
export function stopWalk(toCorner = true){
  if (!isWalking()) return;
  exitAt = performance.now();
  if (toCorner) exitTimer = setTimeout(() => setCam("corner", false, EXIT_GLIDE_MS), EXIT_GLIDE_AT);
  enter = null; held.clear(); pointers.clear();
  nav.mode = "orbit"; nav.step = null; nav.exit = null;
  controls.target.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 1.5);
  controls.enabled = true; controls.update();
  notify();
}

export const toggleWalk = () => isWalking() ? stopWalk() : startWalk();

// Move by (dx, dz) in the scene, sliding along a wall rather than stopping dead at it.
// If you're already outside (the room just changed), any move is allowed.
function moveBy(dx, dz){
  const p = camera.position;
  if (!canStand(p.x, p.z) || canStand(p.x + dx, p.z + dz)){ p.x += dx; p.z += dz; }
  else if (canStand(p.x + dx, p.z)) p.x += dx;
  else if (canStand(p.x, p.z + dz)) p.z += dz;
}
// Forward and right in the scene for the way you face (looking up or down doesn't change it).
const forward = () => [-Math.sin(yaw), -Math.cos(yaw)];
const right = () => [Math.cos(yaw), -Math.sin(yaw)];
function walkBy(side, ahead){
  const [fx, fz] = forward(), [rx, rz] = right();
  moveBy(rx * side + fx * ahead, rz * side + fz * ahead);
}

// A footstep each stride while a walking key is held (the first comes soon after you set off);
// gliding to a stop after letting go makes no more.
function footsteps(moved, walking){
  if (!walking){ strideLeft = 0; return; }
  const stride = run ? STRIDE_RUN : STRIDE;
  if (strideLeft <= 0) strideLeft = stride * .35;
  strideLeft -= moved;
  if (strideLeft <= 0){ stepSound(run); strideLeft += stride; }
}

// Each frame (scene.js calls it instead of the orbit controls).
function step(dt){
  if (enter){
    const k = THREE.MathUtils.clamp((performance.now() - enter.start) / MOVE_MS, 0, 1), e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(enter.p0, enter.p1, e); camera.quaternion.slerpQuaternions(enter.q0, enter.q1, e);
    if (k === 1) enter = null;
    return;
  }
  let side = 0, ahead = 0, climb = 0;
  for (const c of held){
    if (KEYS[c]){ side += KEYS[c][0]; ahead += KEYS[c][1]; }
    if (c === "KeyE") climb++; else if (c === "KeyQ") climb--;
  }
  const n = Math.hypot(side, ahead), speed = run ? RUN : WALK;
  const want = n ? new THREE.Vector2(side / n * speed, ahead / n * speed) : new THREE.Vector2();
  vel.lerp(want, 1 - Math.exp(-dt * 12));   // ease into and out of a walk
  if (vel.lengthSq() > 1e-6){
    const x0 = camera.position.x, z0 = camera.position.z;
    walkBy(vel.x * dt, vel.y * dt);
    footsteps(Math.hypot(camera.position.x - x0, camera.position.z - z0), n > 0);
  }
  if (climb) camera.position.y = THREE.MathUtils.clamp(camera.position.y + climb * CLIMB * dt, .3, Math.max(.4, S.H - .1));
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}

// Keys. Walking keys only count while the pointer is over the 3D view (so typing a name elsewhere
// never walks), and the arrows only when nothing is selected (otherwise they move the piece).
export function walkKey(e, pieceSelected){
  if (!isWalking() || !hover || e.ctrlKey || e.metaKey || e.altKey) return false;
  const walkKey = KEYS[e.code] && !(e.code.startsWith("Arrow") && pieceSelected);
  if (!walkKey && e.code !== "KeyQ" && e.code !== "KeyE") return false;
  e.preventDefault();
  held.add(e.code); run = e.shiftKey;
  return true;
}
export function walkKeyUp(e){ held.delete(e.code); run = e.shiftKey; }
export function walkStop(){ held.clear(); }   // the window lost focus: the key-ups would never arrive

// Pointer and wheel on the canvas. Bound once.
let bound = false;
export function initWalk(){
  if (bound) return;
  bound = true;
  const cv = renderer.domElement;
  for (const ev of ["pointerenter", "pointermove"]) cv.addEventListener(ev, () => { hover = true; });
  cv.addEventListener("pointerleave", () => { hover = false; held.clear(); });
  cv.addEventListener("pointerdown", e => {
    if (!isWalking()) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", e => {
    const was = pointers.get(e.pointerId);
    if (!isWalking() || !was || enter) return;
    if (pointers.size === 1){
      // look: drag right to turn right, drag up to look up
      yaw -= (e.clientX - was.x) * LOOK;
      pitch = THREE.MathUtils.clamp(pitch - (e.clientY - was.y) * LOOK, -PITCH_MAX, PITCH_MAX);
    } else if (pointers.size === 2){
      // two fingers: slide to walk, pinch to step (half each, as both fingers report)
      const [o] = [...pointers].filter(([id]) => id !== e.pointerId).map(([, v]) => v);
      const before = Math.hypot(was.x - o.x, was.y - o.y), after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      walkBy(-(e.clientX - was.x) * .005, (e.clientY - was.y) * .005 + (after - before) * .01);
    }
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  });
  const up = e => { pointers.delete(e.pointerId); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => {
    if (!isWalking() || enter) return;
    e.preventDefault();
    walkBy(0, THREE.MathUtils.clamp(-e.deltaY * .003, -.6, .6));
  }, {passive:false});
}
