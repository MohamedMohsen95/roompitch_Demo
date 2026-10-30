// RoomPitch Room Studio: /studio is the "New room" screen with the saved projects, /studio/room the studio
// (plan + 3D room + live estimate + AI render). The browser's back button moves between them.
//
//   state.js        the room (S) + geometry helpers          store.js     notify(): redraw the React panels
//   actions.js      library picks/drops, selection actions    app.js       update(): after any change to the room
//   catalog.js      finishes, furniture, AI wording           openings.js  windows & doors
//   stacking.js     pieces resting on surfaces                estimate.js  the estimate's lines
//   three/          the 3D scene, room, furniture, lighting, sun and picking (one canvas, made once)
//   render-ai.js    the photoreal render request              settings.js  designer settings + own prices
//   room-store.js   saves the room in this browser; cloud-store.js copies each save to Supabase
//   catalog-remote.js  the catalog from Supabase; catalog.js is the fallback
//   ui/             the React interface; ui/setup/ the "New room" screen
import { useCallback, useEffect, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router";
import { addModels, applyCatalog } from "../catalog.js";
import { loadRemoteCatalog } from "../catalog-remote.js";
import { rebuildAll, update } from "../app.js";
import { flashHint } from "../actions.js";
import { notify, ui } from "../store.js";
import { initScene, setCam, startLoop, camera, roomGroup, itemGroup } from "../three/scene.js";
import { cullForCamera } from "../three/room.js";
import { initLighting } from "../three/lighting.js";
import { updateSun } from "../three/sun.js";
import { updateHelper } from "../three/items.js";
import { initInteraction } from "../three/interaction.js";
import { initWalk } from "../three/walk.js";
import { applyStatic, setLang, getLang, t } from "../i18n.js";
import { S, applyRoom } from "../state.js";
import { loadRoom, restoreRoom, setSaving, saveRoom, onSaved, clearRoom } from "../room-store.js";
import { cloudReady, pushRoom, pullRoom, openProject, newProject } from "../cloud-store.js";
import { roomToDraft } from "../setup/draft.js";
import { savePhotos, loadPhotos } from "../photo-store.js";
import css from "../studio.css?inline";
import StudioScreen from "./StudioScreen";
import SetupScreen from "./setup/SetupScreen";
import AccountDialog from "./AccountDialog";
import { useLang } from "./hooks";

// The catalog from Supabase (finishes, furniture, models in the catalog bucket) when it can be reached.
// Otherwise every model in public/models joins the built-in catalog (real size from the file, placeholder price).
async function loadModelCatalog(){
  const remote = await loadRemoteCatalog();
  if (remote?.length){ applyCatalog(remote); rebuildAll(); return; }
  try {
    const r = await fetch("/api/models");
    if (!r.ok) return;
    const {models = []} = await r.json();
    if (addModels(models)) notify();
  } catch { /* opened without the server: keep the built-in catalog */ }
}

// Once per page load: the 3D scene, the catalog, and saving to the cloud.
let catalogReady: Promise<void> | null = null;
let opened = false;   // a room has been opened (or started) since the page loaded
function boot(){
  if (catalogReady) return;
  initScene(); initLighting(); initInteraction(); initWalk();
  startLoop(() => { updateHelper(); cullForCamera(camera); });
  setSaving(false);
  // Every save also goes to Supabase (when keys are set); sign in now so the first save is quick.
  onSaved(pushRoom);
  cloudReady().then((sb: unknown) => { if (sb){ ui.canUpload = true; notify(); } });
  catalogReady = loadModelCatalog();
  // Dev-only handle for debugging in the browser console (removed from production builds).
  if (import.meta.env.DEV) (window as any).__studio = {S, get camera(){ return camera; }, roomGroup, itemGroup};
}

const within = <T,>(p: Promise<T>, ms: number, fallback?: T) => Promise.race([p, new Promise<T | undefined>(r => setTimeout(() => r(fallback), ms))]);

export default function StudioApp(){
  boot();
  const lang = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [projectError, setProjectError] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [canContinue, setCanContinue] = useState(() => Boolean(loadRoom()));

  useEffect(() => { applyStatic(); }, [lang]);
  // A room saved since (or a project deleted) changes whether "Continue last room" shows.
  useEffect(() => { setCanContinue(Boolean(loadRoom())); }, [location.key]);
  const toggleLang = useCallback(() => setLang(getLang() === "ar" ? "en" : "ar"), []);

  // Open a saved room once the 3D model pieces are loaded (at most 5 s), so saved model furniture is recognised.
  const openSaved = useCallback(async (saved: any) => {
    await within(catalogReady!, 5000);
    const r = saved ? restoreRoom(saved) : {dropped:0};
    opened = true;
    navigate("/studio/room");
    if (r.dropped) flashHint(t("droppedPieces", {n:r.dropped}), 8000);
  }, [navigate]);
  // The newer of this browser's room and the current cloud project's (at most 5 s) wins.
  const continueLast = useCallback(async () => {
    const cloud: any = await within(pullRoom(), 5000, null);
    const local = loadRoom();
    await openSaved(cloud && (cloud.savedAt || 0) > (local?.savedAt || 0) ? cloud : local);
  }, [openSaved]);

  const openProjectRow = async (p: any) => {
    if (p.current) return continueLast();
    setProjectError(null);
    const room = await within(openProject(p.id), 8000, null);
    if (!room){ setProjectError(t("projOpenFailed")); return; }
    savePhotos([]);   // the photos belonged to the room this browser had before
    await openSaved(room);
  };

  // A new room (not the same room's setup again) is a new cloud project.
  const startRoom = (room: any, {keepDesign, draft}: {keepDesign: boolean, draft: any}) => {
    if (!keepDesign) newProject(t("projNewName", {date:new Date().toLocaleDateString(getLang(), {day:"numeric", month:"short"})}));
    applyRoom(room, {keepDesign}); savePhotos(draft.photos);
    opened = true;
    navigate("/studio/room");
  };

  // "Room setup": back to the form with this room (furniture and finishes are kept).
  const roomSetup = async () => {
    const draft = roomToDraft({form:S.form, openings:S.openings, H:S.H});
    draft.photos = await loadPhotos();
    if (draft.photos.length) draft.mode = "photos";
    navigate("/studio", {state:{draft}});
  };

  return (<>
    <style>{css}</style>
    <Routes>
      <Route index element={
        <SetupScreen key={location.key} initialDraft={(location.state as any)?.draft || null} canContinue={canContinue}
          onStart={startRoom} onContinue={continueLast} onOpenProject={openProjectRow}
          onCurrentDeleted={() => { clearRoom(); setCanContinue(false); }} projectError={projectError}
          onAccount={() => setAccountOpen(true)} onLang={toggleLang}/>
      }/>
      <Route path="room" element={<RoomRoute onProjects={() => navigate("/studio")} onRoomSetup={roomSetup} onLang={toggleLang} continueLast={continueLast}/>}/>
    </Routes>
    <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)}/>
  </>);
}

// /studio/room. Opened straight from the address bar (a reload, a link, signing in), it first brings back
// the last room; with none saved it goes to the New room screen.
function RoomRoute({onProjects, onRoomSetup, onLang, continueLast}: {onProjects: () => void, onRoomSetup: () => void, onLang: () => void, continueLast: () => Promise<void>}){
  const navigate = useNavigate();
  const [ready, setReady] = useState(opened);
  useEffect(() => {
    if (ready) return;
    // Dev only: /studio/room?sample opens the built-in sample room (for screenshots in a fresh browser).
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("sample")){ setReady(true); return; }
    if (!loadRoom()){ navigate("/studio", {replace:true}); return; }
    continueLast().then(() => setReady(true));
  }, []);
  // Saving is on while the studio shows, so an untouched sample room never becomes "the last room".
  useEffect(() => {
    if (!ready) return;
    setSaving(true); updateSun(); rebuildAll(); setCam("corner", true); saveRoom();
    return () => { setSaving(false); S.sel = null; S.replacing = null; ui.inspectMsg = null; update(); };
  }, [ready]);
  if (!ready) return null;
  return <StudioScreen onProjects={onProjects} onRoomSetup={onRoomSetup} onLang={onLang}/>;
}
