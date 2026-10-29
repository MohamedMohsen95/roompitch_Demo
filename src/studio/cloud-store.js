// Keep rooms in Supabase as well as in this browser (table "projects", kind "studio"; see db/schema.js).
// A flat read from a floor plan is one row of kind "flat" (its plan image in the private "files" bucket).
// Each browser starts as an anonymous user, so its rows belong to it; after signing in (auth.js) they belong
// to the account, so every browser signed in to it sees the same projects (setup/projects.js lists them).
// The room on screen is one row, "the current project"; saves go to it, and a new room starts a new row.
// Every call resolves, even on errors: without keys, network or sign-in the app keeps working locally.
import { getSupabase } from "./supabase.js";
import { validRoom } from "./room-store.js";
import { validFlat } from "./plan/flat-store.js";

const PROJECT_KEY = "rp_project_id";   // which cloud row is the current room, and whose: {user, id}
const FLAT_KEY = "rp_flat_project_id"; // the same for the current flat
const DELAY = 1500;                    // wait this long after the last change before uploading

let pending = null, timer = null;
let pendingFlat = null, flatTimer = null, flatRefused = false, flatSaved = false;
const uploaded = new Map();            // project id -> {path, sig}: the plan image already in storage
const sigOf = (u) => u.length + ":" + u.slice(-48);   // tells one plan image from another (a new file)
let chain = Promise.resolve();         // saves and changes of the current project run one at a time, in call order
let nextName = null;                   // the name of the next new room row (newProject)
let nextFlatName = null;               // the same for the next new flat row

const warn = (what, e) => { if (import.meta.env?.DEV) console.warn(`[cloud] ${what}:`, e?.message || e); };
// The row id only while the same user is signed in (another user's row can't be read or written).
// Rooms and flats each have their own current row.
const keyOf = (kind) => kind === "flat" ? FLAT_KEY : PROJECT_KEY;
async function getId(sb, kind = "studio"){
  const { data:{ session } } = await sb.auth.getSession();
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(kind)) || "null");
    return v && v.user === session?.user.id ? v.id : null;
  } catch { return null; }
}
async function setId(sb, id, kind = "studio"){
  const { data:{ session } } = await sb.auth.getSession();
  try {
    if (id) localStorage.setItem(keyOf(kind), JSON.stringify({user:session?.user.id, id}));
    else localStorage.removeItem(keyOf(kind));
  } catch { /* private window: a new row next visit */ }
}

// The signed-in Supabase client, or null.
let ready = null;
export function cloudReady(){
  ready ??= (async () => {
    try {
      const sb = await getSupabase();
      if (!sb) return null;
      const { data:{ session } } = await sb.auth.getSession();
      if (!session){
        const { error } = await sb.auth.signInAnonymously();
        if (error) throw error;   // most often: anonymous sign-ins are off in the Supabase dashboard
      }
      return sb;
    } catch (e) { warn("sign-in", e); ready = null; return null; }
  })();
  return ready;
}

// Upload the room a moment after the last change (dragging saves often).
export function pushRoom(data){
  pending = data;
  clearTimeout(timer);
  timer = setTimeout(flush, DELAY);
}

const queue = (fn) => (chain = chain.then(fn).catch(e => warn("queue", e)));

// Upload the flat a moment after the last change.
export function pushFlat(flat){
  pendingFlat = flat;
  clearTimeout(flatTimer);
  flatTimer = setTimeout(flushFlat, DELAY);
}

const dataUrlBlob = async (u) => (await fetch(u)).blob();

function flushFlat(){
  clearTimeout(flatTimer);
  const flat = pendingFlat; pendingFlat = null;
  if (!flat) return chain;
  return queue(async () => {
    const sb = await cloudReady();
    if (!sb) return;
    let id = await getId(sb, "flat");
    const row = {id, kind:"flat", data:flat};
    if (!id){
      row.id = id = crypto.randomUUID(); await setId(sb, id, "flat");
      if (nextFlatName){ row.name = nextFlatName; nextFlatName = null; }
    }
    // The plan image goes to storage once; the row keeps its path instead of the image itself.
    const image = {...flat.image};
    if (image.dataUrl){
      const up = uploaded.get(id), sig = sigOf(image.dataUrl);
      let path = image.path || (up && up.sig === sig ? up.path : null);
      if (!path){
        const { data:{ session } } = await sb.auth.getSession();
        const want = `${session?.user.id}/${id}/plan.jpg`;
        const { error } = await sb.storage.from("files").upload(want, await dataUrlBlob(image.dataUrl), {upsert:true, contentType:"image/jpeg"});
        if (error) warn("plan image", error); else { path = want; uploaded.set(id, {path:want, sig}); }
      }
      if (path){ image.path = path; delete image.dataUrl; }
    }
    row.data = {...flat, image};
    const { error } = await sb.from("projects").upsert(row);
    // Until the database allows kind "flat" (a migration), the flat stays in this browser only.
    flatSaved = !error;
    if (error && !flatRefused){ flatRefused = true; warn("save flat (kept in this browser)", error); }
  });
}

