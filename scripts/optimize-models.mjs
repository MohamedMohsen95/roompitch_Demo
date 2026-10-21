// npm run models
//
// Turns every model in models-src/<folder>/ (.gltf with its files, or .glb) into one small
// .glb in public/models/<folder>/, which the Room Studio loads:
//   - geometry compressed with Meshopt (three.js decodes it; see src/studio/three/models.js)
//   - textures converted to WebP, at most 1024 px
// Typical result: a 5 MB Poly Haven model becomes ~200 KB.
// Other files in the folder (CREDITS.md, licences) are copied as they are.
// Up-to-date outputs are skipped; pass --force to redo everything.
import { readdir, stat, mkdir, copyFile } from "node:fs/promises";
import { join, relative, dirname, basename, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(root, "models-src"), OUT = join(root, "public", "models");
const force = process.argv.includes("--force");
const cli = join(root, "node_modules", "@gltf-transform", "cli", "bin", "cli.js");

async function walk(dir){
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })){
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}
const mtime = (p) => stat(p).then(s => s.mtimeMs, () => 0);

let done = 0, skipped = 0;
for (const file of await walk(SRC).catch(() => [])){
  const rel = relative(SRC, file), outDir = join(OUT, dirname(rel));
  if (/\.(gltf|glb)$/i.test(file)){
    const out = join(outDir, basename(file, extname(file)) + ".glb");
    if (!force && await mtime(out) > await mtime(file)){ skipped++; continue; }
    console.log(`optimizing ${rel}`);
    await mkdir(outDir, { recursive: true });
    execFileSync(process.execPath, [cli, "optimize", file, out,
      "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024"], { stdio: ["ignore", "ignore", "inherit"] });
    // A .gltf's size is its whole folder (the .gltf, .bin and textures); a .glb is one file.
    const before = extname(file).toLowerCase() === ".glb" ? (await stat(file)).size
      : (await Promise.all((await walk(dirname(file))).map(p => stat(p)))).reduce((s, x) => s + x.size, 0);
    console.log(`  ${(before / 1e6).toFixed(2)} MB → ${((await stat(out)).size / 1e3).toFixed(0)} KB`);
    done++;
  } else if (/\.(md|txt)$/i.test(file)){
    await mkdir(outDir, { recursive: true });
    await copyFile(file, join(outDir, basename(file)));   // credits / licence
  }
}
console.log(`${done} optimized, ${skipped} already up to date. Output: public/models/`);
