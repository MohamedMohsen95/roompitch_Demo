// Mouse/touch in the 3D view: select, drag pieces across the floor, double-click to rotate,
// and drop library entries onto the floor, a wall or a piece.
import * as THREE from "three";
import { S, clampItem, findItem, isSelectedItem } from "../state.js";
import { FU } from "../catalog.js";
import { nearestWallAny } from "../openings.js";
import { snap } from "../utils.js";
import { update } from "../app.js";
import { applyPayload } from "../library.js";
import { renderInspect, rotateSel } from "../inspector.js";
import { renderPlan } from "../plan.js";
import { renderEst } from "../estimate.js";
import { host, renderer, camera, controls, itemGroup, pickables } from "./scene.js";
import { syncItem, refreshHelper } from "./items.js";

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorHit = new THREE.Vector3();

function aim(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function hit3D(clientX, clientY, objs){ aim(clientX, clientY); return ray.intersectObjects(objs, true)[0] || null; }

// Where the pointer meets the floor, in room coordinates (metres from the north-west corner).
function floorPoint(clientX, clientY){
  aim(clientX, clientY);
  return ray.ray.intersectPlane(floorPlane, floorHit) ? {x:floorHit.x + S.L / 2, y:floorHit.z + S.W / 2} : null;
}

export function initInteraction(){
  const cv = renderer.domElement;
  let down = null, drag = null;

  // Press on a piece = drag it (the camera stays still; the plan follows live). Anywhere else = orbit.
  // Capture phase, so this runs before OrbitControls sees the press.
  cv.addEventListener("pointerdown", e => {
    down = {x:e.clientX, y:e.clientY};
    const h = hit3D(e.clientX, e.clientY, itemGroup.children), id = h && h.object.userData.itemId;
    const it = id && findItem(id), p = it && floorPoint(e.clientX, e.clientY);
    if (!p) return;
    drag = {it, dx:p.x - it.x, dy:p.y - it.y, moved:false};
    e.stopImmediatePropagation();
    controls.enabled = false; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing";
    if (!isSelectedItem(id)){ S.sel = {kind:"item", id}; renderInspect(); renderPlan(); refreshHelper(); }
  }, {capture:true});

  cv.addEventListener("pointermove", e => {
    if (drag){
      const p = floorPoint(e.clientX, e.clientY); if (!p) return;
      drag.it.x = snap(p.x - drag.dx); drag.it.y = snap(p.y - drag.dy); clampItem(drag.it);
      drag.moved = true; syncItem(drag.it); renderPlan();
      return;
    }
    if (e.buttons) return; // orbiting
    const h = hit3D(e.clientX, e.clientY, itemGroup.children);
    cv.style.cursor = h && h.object.userData.itemId ? "grab" : "";
  });

  const endDrag = () => {
    if (!drag) return false;
    const moved = drag.moved; drag = null;
    controls.enabled = true; cv.style.cursor = "grab";
    if (moved){ renderEst(); renderInspect(); }
    return true;
  };
  cv.addEventListener("pointercancel", () => { endDrag(); down = null; });

  cv.addEventListener("pointerup", e => {
    if (endDrag()){ down = null; return; }   // a press on a piece is a move (or a select), never a click-through
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5){ down = null; return; } // that was an orbit
    down = null;
    const h = hit3D(e.clientX, e.clientY, [...itemGroup.children, ...pickables]);
    if (!h) S.sel = null;
    else if (h.object.userData.itemId) S.sel = {kind:"item", id:h.object.userData.itemId};
    else if (h.object.userData.kind === "opening") S.sel = {kind:"opening", id:h.object.userData.id};
    else if (h.object.userData.kind === "wall") S.sel = {kind:"wall", id:h.object.userData.id};
    else S.sel = {kind:"floor"};
    update();
  });

  cv.addEventListener("dblclick", e => {
    const h = hit3D(e.clientX, e.clientY, itemGroup.children);
    if (h && h.object.userData.itemId){ S.sel = {kind:"item", id:h.object.userData.itemId}; rotateSel(); }
  });

  // HTML5 drop from the library
  host.addEventListener("dragover", e => { e.preventDefault(); host.parentElement.classList.add("drop-on"); });
  host.addEventListener("dragleave", () => host.parentElement.classList.remove("drop-on"));
  host.addEventListener("drop", e => {
    e.preventDefault(); host.parentElement.classList.remove("drop-on");
    const payload = e.dataTransfer.getData("text/plain"); if (!payload) return;
    if (payload.startsWith("furn:")){
      const hi = hit3D(e.clientX, e.clientY, itemGroup.children), id = hi && hi.object.userData.itemId;
      if (id && FU[findItem(id).type].id !== "rug") return applyPayload(payload, {kind:"item", id}); // swap
    }
    const h = hit3D(e.clientX, e.clientY, pickables);
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
  });
}
