// Who is an admin (profiles.role). Admins can add, change and remove models in the built-in catalog
// everyone sees; users can't give themselves the role (profiles_guard_role trigger), so it's set here.
//
//   npm run admin -- grant you@studio.com
//   npm run admin -- revoke you@studio.com
//   npm run admin -- list
//
// The account must exist first (Create account in the studio). Needs NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SECRET_KEY in .env.local. The change applies the next time that user loads the page.
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";

const [cmd, email] = process.argv.slice(2);
const env = loadEnv("development", fileURLToPath(new URL("..", import.meta.url)), "");
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key){ console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first."); process.exit(1); }
const sb = createClient(url, key, {auth:{persistSession:false}});

if (cmd === "list"){
  const { data, error } = await sb.from("profiles").select("email").eq("role", "admin").order("email");
  if (error){ console.error(error.message); process.exit(1); }
  console.log(data.length ? data.map(p => p.email).join("\n") : "No admins yet.");
} else if ((cmd === "grant" || cmd === "revoke") && email){
  const role = cmd === "grant" ? "admin" : "designer";
  const { data, error } = await sb.from("profiles").update({role}).ilike("email", email).select("email");
  if (error){ console.error(error.message); process.exit(1); }
  if (!data.length){ console.error(`No account with the email ${email}. Create it in the studio first.`); process.exit(1); }
  console.log(`${data[0].email} is now ${role === "admin" ? "an admin" : "a designer"}.`);
} else {
  console.error("Usage: npm run admin -- grant <email> | revoke <email> | list");
  process.exit(1);
}
