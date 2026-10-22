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
import { renderLib, initLibrary, flashHint } from "./library.js";
import { initKeyboard } from "./inspector.js";
import { initPlan } from "./plan.js";
import { initScene, setCam, startLoop } from "./three/scene.js";
import { updateHelper } from "./three/items.js";
import { initInteraction } from "./three/interaction.js";
import { initRenderDialog } from "./render-ai.js";
import { applyStatic, setLang, getLang, onLangChange, t } from "./i18n.js";
import { initDialogs, relabelDialogs } from "./dialogs.js";
import { initProposal } from "./proposal.js";
import { S, applyRoom } from "./state.js";
import { loadRoom, restoreRoom, setSaving } from "./room-store.js";
import { initSetup, showSetup, showStudio, relabelSetup } from "./setup/screen.js";
import { roomToDraft } from "./setup/draft.js";
import { initPhotos } from "./setup/photos.js";
import { savePhotos, loadPhotos } from "./photo-store.js";

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
document.querySelectorAll(".langbtn").forEach(b => { b.onclick = () => setLang(getLang() === "ar" ? "en" : "ar"); });
onLangChange(() => { renderLib(); update(); relabelDialogs(); relabelSetup(); });

initScene();
initLibrary(); initKeyboard(); initPlan(); initInteraction(); initRenderDialog();
initDialogs(); initProposal();
renderLib();

// Screen 1 first. Starting or continuing a room switches to the studio and turns saving on.
function enterStudio(){ setSaving(true); showStudio(); rebuildAll(); setCam("corner"); }
const catalogReady = loadModelCatalog();
initPhotos();
initSetup({
  onStart:(room, {keepDesign, draft}) => { applyRoom(room, {keepDesign}); savePhotos(draft.photos); enterStudio(); },
  // Wait for the 3D model pieces (at most 5 s) so saved model furniture is recognised.
  onContinue:async () => {
    await Promise.race([catalogReady, new Promise(r => setTimeout(r, 5000))]);
    const saved = loadRoom(), r = saved ? restoreRoom(saved) : {dropped:0};
    enterStudio();
    if (r.dropped) flashHint(t("droppedPieces", {n:r.dropped}), 8000);
  }
});
$("#roomSetupBtn").onclick = async () => {
  setSaving(false);
  S.sel = null; S.replacing = null;
  const draft = roomToDraft({form:S.form, openings:S.openings, H:S.H});
  draft.photos = await loadPhotos();
  if (draft.photos.length) draft.mode = "photos";
  showSetup({keepDesign:true, draft, canContinue:true});
};
setSaving(false);
update(); setCam("corner");
showSetup({canContinue:Boolean(loadRoom())});
startLoop(updateHelper);
