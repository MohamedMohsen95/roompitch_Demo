// Run the app on your own computer:  node dev-server.mjs   →  http://localhost:3000
// No packages to install. It serves the page and runs api/generate.js like Vercel does.
// Put FAL_KEY (and optionally ACCESS_CODE) in a file called .env next to this one.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// Minimal .env loader
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !line.trim().startsWith("#")) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}

const { default: generate } = await import("./api/generate.js");
const { default: models } = await import("./api/models.js");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".gltf": "model/gltf+json", ".glb": "model/gltf-binary", ".bin": "application/octet-stream" };
// 3D models: anything inside /models/ (posix.normalize below already strips "..")
const MODEL_FILE = /^\/models\/[\w./-]+\.(gltf|glb|bin|jpg|png)$/;
const PUBLIC = new Set(["/index.html", "/app.js", "/i18n.js", "/styles.css", "/favicon.svg", "/studio.html"]);

// Tiny shim so the Vercel-style handler (req.body, res.status().json()) works here.
function wrapRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/generate") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 12_000_000) { res.writeHead(413).end(); return; }
      }
      if (raw) { try { req.body = JSON.parse(raw); } catch { req.body = raw; } }
      return await generate(req, wrapRes(res));
    }
    if (url.pathname === "/api/models") return await models(req, wrapRes(res));
    const path = url.pathname === "/" ? "/index.html" : posix.normalize(url.pathname);
    if (!PUBLIC.has(path) && !MODEL_FILE.test(path)) { res.writeHead(404).end("Not found"); return; }
    const data = await readFile(join(root, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end("Server error");
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`RoomPitch running at http://localhost:${port}`);
  console.log(`Room studio (test): http://localhost:${port}/studio.html`);
  const cf = process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN;
  const provider = process.env.AI_PROVIDER === "fal" && process.env.FAL_KEY ? "fal.ai" : cf ? "Cloudflare Workers AI" : process.env.FAL_KEY ? "fal.ai" : null;
  console.log(provider ? `AI: live (${provider})` : "AI: demo mode (no AI keys in .env)");
});
