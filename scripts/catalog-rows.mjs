// The built-in catalog ("RoomPitch basics") as catalog_items rows: the finishes and box furniture from
// src/studio/catalog.js, and the models in public/models (measured the same way GET /api/models does).
// Ids stay the ones saved rooms use. Shared by catalog-sync.mjs and seed-catalog.mjs.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WALL_MATS, FLOOR_MATS, FURN, EN } from "../src/studio/catalog.js";
import modelsApi from "../api/models.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const BUILTIN_CATALOG = {id:"00000000-0000-4000-8000-000000000001", owner:null,
  name:"RoomPitch basics", description:"Finishes and furniture that come with RoomPitch"};

const CATEGORY = {sofa:"seating", armchair:"seating", ctable:"table", tvunit:"storage", rug:"rug",
  dtable:"table", bed:"bed", plant:"decor"};

async function measuredModels(){
  let out = [];
  await modelsApi({method:"GET"}, {setHeader(){}, status(){ return this; }, json(o){ out = o.models; }});
  return out;
}

// "© 2021, Wayfair ... CC BY 4.0 ..." -> license "CC BY 4.0", credits = the whole file.
async function credits(model){
  try {
    const text = (await readFile(join(ROOT, "public", dirname(decodeURI(model)), "CREDITS.md"), "utf8")).trim();
    return {license:/CC0/.test(text) ? "CC0" : /CC BY 4\.0/.test(text) ? "CC BY 4.0" : null, credits:text};
  } catch { return {license:null, credits:null}; }
}

// Every row, plus file: the local .glb behind model_path (models only).
export async function builtinRows(){
  const base = {catalog_id:BUILTIN_CATALOG.id, owner:null, currency:"EGP", category:null, name_ar:null,
    w:null, d:null, h:null, surface:false, material:null, model_path:null, textures:null, license:null, credits:null};
  const rows = [
    ...WALL_MATS.map(m => ({...base, id:m.id, kind:"wall_finish", name_en:m.name, name_ar:m.ar, price:m.price,
      unit:"m2", color:m.c, material:m.kind, textures:{tile:m.tile}})),
    ...FLOOR_MATS.map(m => ({...base, id:m.id, kind:"floor_finish", name_en:m.name, name_ar:m.ar, price:m.price,
      unit:"m2", color:m.c, material:m.kind, textures:{tile:m.tile}})),
    ...FURN.map(f => ({...base, id:f.id, kind:"furniture", name_en:f.name, name_ar:f.ar, category:CATEGORY[f.id] || null,
      w:f.w, d:f.d, h:f.h, surface:Boolean(f.surface), price:f.price, unit:"each", color:f.c}))
  ];
  for (const m of await measuredModels()){
    const rel = decodeURI(m.model.replace(/^models\//, ""));
    rows.push({...base, id:m.id, kind:"furniture", name_en:m.name, w:m.w, d:m.d, h:m.h,
      surface:m.h >= .3 && m.h <= 1.1 && m.d >= .45 && m.w >= .9,   // same rule as addModels()
      price:m.price, unit:"each", color:m.c, model_path:"builtin/" + rel,
      file:join(ROOT, "public", "models", rel), ...await credits(m.model)});
  }
  for (const r of rows) r.ai_description = EN[r.id] ?? r.name_en.toLowerCase();
  return rows;
}
