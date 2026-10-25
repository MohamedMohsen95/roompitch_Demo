// npm run catalog:sync — one command to publish the built-in catalog to Supabase:
//   1. optimises new or changed models in models-src/ into public/models/ (npm run models)
//   2. uploads each model to the public "catalog" bucket under builtin/ (skips files already there, same size)
//   3. adds the "RoomPitch basics" catalog and any catalog_items rows it doesn't have yet
//
// So adding a model is: put it in models-src/<folder>/ (with a CREDITS.md), then run this.
//   --update    also overwrite existing rows with the values from code (undoes edits made in the dashboard)
//   --force     re-upload every model file
//   --dry-run   show what would happen; needs no keys
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or the older SUPABASE_SERVICE_ROLE_KEY),
// from Supabase → Project Settings → API keys. The secret key bypasses RLS: keep it out of the browser and git.
import { readFile, stat } from "node:fs/promises";
import { dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
import { BUILTIN_CATALOG, builtinRows } from "./catalog-rows.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = new Set(process.argv.slice(2));
const dry = args.has("--dry-run"), update = args.has("--update"), force = args.has("--force");

const env = loadEnv("development", ROOT, "");
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && (!url || !key)){
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first (or try --dry-run).");
  process.exit(1);
}
const sb = dry ? null : createClient(url, key, {auth:{persistSession:false}});
const fail = (what, error) => { console.error(`✗ ${what}: ${error.message}`); process.exit(1); };

// 1. Optimise
execFileSync(process.execPath, [fileURLToPath(new URL("optimize-models.mjs", import.meta.url))], {stdio:"inherit"});

const rows = await builtinRows();
const models = rows.filter(r => r.file);

// 2. Upload models
let uploaded = 0;
for (const r of models){
  const size = (await stat(r.file)).size;
  if (!dry && !force){
    const { data:list } = await sb.storage.from("catalog").list(dirname(r.model_path), {search:basename(r.model_path)});
    if (list?.some(f => f.name === basename(r.model_path) && f.metadata?.size === size)) continue;
  }
  console.log(`${dry ? "would upload" : "uploading"} ${r.model_path} (${(size / 1e3).toFixed(0)} KB)`);
  if (dry) continue;
  const { error } = await sb.storage.from("catalog").upload(r.model_path, await readFile(r.file),
    {contentType:"model/gltf-binary", upsert:true, cacheControl:"31536000"});
  if (error) fail(r.model_path, error);
  uploaded++;
}

// 3. Rows
const items = rows.map(({file, ...r}) => r);
if (dry){
  console.log(`would add any of these ${items.length} rows that are missing: ${items.map(r => r.id).join(", ")}`);
  process.exit(0);
}
const { error:catError } = await sb.from("catalogs").upsert(BUILTIN_CATALOG, {onConflict:"id", ignoreDuplicates:true});
if (catError) fail("catalog", catError);
const { data:before, error:readError } = await sb.from("catalog_items").select("id").eq("catalog_id", BUILTIN_CATALOG.id);
if (readError) fail("catalog_items", readError);
const known = new Set(before.map(r => r.id));
const { error } = await sb.from("catalog_items").upsert(items, {onConflict:"id", ignoreDuplicates:!update});
if (error) fail("catalog_items", error);

const added = items.filter(r => !known.has(r.id)).map(r => r.id);
const gone = [...known].filter(id => !id.startsWith("u-") && !items.some(r => r.id === id));   // u-: uploaded by admins
console.log(`✓ ${uploaded} model file(s) uploaded, ${added.length} row(s) added${added.length ? ": " + added.join(", ") : ""}` +
  (update ? `, ${items.length - added.length} updated from code` : ""));
if (gone.length) console.log(`  In Supabase but no longer in code (left as they are): ${gone.join(", ")}`);
