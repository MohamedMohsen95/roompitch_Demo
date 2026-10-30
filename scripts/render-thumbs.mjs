// npm run thumbs
//
// Renders the library thumbnail of every built-in piece (the box pieces in src/studio/catalog.js and the
// models in public/models) into public/thumbs/<id>.webp, with the studio's own 3D code: it starts the dev
// server, opens scripts/thumbs.html in a hidden Edge or Chrome (the one installed; playwright-core drives it,
// nothing is downloaded) and saves what the page renders. catalog:sync runs it and uploads the results.
// Existing thumbnails are kept; pass --force to render them all again.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "public", "thumbs");
const force = process.argv.includes("--force");

await mkdir(OUT, {recursive:true});
const have = force ? [] : (await readdir(OUT)).filter(f => f.endsWith(".webp")).map(f => f.slice(0, -5));

// A hidden browser that can draw WebGL without a graphics card (SwiftShader).
async function browser(){
  const args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  for (const channel of ["msedge", "chrome"]){
    try { return await chromium.launch({channel, args}); } catch { /* not installed: try the next */ }
  }
  throw new Error("Needs Microsoft Edge or Google Chrome installed.");
}

const server = await createServer({root:ROOT, logLevel:"error", server:{port:0, strictPort:false}});
await server.listen();
const b = await browser();
try {
  const page = await b.newPage();
  page.on("console", m => { if (m.type() === "error") console.error("  page:", m.text()); });
  await page.goto(new URL("scripts/thumbs.html", server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => window.thumbsReady, null, {timeout:60_000});
  const thumbs = await page.evaluate(skip => window.renderThumbs(skip), have);
  for (const t of thumbs){
    if (t.type !== "image/webp") throw new Error(`${t.id}: the browser made ${t.type}, not WebP`);
    await writeFile(join(OUT, `${t.id}.webp`), Buffer.from(t.data.split(",")[1], "base64"));
  }
  console.log(thumbs.length ? `✓ ${thumbs.length} thumbnail(s) rendered into public/thumbs: ${thumbs.map(t => t.id).join(", ")}`
    : "✓ Every built-in piece already has a thumbnail (--force renders them again)");
} finally {
  await b.close();
  await server.close();
}
