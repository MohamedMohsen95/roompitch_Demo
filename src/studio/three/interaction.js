// Mouse/touch in the 3D view: select, drag pieces across the floor, double-click to rotate,
// and drop library entries onto the floor, a wall or a piece.
import * as THREE from "three";
import { S, clampItem, findItem, isSelectedItem, isLocked } from "../state.js";
import { FU } from "../catalog.js";
import { nearestWallAny } from "../openings.js";
import { saveRoom } from "../room-store.js";
import { snap } from "../utils.js";
import { update } from "../app.js";
import { applyPayload, rotateSel } from "../actions.js";
import { notify, ui } from "../store.js";
import { renderer, scene, camera, controls, itemGroup, pickables, nav } from "./scene.js";
import { syncAll, refreshHelper } from "./items.js";
import { startCarry, carry } from "../stacking.js";
import { snapToGuides, showGuides, clearGuides } from "../align.js";
import { toggleInMulti, isMulti, endMulti } from "../selection.js";

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorHit = new THREE.Vector3();

function aim(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
// World positions are normally refreshed when a frame is drawn; refresh them here too so picking
// is right even before the next frame (just after a rebuild, or while the tab isn't rendering).
function hit3D(clientX, clientY, objs){
  scene.updateMatrixWorld(); camera.updateMatrixWorld();
  aim(clientX, clientY); return ray.intersectObjects(objs, true)[0] || null;
}

// Where the pointer meets a level plane at `height` (0 = the floor), in room coordinates
// (metres from the back-left corner).
function levelPoint(clientX, clientY, height = 0){
  aim(clientX, clientY);
  floorPlane.constant = -height;
  return ray.ray.intersectPlane(floorPlane, floorHit) ? {x:floorHit.x + S.L / 2, y:floorHit.z + S.W / 2} : null;
}

// Bound once to the 3D canvas (it moves between pages with the canvas).
let bound = false;
export function initInteraction(){
  if (bound) return;
  bound = true;
  const cv = renderer.domElement;
  let down = null, drag = null;

  // Press on a piece = drag it (the camera stays still; the plan follows live). Anywhere else = orbit.
  // Shift held = raise/lower it instead (can be pressed or released mid-drag).
  // Capture phase, so this runs before OrbitControls sees the press.
  // Horizontal moves follow the pointer on a level plane at the height where the piece was grabbed.
  const startMode = (e) => {
    if (e.shiftKey){ drag.vertical = true; drag.y0 = e.clientY; drag.z0 = drag.it.z || 0; drag.it.zAuto = false; return; }
    const p = levelPoint(e.clientX, e.clientY, drag.grabY);
    drag.vertical = false; if (p){ drag.dx = p.x - drag.it.x; drag.dy = p.y - drag.it.y; }
  };
  cv.addEventListener("pointerdown", e => {
    down = {x:e.clientX, y:e.clientY};
    ui.keyView = "3d";
    const h = hit3D(e.clientX, e.clientY, itemGroup.children), id = h && h.object.userData.itemId;
    const it = id && findItem(id);
    if (!it) return;
    // Ctrl/Cmd+click: add the piece to the selection, or take it out (Shift is for raising)
    if (e.ctrlKey || e.metaKey){ e.stopImmediatePropagation(); down = null; toggleInMulti(id); update(); return; }
    if (isLocked(it)) return;   // locked: the press orbits as on the floor, and a click still selects it
    drag = {it, moved:false, grabY:h.point.y, riders:startCarry(it)};
    startMode(e);
    if (!drag.vertical && drag.dx === undefined){ drag = null; return; }
    e.stopImmediatePropagation();
    controls.enabled = false; cv.setPointerCapture(e.pointerId); cv.style.cursor = drag.vertical ? "ns-resize" : "grabbing";
    if (!isSelectedItem(id) || isMulti()){ S.sel = {kind:"item", id}; endMulti(); notify(); refreshHelper(); }
  }, {capture:true});

  cv.addEventListener("pointermove", e => {
    if (drag){
      if (e.shiftKey !== drag.vertical){ startMode(e); cv.style.cursor = drag.vertical ? "ns-resize" : "grabbing"; }
      if (drag.vertical){
        // pointer pixels -> metres at the piece's distance from the camera
        const r = cv.getBoundingClientRect(), o = new THREE.Vector3(drag.it.x - S.L / 2, drag.it.z || 0, drag.it.y - S.W / 2);
        const mpp = 2 * camera.position.distanceTo(o) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / r.height;
        drag.it.z = drag.z0 + (drag.y0 - e.clientY) * mpp;
      } else {
        const p = levelPoint(e.clientX, e.clientY, drag.grabY); if (!p) return;
        drag.it.x = snap(p.x - drag.dx); drag.it.y = snap(p.y - drag.dy);
        if (!e.altKey) snapToGuides(drag.it, drag.riders);   // line up with other pieces (Alt: place freely)
      }
      clampItem(drag.it);
      carry(drag.it, drag.riders);   // things on it come along; it lands on whatever is below
      if (drag.vertical) clearGuides(); else showGuides(drag.it, drag.riders);
      drag.moved = true; syncAll(); notify();   // the plan and the height readout follow live
      return;
    }
    if (e.buttons) return; // orbiting
    const h = hit3D(e.clientX, e.clientY, itemGroup.children);
    const over = h && h.object.userData.itemId;
    cv.style.cursor = over ? (isLocked(findItem(over)) ? "pointer" : "grab") : "";
  });

  const endDrag = () => {
    if (!drag) return false;
    const moved = drag.moved; drag = null; clearGuides();
    controls.enabled = nav.mode !== "walk"; cv.style.cursor = "grab";
    if (moved){ notify(); saveRoom(); }
    return true;
  };
  cv.addEventListener("pointercancel", () => { endDrag(); down = null; });

  cv.addEventListener("pointerup", e => {
    if (endDrag()){ down = null; return; }   // a press on a piece is a move (or a select), never a click-through
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5){ down = null; return; } // that was an orbit
    down = null;
    const h = hit3D(e.clientX, e.clientY, [...itemGroup.children, ...pickables]);
    // Ctrl/Cmd+click on a window or door: add it to the selection, to align pieces with
    if (h && h.object.userData.kind === "opening" && (e.ctrlKey || e.metaKey)){ toggleInMulti(h.object.userData.id, "opening"); update(); return; }
    endMulti();
    if (!h) S.sel = null;
    else if (h.object.userData.itemId) S.sel = {kind:"item", id:h.object.userData.itemId};
    else if (h.object.userData.kind === "opening") S.sel = {kind:"opening", id:h.object.userData.id};
    else if (h.object.userData.kind === "wall") S.sel = {kind:"wall", id:h.object.userData.id};
    else S.sel = {kind:"floor"};
    update();
  });

  cv.addEventListener("dblclick", e => {
    const h = hit3D(e.clientX, e.clientY, itemGroup.children);
    if (h && h.object.userData.itemId){ S.sel = {kind:"item", id:h.object.userData.itemId}; endMulti(); rotateSel(); }
  });
}

