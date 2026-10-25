// The Supabase client, or null when the app has no Supabase keys (then everything stays in this browser).
// Keys come from .env.local or Vercel: NEXT_PUBLIC_SUPABASE_URL plus the publishable (or older anon) key.
// The library is loaded on first use, so a page without keys never downloads it.
const env = import.meta.env || {};
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
const SB_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

let client = null;

export async function getSupabase(){
  if (!SB_URL || !SB_KEY) return null;
  if (!client) client = import("@supabase/supabase-js").then(({ createClient }) => createClient(SB_URL, SB_KEY));
  return client;
}
