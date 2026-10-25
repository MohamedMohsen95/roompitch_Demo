// drizzle-kit: turns db/schema.js into SQL migrations that the Supabase CLI applies.
// `generate` needs no database. Only `studio`/`pull` connect, using DATABASE_URL from .env.local
// (Supabase → Connect → Session pooler connection string).
import { defineConfig } from "drizzle-kit";
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.js",
  out: "./supabase/migrations",
  migrations: {prefix:"supabase"},          // <timestamp>_<name>.sql, the names the Supabase CLI expects
  entities: {roles:{provider:"supabase"}},  // anon, authenticated, ... already exist: never create or drop them
  dbCredentials: {url:env.DATABASE_URL || ""}
});
