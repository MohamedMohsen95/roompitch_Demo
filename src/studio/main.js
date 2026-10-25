// RoomPitch Room Studio: floor plan + 3D room + live estimate + AI render.
//
//   catalog.js      finishes, furniture, AI wording          state.js     the room + geometry helpers
//   openings.js     windows & doors: presets, placement      stacking.js  pieces resting on surfaces
//   library.js      library panel, applying picks/drops      inspector.js selection actions, keyboard
//   plan.js         2D SVG plan                              estimate.js  live estimate
//   three/scene.js  renderer, camera, lights                 three/room.js   floor, solid walls, openings
//   three/items.js  furniture in 3D                          three/models.js glTF loading
//   three/interaction.js  picking, dragging, drops in 3D     render-ai.js    photoreal render dialog
//   three/lighting.js     lighting moods (HDRI, sun tint, exposure) and the picker
//   three/sun.js          sun position from time of day, orientation, season; the Sun bar
//   app.js          update(): redraw after any change
//   i18n.js         English / Arabic text                    settings.js  designer settings + own prices
//   dialogs.js      settings and price list dialogs          proposal.js  PDF proposal (print layout)
//   setup/          screen 1, "New room" (by hand or from photos); room-store.js saves the room
//   cloud-store.js  copies each save to Supabase (supabase.js), brings it back on Continue;
//                   setup/projects.js lists the saved rooms on screen 1
//   catalog-remote.js  the catalog from Supabase (catalog_items + models in Storage); catalog.js is the fallback
import { addModels, applyCatalog } from "./catalog.js";
import { loadRemoteCatalog } from "./catalog-remote.js";
import { $ } from "./utils.js";
import { update, rebuildAll } from "./app.js";
import { renderLib, initLibrary, flashHint, setUploadAvailable } from "./library.js";
import { initKeyboard } from "./inspector.js";
import { initEstToggle, relabelEst } from "./estimate.js";
import { initPlan, renderPlan } from "./plan.js";
import { initScene, setCam, startLoop, camera, roomGroup, itemGroup } from "./three/scene.js";
import { cullForCamera } from "./three/room.js";
import { initLighting, relabelLighting } from "./three/lighting.js";
import { initSunControls } from "./three/sun.js";
import { updateHelper } from "./three/items.js";
import { initInteraction } from "./three/interaction.js";
import { initRenderDialog } from "./render-ai.js";
import { applyStatic, setLang, getLang, onLangChange, t } from "./i18n.js";
import { initDialogs, relabelDialogs } from "./dialogs.js";
import { initProposal } from "./proposal.js";
import { S, applyRoom } from "./state.js";
import { loadRoom, restoreRoom, setSaving, saveRoom, onSaved, clearRoom } from "./room-store.js";
import { cloudReady, pushRoom, pullRoom, openProject, newProject } from "./cloud-store.js";
import { initSetup, showSetup, showStudio, relabelSetup } from "./setup/screen.js";
import { initProjects, refreshProjects, relabelProjects } from "./setup/projects.js";
import { roomToDraft } from "./setup/draft.js";
import { initPhotos } from "./setup/photos.js";
import { savePhotos, loadPhotos } from "./photo-store.js";

// The catalog from Supabase (finishes, furniture, models in the catalog bucket) when it can be reached.
// Otherwise every model in public/models joins the built-in catalog (real size from the file, placeholder price).
async function loadModelCatalog(){
  const remote = await loadRemoteCatalog();
  if (remote?.length){
    applyCatalog(remote); renderLib(); rebuildAll();
    return;
  }
  try {
    const r = await fetch("/api/models");
    if (!r.ok) return;
    const {models = []} = await r.json();
    if (addModels(models)) renderLib();
  } catch { /* opened without the server: keep the built-in catalog */ }
}

applyStatic();
document.querySelectorAll(".langbtn").forEach(b => { b.onclick = () => setLang(getLang() === "ar" ? "en" : "ar"); });

initScene(); initLighting();
initLibrary(); initKeyboard(); initPlan(); initInteraction(); initRenderDialog();
initDialogs(); initProposal(); initEstToggle();
// Sun bar: the plan's north arrow follows it, and the choice is saved with the room.
const refreshSun = initSunControls(() => { renderPlan(); saveRoom(); });
onLangChange(() => { renderLib(); update(); relabelDialogs(); relabelSetup(); relabelProjects(); relabelLighting(); refreshSun(); relabelEst(); });
renderLib();

// Screen 1 first. Starting or continuing a room switches to the studio and turns saving on.
function enterStudio(){ setSaving(true); showStudio(); refreshSun(); rebuildAll(); setCam("corner"); }
const catalogReady = loadModelCatalog();
const within = (p, ms, fallback) => Promise.race([p, new Promise(r => setTimeout(() => r(fallback), ms))]);
// Open a saved room once the 3D model pieces are loaded (at most 5 s), so saved model furniture is recognised.
async function openSaved(saved){
  await within(catalogReady, 5000);
  const r = saved ? restoreRoom(saved) : {dropped:0};
  enterStudio();
  saveRoom();   // this browser and the cloud now hold the room that was opened
  if (r.dropped) flashHint(t("droppedPieces", {n:r.dropped}), 8000);
}
// The newer of this browser's room and the current cloud project's (at most 5 s) wins.
async function continueLast(){
  const cloud = await within(pullRoom(), 5000, null);
  const local = loadRoom();
  await openSaved(cloud && (cloud.savedAt || 0) > (local?.savedAt || 0) ? cloud : local);
}
initPhotos();
initProjects({
  open:async (p) => {
    if (p.current) return continueLast();
    $("#projErr").hidden = true;
    const room = await within(openProject(p.id), 8000, null);
    if (!room){ $("#projErr").textContent = t("projOpenFailed"); $("#projErr").hidden = false; return; }
    savePhotos([]);   // the photos belonged to the room this browser had before
    await openSaved(room);
  },
  onCurrentDeleted:() => { clearRoom(); $("#continueLast").hidden = true; }
});
initSetup({
  // A new room (not the same room's setup again) is a new cloud project.
  onStart:(room, {keepDesign, draft}) => {
    if (!keepDesign) newProject(t("projNewName", {date:new Date().toLocaleDateString(getLang(), {day:"numeric", month:"short"})}));
    applyRoom(room, {keepDesign}); savePhotos(draft.photos); enterStudio();
  },
  onContinue:continueLast,
  onChoose:refreshProjects
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
// Every save also goes to Supabase (when keys are set); sign in now so the first save is quick.
onSaved(pushRoom);
cloudReady().then(sb => { if (sb) setUploadAvailable(true); });
update(); setCam("corner");
showSetup({canContinue:Boolean(loadRoom())});
// Dev-only handle for debugging in the browser console (removed from production builds).
if (import.meta.env.DEV) window.__studio = {S, get camera(){ return camera; }, roomGroup, itemGroup};
startLoop(() => { updateHelper(); cullForCamera(camera); });
