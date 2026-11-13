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
//   templates.js    rooms anyone can start from (admins save them)
//   catalog-remote.js  the catalog from Supabase; catalog.js is the fallback
//   ui/             the React interface; ui/setup/ the "New room" screen
//   plan/           a flat read from a floor plan (/studio/plan, /studio/flat); ui/plan/ its screens
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
import { loadRoom, restoreRoom, setSaving, saveRoom, onSaved, clearRoom, redirectSaves } from "../room-store.js";
import { applyTheme } from "../theme.js";
import { cloudReady, pushRoom, pushFlat, pullRoom, openProject, newProject, planImageUrl, flatInCloud, forgetOthersRoom } from "../cloud-store.js";
import { getTemplate } from "../templates.js";
import { loadFlat, saveFlat, clearFlat, onFlatSaved, setCurrentSpace, currentSpace, openSpace, designSaved } from "../plan/flat-store.js";
import type { Flat } from "../plan/flat";
import { setContext, cullContext } from "../three/context.js";
import { roomToDraft } from "../setup/draft.js";
import { savePhotos, loadPhotos } from "../photo-store.js";
import css from "../studio.css?inline";
import StudioScreen from "./StudioScreen";
import SetupScreen from "./setup/SetupScreen";
import AccountDialog from "./AccountDialog";
import PlanImport from "./plan/PlanImport";
import FlatScreen from "./plan/FlatScreen";
import { loadImage } from "./plan/image";
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
  applyTheme();   // before the first paint and before the 3D view reads its background colour
  if (catalogReady) return;
  initScene(); initLighting(); initInteraction(); initWalk();
  startLoop(() => { updateHelper(); cullForCamera(camera); cullContext(camera); });
  setSaving(false);
  // Every save also goes to Supabase (when keys are set); sign in now so the first save is quick.
  onSaved(pushRoom);
  onFlatSaved(pushFlat);
  cloudReady().then((sb: unknown) => { if (sb){ ui.canUpload = true; notify(); } });
  catalogReady = loadModelCatalog();
  // Dev-only handle for debugging in the browser console (removed from production builds).
  if (import.meta.env.DEV) (window as any).__studio = {S, get camera(){ return camera; }, roomGroup, itemGroup};
}

// Leaving a flat's space for a single room: saves go to the single room again, no grey neighbours.
function leaveFlatSpace(){ redirectSaves(null); setCurrentSpace(null); setContext([]); }

// A flat opened from the cloud keeps its plan image in storage: bring a copy into this browser.
async function withImage(flat: Flat): Promise<Flat>{
  if (flat.image.dataUrl || !flat.image.path) return flat;
  const url = await planImageUrl(flat.image.path);
  if (!url) return flat;
  try { const img = await loadImage(url, 2400); return {...flat, image:{...flat.image, dataUrl:img.dataUrl}}; }
  catch { return flat; }
}

const within = <T,>(p: Promise<T>, ms: number, fallback?: T) => Promise.race([p, new Promise<T | undefined>(r => setTimeout(() => r(fallback), ms))]);

