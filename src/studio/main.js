// RoomPitch Room Studio: floor plan + 3D room + live estimate + AI render.
//
//   catalog.js      finishes, furniture, AI wording          state.js     the room + geometry helpers
//   openings.js     windows & doors: types, placement rules
//   library.js      library panel, applying picks/drops      inspector.js selection actions, keyboard
//   plan.js         2D SVG plan                              estimate.js  live estimate
//   three/scene.js  renderer, camera, lights, HDRI           three/room.js   floor, walls, openings
//   three/items.js  furniture in 3D                          three/models.js glTF loading
//   three/interaction.js  picking, dragging, drops in 3D     render-ai.js    photoreal render dialog
//   three/lighting.js     lighting moods (HDRI, sun tint, exposure) and the picker
//   three/sun.js          sun position from time of day, orientation, season; the Sun bar
//   app.js          update(): redraw after any change
import { S, clampItem } from "./state.js";
import { addModels } from "./catalog.js";
import { refitAll } from "./openings.js";
import { $, clamp } from "./utils.js";
import { update, rebuildAll } from "./app.js";
import { renderLib, initLibrary, flashHint } from "./library.js";
import { initKeyboard } from "./inspector.js";
import { initPlan, renderPlan } from "./plan.js";
import { initScene, setCam, startLoop, camera, roomGroup, itemGroup } from "./three/scene.js";
import { cullForCamera } from "./three/room.js";
import { initSunControls } from "./three/sun.js";
import { initLighting } from "./three/lighting.js";
import { updateHelper } from "./three/items.js";
import { initInteraction } from "./three/interaction.js";
import { initRenderDialog } from "./render-ai.js";

function initDimensions(){
  for (const id of ["dimL", "dimW", "dimH"]){
    $("#" + id).addEventListener("change", () => {
      S.L = clamp(parseFloat($("#dimL").value) || 5, 2, 12);
      S.W = clamp(parseFloat($("#dimW").value) || 4, 2, 12);
      S.H = clamp(parseFloat($("#dimH").value) || 2.8, 2.2, 5);
      $("#dimL").value = S.L; $("#dimW").value = S.W; $("#dimH").value = S.H;
      S.items.forEach(clampItem);
      const removed = refitAll();
      rebuildAll(); setCam("corner");
      if (removed) flashHint(removed === 1
        ? "A window or door no longer fit the smaller wall and was removed."
        : `${removed} windows or doors no longer fit the smaller walls and were removed.`);
    });
  }
}

// Add every model in public/models to the furniture library (real size from the file, placeholder price).
async function loadModelCatalog(){
  try {
    const r = await fetch("/api/models");
    if (!r.ok) return;
    const {models = []} = await r.json();
    if (addModels(models)) renderLib();
  } catch { /* opened without the server: keep the built-in catalog */ }
}

initScene(); initLighting();
initLibrary(); initKeyboard(); initPlan(); initInteraction(); initDimensions(); initRenderDialog();
renderLib(); update(); setCam("corner");
initSunControls(renderPlan);
// Dev-only handle for debugging in the browser console (removed from production builds).
if (import.meta.env.DEV) window.__studio = {S, get camera(){ return camera; }, roomGroup, itemGroup};
startLoop(() => { updateHelper(); cullForCamera(camera); });
loadModelCatalog();
