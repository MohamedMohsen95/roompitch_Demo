// npm run textures — downloads the photo textures the catalog names (tex: "<Poly Haven id>" in
// src/studio/catalog.js) into public/textures/<id>/ as 1024 px WebP: base (colour), normal (OpenGL)
// and arm (ambient occlusion, roughness, metalness), plus a CREDITS.md. Textures already there are skipped.
// Poly Haven textures are CC0: free for any use, no attribution required. catalog:sync runs this first.
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { WALL_MATS, FLOOR_MATS, FURN, OPENING_TEX } from "../src/studio/catalog.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, "public", "textures");
const API = "https://api.polyhaven.com";
const SIZE = 1024;
const force = process.argv.includes("--force");

const ids = [...new Set([...WALL_MATS, ...FLOOR_MATS, ...FURN].concat(Object.values(OPENING_TEX)).map(m => m.tex).filter(Boolean))];
const exists = (p) => access(p).then(() => true, () => false);
const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

let fetched = 0;
for (const id of ids){
  const out = join(DIR, id);
  if (!force && await exists(join(out, "base.webp"))) continue;
  const [info, files] = await Promise.all([json(`${API}/info/${id}`), json(`${API}/files/${id}`)]);
  // Most textures call the colour map "Diffuse"; fabrics come in colourways (col_01, col_02, ...).
  const maps = {base:files.Diffuse || files.diff || files.col_01, normal:files.nor_gl, arm:files.arm};
  await mkdir(out, {recursive:true});
  for (const [name, m] of Object.entries(maps)){
    const src = m?.["2k"]?.jpg?.url || m?.["1k"]?.jpg?.url;
    if (!src){ console.warn(`  ${id}: no ${name} map`); continue; }
    const r = await fetch(src);
    if (!r.ok) throw new Error(`${src}: ${r.status}`);
    await sharp(Buffer.from(await r.arrayBuffer())).resize(SIZE, SIZE, {fit:"inside"})
      .webp({quality:name === "base" ? 82 : 78}).toFile(join(out, `${name}.webp`));
  }
  const [w, h] = (info.dimensions || []).map(mm => Math.round(mm) / 1000);
  await writeFile(join(out, "CREDITS.md"),
    `${info.name} — Poly Haven (https://polyhaven.com/a/${id}), CC0 — free for any use, no attribution required.\n` +
    `By ${Object.keys(info.authors || {}).join(", ")}. Real size of one repeat: ${w} × ${h} m.\n`);
  console.log(`✓ ${id} (${w} × ${h} m)`);
  fetched++;
}
console.log(fetched ? `${fetched} texture(s) downloaded into public/textures/` : "Textures up to date.");
