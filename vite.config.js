// Vite builds the two pages (the main app and the Room Studio) and, in development,
// runs the files in api/ the same way Vercel runs them as serverless functions.
import { defineConfig, loadEnv } from "vite";
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
      chunkSizeWarningLimit: 800, // three.js alone is ~650 kB minified (~170 kB gzipped); that's expected
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, "index.html"),
          studio: resolve(import.meta.dirname, "studio.html")
        }
      }
    },
    plugins: [vercelApiInDev()]
  };
});

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
