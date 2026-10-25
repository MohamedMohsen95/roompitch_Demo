// Keep rooms in Supabase as well as in this browser (table "projects", kind "studio"; see db/schema.js).
// Each browser starts as an anonymous user, so its rows belong to it; after signing in (auth.js) they belong
// to the account, so every browser signed in to it sees the same projects (setup/projects.js lists them).
// The room on screen is one row, "the current project"; saves go to it, and a new room starts a new row.
// Every call resolves, even on errors: without keys, network or sign-in the app keeps working locally.
import { getSupabase } from "./supabase.js";
import { validRoom } from "./room-store.js";

const PROJECT_KEY = "rp_project_id";   // which cloud row is the current room, and whose: {user, id}
const DELAY = 1500;                    // wait this long after the last change before uploading

let pending = null, timer = null;
let chain = Promise.resolve();         // saves and changes of the current project run one at a time, in call order
let nextName = null;                   // the name of the next new row (newProject)

const warn = (what, e) => { if (import.meta.env?.DEV) console.warn(`[cloud] ${what}:`, e?.message || e); };
// The row id only while the same user is signed in (another user's row can't be read or written).
async function getId(sb){
  const { data:{ session } } = await sb.auth.getSession();
  try {
    const v = JSON.parse(localStorage.getItem(PROJECT_KEY) || "null");
    return v && v.user === session?.user.id ? v.id : null;
  } catch { return null; }
}
async function setId(sb, id){
  const { data:{ session } } = await sb.auth.getSession();
  try {
    if (id) localStorage.setItem(PROJECT_KEY, JSON.stringify({user:session?.user.id, id}));
    else localStorage.removeItem(PROJECT_KEY);
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

// Send the waiting room now (before the current project changes).
function flush(){
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
    .select("id, name, updated_at, form:data->form, items:data->items")
    .eq("kind", "studio").order("updated_at", {ascending:false}).limit(100);
  if (error){ warn("list", error); return null; }
  const current = await getId(sb);
  return data.map(r => ({id:r.id, name:r.name, updatedAt:r.updated_at, form:r.form,
    pieces:Array.isArray(r.items) ? r.items.length : 0, current:r.id === current}));
}

// Make a project the current one; returns its room, or null when it can't be read.
export async function openProject(id){
  flush();   // the room being left is saved first
  let room = null;
  await queue(async () => {
    const sb = await cloudReady();
    if (!sb) return;
    const { data:row, error } = await sb.from("projects").select("data").eq("id", id).maybeSingle();
    if (error) warn("open", error);
    if (!row || !validRoom(row.data)) return;
    await setId(sb, id);
    room = row.data;
  });
  return room;
}

// The next save starts a new project called name (a new room was set up).
export function newProject(name){
  flush();
  return queue(async () => {
    const sb = await cloudReady();
    if (sb) await setId(sb, null);
    nextName = name || null;
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
    const current = id === await getId(sb);
    if (current) await setId(sb, null);
    result = {ok:true, current};
  });
  return result;
}