export default function StudioApp(){
  boot();
  const lang = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [projectError, setProjectError] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSignUp, setAccountSignUp] = useState(false);
  // The landing page's Sign in / Sign up / account links: /studio?auth=signin|signup|account opens the dialog.
  // The address loses the ?auth first, so the reload after signing in doesn't open it again.
  useEffect(() => {
    const auth = new URLSearchParams(location.search).get("auth");
    if (!auth) return;
    navigate(location.pathname, {replace:true, state:location.state});
    setAccountSignUp(auth === "signup"); setAccountOpen(true);
  }, [location.search, location.pathname, location.state, navigate]);
  const [canContinue, setCanContinue] = useState(() => Boolean(loadRoom()));
  const [canContinueFlat, setCanContinueFlat] = useState(() => Boolean(loadFlat()));

  useEffect(() => { applyStatic(); }, [lang]);
  // A room saved since (or a project deleted) changes whether "Continue last room" shows.
  useEffect(() => { setCanContinue(Boolean(loadRoom())); setCanContinueFlat(Boolean(loadFlat())); }, [location.key]);
  // A room or flat another account left in this browser isn't this guest's to continue.
  useEffect(() => { forgetOthersRoom().then(gone => { if (gone){ setCanContinue(false); setCanContinueFlat(false); } }); }, []);
  const toggleLang = useCallback(() => setLang(getLang() === "ar" ? "en" : "ar"), []);

  // Open a saved room once the 3D model pieces are loaded (at most 5 s), so saved model furniture is recognised.
  const openSaved = useCallback(async (saved: any) => {
    leaveFlatSpace();
    await within(catalogReady!, 5000);
    const r = saved ? restoreRoom(saved) : {dropped:0};
    opened = true;
    navigate("/studio/room");
    if (r.dropped) flashHint(t("droppedPieces", {n:r.dropped}), 8000);
  }, [navigate]);
  // The newer of this browser's room and the current cloud project's (at most 5 s) wins.
  // With none (another account's room was just forgotten), back to the New room screen. Resolves whether it opened one.
  const continueLast = useCallback(async (): Promise<boolean> => {
    await within(forgetOthersRoom(), 5000);
    const cloud: any = await within(pullRoom(), 5000, null);
    const local = loadRoom();
    const room = cloud && (cloud.savedAt || 0) > (local?.savedAt || 0) ? cloud : local;
    if (!room){ setCanContinue(false); navigate("/studio", {replace:true}); return false; }
    await openSaved(room);
    return true;
  }, [openSaved, navigate]);

  // A space of the flat in the studio: its saved design (or an empty room), shown alone, and every save
  // going back into the flat. A flat another account left here is forgotten first. Resolves whether it opened.
  const openFlatSpace = useCallback(async (id: string): Promise<boolean> => {
    await within(forgetOthersRoom(), 5000);
    const flat = loadFlat();
    if (!flat || !flat.spaces.some(s => s.id === id)){ setCanContinueFlat(false); navigate("/studio", {replace:true}); return false; }
    const r = openSpace(flat, id);
    saveFlat(r.flat); setCurrentSpace(id);
    await within(catalogReady!, 5000);
    const res = r.saved ? restoreRoom(r.saved) : (applyRoom(r.room as any, {keepDesign:false}), {dropped:0});
    setContext([]);
    redirectSaves((data: any) => { const f = loadFlat(); if (f && f.spaces.some(s => s.id === id)) saveFlat(designSaved(f, id, data)); });
    opened = true;
    navigate("/studio/room");
    if (res.dropped) flashHint(t("droppedPieces", {n:res.dropped}), 8000);
    return true;
  }, [navigate]);

  const openProjectRow = async (p: any) => {
    if (p.current && p.kind !== "flat"){ await continueLast(); return; }
    setProjectError(null);
    const got = await within(openProject(p.id), 8000, null);
    if (!got){ setProjectError(t("projOpenFailed")); return; }
    if (got.kind === "flat"){
      leaveFlatSpace();
      saveFlat(await withImage(got.data));
      navigate("/studio/flat");
      return;
    }
    savePhotos([]);   // the photos belonged to the room this browser had before
    await openSaved(got.data);
  };

  // A template: a copy of it becomes a new project, named after it, and opens in the studio.
  const useTemplate = async (c: any, name: string) => {
    const room = await within(getTemplate(c.id), 8000, null);
    if (!room) return false;
    newProject(name); savePhotos([]);
    await openSaved(room);
    return true;
  };

  // A new room (not the same room's setup again) is a new cloud project.
  const startRoom = (room: any, {keepDesign, draft}: {keepDesign: boolean, draft: any}) => {
    leaveFlatSpace();
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

  // The plan checked: a new flat is a new cloud project; one space goes straight to the studio.
  const planDone = (flat: Flat, isNew: boolean) => {
    leaveFlatSpace();
    if (isNew) newProject(t("flatProjName", {date:new Date().toLocaleDateString(getLang(), {day:"numeric", month:"short"})}), "flat");
    saveFlat(flat);
    if (flat.spaces.length === 1) openFlatSpace(flat.spaces[0].id);
    else navigate("/studio/flat");
  };

  return (<>
    <style>{css}</style>
    <Routes>
      <Route index element={
        <SetupScreen key={location.key} initialDraft={(location.state as any)?.draft || null} canContinue={canContinue}
          onStart={startRoom} onContinue={continueLast} onOpenProject={openProjectRow} onUseTemplate={useTemplate}
          onCurrentDeleted={kind => { if (kind === "flat"){ leaveFlatSpace(); clearFlat(); setCanContinueFlat(false); } else { clearRoom(); setCanContinue(false); } }}
          projectError={projectError} onAccount={() => { setAccountSignUp(false); setAccountOpen(true); }} onLang={toggleLang}
          showTemplates={Boolean((location.state as any)?.templates)}
          onPlan={() => {
            // Only one flat lives in this browser: don't silently replace designs that aren't in the account.
            const f = loadFlat();
            if (f && f.spaces.some(s => s.design) && !flatInCloud() && !window.confirm(t("replaceFlatSure"))) return;
            navigate("/studio/plan");
          }} canContinueFlat={canContinueFlat} onContinueFlat={() => navigate("/studio/flat")}/>
      }/>
      <Route path="plan" element={
        <PlanRoute key={location.key} editing={Boolean((location.state as any)?.edit)} onDone={planDone}
          onCancel={() => navigate((location.state as any)?.edit ? "/studio/flat" : "/studio")}
          onAccount={() => { setAccountSignUp(false); setAccountOpen(true); }} onLang={toggleLang}/>
      }/>
      <Route path="flat" element={
        <FlatRoute onOpenSpace={openFlatSpace} onEditPlan={() => navigate("/studio/plan", {state:{edit:true}})}
          onBack={() => navigate("/studio")} onAccount={() => { setAccountSignUp(false); setAccountOpen(true); }} onLang={toggleLang}/>
      }/>
      <Route path="room" element={<RoomRoute key={currentSpace() || "room"} onProjects={() => navigate("/studio")} onTemplates={() => navigate("/studio", {state:{templates:true}})} onRoomSetup={roomSetup} onLang={toggleLang}
        continueLast={continueLast} openFlatSpace={openFlatSpace} onFlat={() => navigate("/studio/flat")}/>}/>
    </Routes>
    <AccountDialog open={accountOpen} signUp={accountSignUp} onClose={() => setAccountOpen(false)}/>
  </>);
}

