// Vite builds the React app (index.html -> src/main.tsx: the photo page at / and the Room Studio at /studio) and, in development,
// runs the files in api/ the same way Vercel runs them as serverless functions.
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export default defineConfig(({ mode }) => {
  // Server-side secrets from .env (FAL_KEY, CF_ACCOUNT_ID, ...) for the api/ functions.
  // They stay on the server: only VITE_- and NEXT_PUBLIC_-prefixed variables ever reach browser code.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    // NEXT_PUBLIC_ is what the Vercel Supabase integration names its browser-safe keys
    // (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY), so they reach the app unrenamed.
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    build: {
      chunkSizeWarningLimit: 800 // three.js alone is ~650 kB minified (~170 kB gzipped); that's expected
    },
    plugins: [react(), vercelApiInDev(), printStudioUrl()]
  };
});

// `npm run dev` / `npm run preview` also print the Room Studio's address under Vite's usual one.
function printStudioUrl() {
  const wrap = (server) => {
    const print = server.printUrls.bind(server);
    server.printUrls = () => {
      print();
      for (const url of (server.resolvedUrls && server.resolvedUrls.local) || []) {
        server.config.logger.info(`  \u279c  Studio:  ${url.replace(/\/$/, "")}/studio`);
      }
    };
  };
  return { name: "print-studio-url", configureServer: wrap, configurePreviewServer: wrap };
}

// /api/<name> -> default export of api/<name>.js, with the small part of Vercel's
// request/response API those handlers use (req.body, res.status().json()).
function vercelApiInDev() {
  return {
    name: "vercel-api-in-dev",
    // `npm run dev`: reload the handler when its file changes
    configureServer(server) { server.middlewares.use(apiMiddleware(file => server.ssrLoadModule(file))); },
    // `npm run preview` (the production build served locally)
    configurePreviewServer(server) { server.middlewares.use(apiMiddleware(file => import(pathToFileURL(file).href))); }
  };
}

function apiMiddleware(load) {
  return async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    const m = url.pathname.match(/^\/api\/([\w-]+)$/);
    if (!m) return next();
    const file = resolve(import.meta.dirname, "api", `${m[1]}.js`);
    if (!existsSync(file)) return next();
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 12_000_000) { res.statusCode = 413; return res.end(); }
      }
      if (raw) { try { req.body = JSON.parse(raw); } catch { req.body = raw; } }
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
      const { default: handler } = await load(file);
      await handler(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.statusCode = 500;
      res.end("Server error");
    }
  };
}
