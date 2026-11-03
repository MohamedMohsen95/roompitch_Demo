// Templates: rooms anyone can start from (table "templates", covers in the public "templates" bucket; see
// db/schema.js). Everyone reads the published ones; admins save a room as a template, update it, hide it or
// delete it. Starting from one copies it into a new project, so changing a template later changes no one's room.
// Every call resolves, even on errors (no keys, no network, the table not made yet): the gallery just stays empty.
import { cloudReady } from "./cloud-store.js";
import { validRoom } from "./room-store.js";
import { FU } from "./catalog.js";
import { bbox } from "./geometry.js";

const BUCKET = "templates";
const warn = (what, e) => { if (import.meta.env?.DEV) console.warn(`[templates] ${what}:`, e?.message || e); };
const coverUrl = (sb, path, v) => path ? `${sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${encodeURIComponent(v)}` : null;

// The gallery, in order: [{id, name, nameAr, description, cover, published, pieces, L, W, plan}], or null when offline.
// plan ({poly, items, floor}) draws the card when there's no cover.
// Admins also get the hidden ones (published false).
export async function listTemplates(){
  const sb = await cloudReady();
  if (!sb) return null;
  const { data, error } = await sb.from(BUCKET)
    .select("id, name, name_ar, description, cover_path, published, updated_at, poly:data->poly, items:data->items, floor:data->floor")
    .order("sort").order("created_at", {ascending:false}).limit(100);
  if (error){ warn("list", error); return null; }
  return data.map(r => {
    const box = Array.isArray(r.poly) && r.poly.length > 2 ? bbox(r.poly) : {L:0, W:0};
    return {id:r.id, name:r.name, nameAr:r.name_ar, description:r.description, cover:coverUrl(sb, r.cover_path, r.updated_at),
      published:r.published, pieces:Array.isArray(r.items) ? r.items.length : 0, L:box.L, W:box.W,
      plan:box.L ? {poly:r.poly, items:Array.isArray(r.items) ? r.items : [], floor:r.floor} : null};
  });
}

// A template's room, or null when it can't be read.
export async function getTemplate(id){
  const sb = await cloudReady();
  if (!sb) return null;
  const { data:row, error } = await sb.from(BUCKET).select("data").eq("id", id).maybeSingle();
  if (error) warn("get", error);
  return row && validRoom(row.data) ? {...row.data, template:id} : null;
}

// Pieces only their owner can load (a designer's own uploads): the people using the template wouldn't see them.
export const privatePieces = (room) => room.items.filter(it => FU[it.type]?.owner).map(it => FU[it.type]);

// Save the room as a new template (id null) or over an existing one. cover: a JPEG data URL of the 3D view.
// Returns {id, coverOk}, or null when the template wasn't saved.
export async function saveTemplate({id, name, nameAr, description, room, cover}){
  const sb = await cloudReady();
  if (!sb) return null;
  const data = {...room, template:undefined, savedAt:Date.now()};
  const fields = {name, name_ar:nameAr || null, description:description || null, data};
  const res = id ? await sb.from(BUCKET).update(fields).eq("id", id).select("id").maybeSingle()
    : await sb.from(BUCKET).insert(fields).select("id").single();
  if (res.error || !res.data){ warn("save", res.error || "not found"); return null; }
  id = res.data.id;
  let coverOk = !cover;
  if (cover){
    const path = `${id}.jpg`;
    const blob = await (await fetch(cover)).blob();
    const up = await sb.storage.from(BUCKET).upload(path, blob, {contentType:"image/jpeg", upsert:true});
    if (up.error) warn("cover", up.error);
    else coverOk = !(await sb.from(BUCKET).update({cover_path:path}).eq("id", id)).error;
  }
  return {id, coverOk};
}

export async function setPublished(id, published){
  const sb = await cloudReady();
  if (!sb) return false;
  const { error } = await sb.from(BUCKET).update({published}).eq("id", id);
  if (error) warn("publish", error);
  return !error;
}

export async function deleteTemplate(id){
  const sb = await cloudReady();
  if (!sb) return false;
  const { error } = await sb.from(BUCKET).delete().eq("id", id);
  if (error){ warn("delete", error); return false; }
  await sb.storage.from(BUCKET).remove([`${id}.jpg`]);
  return true;
}

// The name of the template this room came from (for "Update template"), or null.
export async function templateName(id){
  const sb = await cloudReady();
  if (!sb || !id) return null;
  const { data } = await sb.from(BUCKET).select("name").eq("id", id).maybeSingle();
  return data?.name ?? null;
}