// /studio/room. Opened straight from the address bar (a reload, a link, signing in), it first brings back
// the last room; with none saved it goes to the New room screen.
type RoomRouteProps = {onProjects: () => void, onTemplates: () => void, onRoomSetup: () => void, onLang: () => void, continueLast: () => Promise<boolean>,
  openFlatSpace: (id: string) => Promise<boolean>, onFlat: () => void};
function RoomRoute({onProjects, onTemplates, onRoomSetup, onLang, continueLast, openFlatSpace, onFlat}: RoomRouteProps){
  const navigate = useNavigate();
  const [ready, setReady] = useState(opened);
  useEffect(() => {
    if (ready) return;
    // Dev only: /studio/room?sample opens the built-in sample room (for screenshots in a fresh browser).
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("sample")){ setReady(true); return; }
    const space = currentSpace(), flat = loadFlat();
    if (space && flat?.spaces.some(s => s.id === space)){ openFlatSpace(space).then(ok => { if (ok) setReady(true); }); return; }
    if (!loadRoom()){ navigate("/studio", {replace:true}); return; }
    // Only once a room is open: with none, continueLast has gone back to /studio, a navigation React Router
    // makes in a transition, so becoming ready here would still draw the studio first, on an empty room it saves.
    continueLast().then(ok => { if (ok) setReady(true); });
  }, []);
  // Saving is on while the studio shows, so an untouched sample room never becomes "the last room".
  useEffect(() => {
    if (!ready) return;
    setSaving(true); updateSun(); rebuildAll(); setCam("corner", true); saveRoom();
    return () => { setSaving(false); S.sel = null; S.replacing = null; ui.inspectMsg = null; update(); };
  }, [ready]);
  if (!ready) return null;
  const space = currentSpace(), flat = space ? loadFlat() : null;
  const flatNav = space && flat?.spaces.some(s => s.id === space) ? {flat, spaceId:space, onOpen:(id: string) => { openFlatSpace(id); }, onFlat} : null;
  return <StudioScreen onProjects={onProjects} onTemplates={onTemplates} onRoomSetup={onRoomSetup} onLang={onLang} flatNav={flatNav}/>;
}

// /studio/plan: a new floor plan, or "Edit plan" of the current flat (designs of spaces that are kept stay).
function PlanRoute({editing, onDone, onCancel, onAccount, onLang}: {editing: boolean, onDone: (f: Flat, isNew: boolean) => void,
  onCancel: () => void, onAccount: () => void, onLang: () => void}){
  const [initial] = useState(() => editing ? loadFlat() : null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (initial && !initial.image.dataUrl && initial.image.path) planImageUrl(initial.image.path).then((u: string | null) => setUrl(u));
  }, []);
  return <PlanImport initialFlat={initial} imageUrl={url} onDone={onDone} onCancel={onCancel} onAccount={onAccount} onLang={onLang}/>;
}

// /studio/flat: the current flat's spaces. With none saved, back to the New room screen.
function FlatRoute({onOpenSpace, onEditPlan, onBack, onAccount, onLang}: {onOpenSpace: (id: string) => void, onEditPlan: () => void,
  onBack: () => void, onAccount: () => void, onLang: () => void}){
  const navigate = useNavigate();
  const [flat, setFlat] = useState<Flat | null>(() => loadFlat());
  const [url, setUrl] = useState<string>(() => flat?.image.dataUrl || "");
  useEffect(() => {
    if (!flat){ navigate("/studio", {replace:true}); return; }
    // A flat another account left in this browser isn't this guest's.
    forgetOthersRoom().then(gone => { if (gone) navigate("/studio", {replace:true}); });
  }, []);
  useEffect(() => {
    if (flat && !url && flat.image.path) planImageUrl(flat.image.path).then((u: string | null) => { if (u) setUrl(u); });
  }, []);
  if (!flat) return null;
  return <FlatScreen flat={flat} imageUrl={url} onOpenSpace={onOpenSpace} onEditPlan={onEditPlan} onBack={onBack} onAccount={onAccount} onLang={onLang}
    onMarkDone={(id, done) => {
      const f = {...flat, spaces:flat.spaces.map(s => s.id === id ? {...s, status:(done ? "done" : "doing") as "done" | "doing"} : s)};
      saveFlat(f); setFlat(f);
    }}/>;
}
