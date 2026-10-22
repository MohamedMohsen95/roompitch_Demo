// RoomPitch Room Studio: floor plan + 3D room + live estimate + AI render.
//
//   catalog.js      finishes, furniture, AI wording          state.js     the room + geometry helpers
//   library.js      library panel, applying picks/drops      inspector.js selection actions, keyboard
//   plan.js         2D SVG plan                              estimate.js  live estimate
//   three/scene.js  renderer, camera, lights, HDRI           three/room.js   floor, walls, openings
//   three/items.js  furniture in 3D                          three/models.js glTF loading
//   three/interaction.js  picking, dragging, drops in 3D     render-ai.js    photoreal render dialog
//   app.js          update(): redraw after any change
//   i18n.js         English / Arabic text                    settings.js  designer settings + own prices
//   dialogs.js      settings and price list dialogs          proposal.js  PDF proposal (print layout)
import { addModels } from "./catalog.js";
import { $ } from "./utils.js";
import { update, rebuildAll } from "./app.js";
import { renderLib, initLibrary } from "./library.js";
import { initKeyboard } from "./inspector.js";
import { initPlan } from "./plan.js";
import { initScene, setCam, startLoop } from "./three/scene.js";
import { updateHelper } from "./three/items.js";
import { initInteraction } from "./three/interaction.js";
import { initRenderDialog } from "./render-ai.js";
import { applyStatic, setLang, getLang, onLangChange } from "./i18n.js";
import { initDialogs, relabelDialogs } from "./dialogs.js";
import { initProposal } from "./proposal.js";

// Add every model in public/models to the furniture library (real size from the file, placeholder price).
async function loadModelCatalog(){
  try {
    const r = await fetch("/api/models");
    if (!r.ok) return;
    const {models = []} = await r.json();
    if (addModels(models)) renderLib();
  } catch { /* opened without the server: keep the built-in catalog */ }
}

applyStatic();
$("#langBtn").onclick = () => setLang(getLang() === "ar" ? "en" : "ar");
onLangChange(() => { renderLib(); update(); relabelDialogs(); });

initScene();
initLibrary(); initKeyboard(); initPlan(); initInteraction(); initRenderDialog();
initDialogs(); initProposal();
renderLib(); update(); setCam("corner");
startLoop(updateHelper);
loadModelCatalog();