// A library entry dropped on the 3D view at (clientX, clientY): onto a piece, a wall or the floor.
export function dropIn3D(clientX, clientY, payload){
  if (payload.startsWith("furn:")){
    const hi = hit3D(clientX, clientY, itemGroup.children), id = hi && hi.object.userData.itemId;
    // onto a piece: stacks on top if it fits there, otherwise swaps (see applyPayload)
    if (id) return applyPayload(payload, {kind:"item", id, x:hi.point.x + S.L / 2, y:hi.point.z + S.W / 2});
  }
  const h = hit3D(clientX, clientY, pickables);
  if (!h) return applyPayload(payload, null);
  const p = {x:h.point.x + S.L / 2, y:h.point.z + S.W / 2};   // room coordinates of the drop
  if (payload.startsWith("open:")){
    // onto the wall that was hit (or the nearest wall when dropped on the floor), centred under the pointer
    const at = nearestWallAny(p.x, p.y);
    return applyPayload(payload, {kind:"wall", id:at.wall, along:at.along});
  }
  if (payload.startsWith("furn:")) return applyPayload(payload, {kind:"point", ...p});
  if (h.object.userData.kind === "wall") return applyPayload(payload, {kind:"wall", id:h.object.userData.id});
  if (h.object.userData.kind === "opening") return applyPayload(payload, {kind:"wall", id:h.object.userData.wall});
  applyPayload(payload, {kind:"floor"});
}
