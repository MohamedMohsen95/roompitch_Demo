// npm run textures — downloads the photo textures the catalog names (tex: "<Poly Haven id>" in
// src/studio/catalog.js, or an ambientCG id with texSrc: "ambientcg") into public/textures/<id>/ as 1024 px
// WebP: base (colour), normal (OpenGL) and arm (ambient occlusion, roughness, metalness), plus a CREDITS.md.
// Textures already there are skipped. Both libraries are CC0: free for any use, no attribution required.
// catalog:sync runs this first.
import { mkdir, writeFile, access, readFile, rm, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { WALL_MATS, FLOOR_MATS, FURN, OPENING_TEX } from "../src/studio/catalog.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, "public", "textures");
const API = "https://api.polyhaven.com";
const SIZE = 1024;
const force = process.argv.includes("--force");

// Scans that finishes shade to their own colour (tint: true): their colour map is made a neutral light grey.
const tinted = new Set(WALL_MATS.concat(FLOOR_MATS).filter(m => m.tint).map(m => m.tex));
export const TINT_MEAN = 240, TINT_SPREAD = 9;   // the grey's average and its spread (standard deviation), 0..255

// A colour map → neutral grey averaging TINT_MEAN, its variation scaled to TINT_SPREAD: the paint's own
// unevenness and the plaster's shading stay, its original colour goes.
async function neutral(buf){
  const {data, info} = await sharp(buf).resize(SIZE, SIZE, {fit:"inside"}).greyscale().raw().toBuffer({resolveWithObject:true});
  let sum = 0, sq = 0;
  for (const v of data){ sum += v; sq += v * v; }
  const mean = sum / data.length, sd = Math.sqrt(Math.max(0, sq / data.length - mean * mean));
  const k = Math.min(1, TINT_SPREAD / (sd || 1));
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(TINT_MEAN + k * (data[i] - mean))));
  return sharp(data, {raw:{width:info.width, height:info.height, channels:1}});
}

const all = [...WALL_MATS, ...FLOOR_MATS, ...FURN].concat(Object.values(OPENING_TEX)).filter(m => m.tex);
const ids = [...new Set(all.map(m => m.tex))];
const fromACG = new Set(all.filter(m => m.texSrc === "ambientcg").map(m => m.tex));
const exists = (p) => access(p).then(() => true, () => false);
const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

let fetched = 0;
for (const id of ids){
  const out = join(DIR, id);
  if (!force && await exists(join(out, "base.webp"))) continue;
  await mkdir(out, {recursive:true});
  if (fromACG.has(id)){ await ambientCG(id, out); fetched++; continue; }
  const [info, files] = await Promise.all([json(`${API}/info/${id}`), json(`${API}/files/${id}`)]);
  // Most textures call the colour map "Diffuse"; fabrics come in colourways (col_01, col_02, ...).
  const maps = {base:files.Diffuse || files.diff || files.col_01, normal:files.nor_gl, arm:files.arm};
  for (const [name, m] of Object.entries(maps)){
    const src = m?.["2k"]?.jpg?.url || m?.["1k"]?.jpg?.url;
    if (!src){ console.warn(`  ${id}: no ${name} map`); continue; }
    const r = await fetch(src);
    if (!r.ok) throw new Error(`${src}: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const img = name === "base" && tinted.has(id) ? await neutral(buf) : sharp(buf).resize(SIZE, SIZE, {fit:"inside"});
    await img.webp({quality:name === "base" ? 82 : 78}).toFile(join(out, `${name}.webp`));
  }
  const [w, h] = (info.dimensions || []).map(mm => Math.round(mm) / 1000);
  await writeFile(join(out, "CREDITS.md"),
    `${info.name} — Poly Haven (https://polyhaven.com/a/${id}), CC0 — free for any use, no attribution required.\n` +
    `By ${Object.keys(info.authors || {}).join(", ")}. Real size of one repeat: ${w} × ${h} m.\n`);
  console.log(`✓ ${id} (${w} × ${h} m)`);
  fetched++;
}
// ambientCG: one zip per texture holding Color, NormalGL and Roughness JPGs (no AO); arm is built from
// the roughness (AO white, metalness 0). It has no real size, so the catalog's tile is a judgement.
async function ambientCG(id, out){
  const r = await fetch(`https://ambientcg.com/get?file=${id}_2K-JPG.zip`);
  if (!r.ok) throw new Error(`ambientCG ${id}: ${r.status}`);
  const tmp = await mkdtemp(join(tmpdir(), "acg-")), zip = join(tmp, "t.zip");
  await writeFile(zip, Buffer.from(await r.arrayBuffer()));
  const tar = process.platform === "win32" ? join(process.env.SystemRoot || "C:\Windows", "System32", "tar.exe") : "tar";
  execFileSync(tar, ["-xf", zip, "-C", tmp]);   // Windows' bsdtar and macOS/Linux bsdtar read zip
  const at = (k) => join(tmp, `${id}_2K-JPG_${k}.jpg`);
  const fit = (f) => sharp(f).resize(SIZE, SIZE, {fit:"inside"});
  const base = tinted.has(id) ? await neutral(await readFile(at("Color"))) : fit(at("Color"));
  await base.webp({quality:82}).toFile(join(out, "base.webp"));
  await fit(at("NormalGL")).webp({quality:78}).toFile(join(out, "normal.webp"));
  const {data, info} = await fit(at("Roughness")).greyscale().raw().toBuffer({resolveWithObject:true});
  const arm = Buffer.alloc(data.length * 3);
  for (let i = 0; i < data.length; i++){ arm[i * 3] = 255; arm[i * 3 + 1] = data[i]; }
  await sharp(arm, {raw:{width:info.width, height:info.height, channels:3}}).webp({quality:78}).toFile(join(out, "arm.webp"));
  await rm(tmp, {recursive:true, force:true});
  await writeFile(join(out, "CREDITS.md"),
    `${id} — ambientCG (https://ambientcg.com/a/${id}), CC0 — free for any use, no attribution required.
`);
  console.log(`✓ ${id} (ambientCG)`);
}

console.log(fetched ? `${fetched} texture(s) downloaded into public/textures/` : "Textures up to date.");
