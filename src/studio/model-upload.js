// Upload a 3D model: measure it in the browser, store the file and add a catalog_items row.
//   a designer's own:  private bucket "files", <user id>/catalog/<item id>.glb, in their "My models" catalog
//   shared (admins):   public bucket "catalog", uploads/<item id>.glb, in the built-in catalog everyone sees
// RLS checks both (an account for the first, profiles.role = admin for the second); catalog-remote.js
// loads them back on every visit.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { cloudReady } from "./cloud-store.js";

export const MAX_BYTES = 50 * 1024 * 1024;   // the buckets' limit
const SIGNED_FOR = 24 * 3600;
const BUILTIN_CATALOG = "00000000-0000-4000-8000-000000000001";   // "RoomPitch basics" (scripts/catalog-rows.mjs)

// Size in metres from the model's bounding box. glTF is in metres, but many exports are in centimetres
// or millimetres; an implausible size is scaled down and `scaled` says so.
export async function measureModel(file){
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await file.arrayBuffer(), "");
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  if (!(size.x > 0 && size.y > 0 && size.z > 0)) throw new Error("empty model");
  const big = Math.max(size.x, size.y, size.z), k = big > 3000 ? 1000 : big > 30 ? 100 : 1;
  const r = (v) => Math.round(v / k * 100) / 100;
  return {w:r(size.x), d:r(size.z), h:r(size.y), scaled:k > 1};
}

// Store the file and its row. Returns the row, with modelUrl, ready for applyCatalog().
export async function uploadModel({file, name, nameAr, price, currency, w, d, h, shared = false}){
  const sb = await cloudReady();
  if (!sb) throw new Error("offline");
  const { data:{ user } } = await sb.auth.getUser();
  if (!user) throw new Error("offline");

  // Shared: the built-in catalog. Otherwise the designer's own catalog, made on their first upload.
  let cat = {id:BUILTIN_CATALOG}, error;
  if (!shared){
    ({ data:cat, error } = await sb.from("catalogs").select("id").eq("owner", user.id).order("created_at").limit(1).maybeSingle());
    if (error) throw error;
    if (!cat){
      ({ data:cat, error } = await sb.from("catalogs").insert({name:"My models"}).select("id").single());
      if (error) throw error;
    }
  }

  const id = "u-" + crypto.randomUUID();
  const gltfJson = /\.gltf$/i.test(file.name), ext = gltfJson ? "gltf" : "glb";
  const bucket = shared ? "catalog" : "files";
  const path = shared ? `uploads/${id}.${ext}` : `${user.id}/catalog/${id}.${ext}`;
  const up = await sb.storage.from(bucket).upload(path, file,
    {contentType:gltfJson ? "model/gltf+json" : "model/gltf-binary", cacheControl:shared ? "31536000" : "3600"});
  if (up.error) throw up.error;

  const row = {id, catalog_id:cat.id, owner:shared ? null : user.id, kind:"furniture", name_en:name, name_ar:nameAr || null,
    ai_description:name.toLowerCase(), w, d, h,
    surface:h >= .3 && h <= 1.1 && d >= .45 && w >= .9,   // same rule as addModels()
    price, currency, color:"#8a8580", model_path:path, status:"ready"};
  const ins = await sb.from("catalog_items").insert(row);
  if (ins.error){
    await sb.storage.from(bucket).remove([path]);   // don't leave a file with no row
    throw ins.error;
  }
  if (shared) return {...row, modelUrl:sb.storage.from("catalog").getPublicUrl(path).data.publicUrl};
  const { data:signed } = await sb.storage.from("files").createSignedUrl(path, SIGNED_FOR);
  return {...row, modelUrl:signed?.signedUrl};
}
