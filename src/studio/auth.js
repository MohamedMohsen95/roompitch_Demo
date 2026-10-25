// Accounts. Every visitor starts as an anonymous Supabase user (cloud-store.js), which is enough to save
// rooms. An account (email + password) is needed to upload models; an admin's uploads join the
// built-in catalog everyone sees. Signing in or out reloads the page, so the library, rooms and models
// all come from the new user; the room on screen is kept (it's in this browser) and saved to the new account.
import { cloudReady } from "./cloud-store.js";

// {email, anonymous, admin} for the signed-in user, or null without Supabase.
export async function getAccount(){
  const sb = await cloudReady();
  if (!sb) return null;
  const { data:{ user } } = await sb.auth.getUser();
  if (!user) return null;
  if (user.is_anonymous) return {email:null, anonymous:true, admin:false};
  const { data:profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return {email:user.email, anonymous:false, admin:profile?.role === "admin"};
}

const switchUser = () => location.reload();

async function client(){
  const sb = await cloudReady();
  if (!sb) throw new Error("offline");
  return sb;
}

export async function signIn(email, password){
  const { error } = await (await client()).auth.signInWithPassword({email, password});
  if (error) throw error;
  switchUser();
}

// Returns {confirm:true} when Supabase sends a confirmation email first (Authentication → Sign In /
// Providers → Email → "Confirm email"); otherwise the new account is signed in straight away.
export async function signUp(email, password){
  const { data, error } = await (await client()).auth.signUp({email, password,
    options:{emailRedirectTo:location.origin + location.pathname}});
  if (error) throw error;
  if (!data.session) return {confirm:true};
  switchUser();
  return {confirm:false};
}

export async function signOut(){
  await (await client()).auth.signOut();
  switchUser();   // the reload starts a new anonymous session
}