// Send the waiting room now (before the current project changes).
function flush(){
  flushFlat();
  clearTimeout(timer);
  const room = pending; pending = null;
  if (!room) return chain;
  return queue(async () => {
    const sb = await cloudReady();
    if (!sb) return;
    let id = await getId(sb);
    const row = {id, kind:"studio", data:room};
    if (!id){
      row.id = id = crypto.randomUUID(); await setId(sb, id);
      if (nextName){ row.name = nextName; nextName = null; }
    }
    const { error } = await sb.from("projects").upsert(row);
    if (error) warn("save", error);
  });
}

// The current room from the cloud, or null.
export async function pullRoom(){
  const sb = await cloudReady();
  if (!sb) return null;
  const id = await getId(sb);
  let q = sb.from("projects").select("id, data").eq("kind", "studio");
  q = id ? q.eq("id", id) : q.order("updated_at", {ascending:false}).limit(1);
  const { data:row, error } = await q.maybeSingle();
  if (error){ warn("load", error); return null; }
  if (!row || !validRoom(row.data)) return null;
  if (!id) await setId(sb, row.id);
  return row.data;
}

/* ───────── Projects ───────── */

// This user's rooms, newest first: [{id, name, updatedAt, form, pieces, current}], or null when offline.
export async function listProjects(){
  const sb = await cloudReady();
  if (!sb) return null;
  await flush();   // so the room just edited is listed with its latest change
  const { data, error } = await sb.from("projects")
    .select("id, name, kind, updated_at, form:data->form, items:data->items")
    .in("kind", ["studio", "flat"]).order("updated_at", {ascending:false}).limit(100);
  if (error){ warn("list", error); return null; }
  const current = [await getId(sb), await getId(sb, "flat")];
  return data.map(r => ({id:r.id, name:r.name, kind:r.kind, updatedAt:r.updated_at, form:r.form,
    pieces:Array.isArray(r.items) ? r.items.length : 0, current:current.includes(r.id)}));
}

// Make a project the current one; returns {kind, data} (a room, or a flat), or null when it can't be read.
export async function openProject(id){
  flush();   // the room being left is saved first
  let out = null;
  await queue(async () => {
    const sb = await cloudReady();
    if (!sb) return;
    const { data:row, error } = await sb.from("projects").select("kind, data").eq("id", id).maybeSingle();
    if (error) warn("open", error);
    if (!row) return;
    const kind = row.kind === "flat" ? "flat" : "studio";
    if (kind === "flat" ? !validFlat(row.data) : !validRoom(row.data)) return;
    await setId(sb, id, kind);
    if (kind === "flat") flatSaved = true;   // it came from the account, so it is saved there
    out = {kind, data:row.data};
  });
  return out;
}

// Whether the last flat save reached the account (false until the "flat" migration is live, or offline).
export const flatInCloud = () => flatSaved;

// A short-lived link to a flat's plan image in storage, or null.
export async function planImageUrl(path){
  const sb = await cloudReady();
  if (!sb || !path) return null;
  const { data, error } = await sb.storage.from("files").createSignedUrl(path, 3600);
  if (error){ warn("plan image link", error); return null; }
  return data.signedUrl;
}

// The next save starts a new project called name (a new room, or kind "flat": a new flat, was set up).
export function newProject(name, kind = "studio"){
  flush();
  return queue(async () => {
    const sb = await cloudReady();
    if (sb) await setId(sb, null, kind);
    if (kind === "flat") nextFlatName = name || null; else nextName = name || null;
  });
}

export async function renameProject(id, name){
  const sb = await cloudReady();
  if (!sb) return false;
  const { error } = await sb.from("projects").update({name}).eq("id", id);
  if (error) warn("rename", error);
  return !error;
}

// Returns {ok, current}: current is true when the room on screen was the one deleted.
export async function deleteProject(id){
  flush();
  let result = {ok:false};
  await queue(async () => {
    const sb = await cloudReady();
    if (!sb) return;
    const { error } = await sb.from("projects").delete().eq("id", id);
    if (error){ warn("delete", error); return; }
    const room = id === await getId(sb), flat = id === await getId(sb, "flat");
    if (room) await setId(sb, null);
    if (flat) await setId(sb, null, "flat");
    const current = room || flat;
    result = {ok:true, current, kind:flat ? "flat" : "studio"};
  });
  return result;
}
