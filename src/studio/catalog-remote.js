// The catalog from Supabase: built-in items (owner null) plus the designer's own, with a loadable URL for
// each model. Built-in models are public files in the "catalog" bucket; a designer's own sit in their
// private "files" folder and get a signed URL. Resolves to null without keys, sign-in or network,
// and the studio then keeps the catalog in catalog.js (+ GET /api/models).
import { cloudReady } from "./cloud-store.js";

const SIGNED_FOR = 24 * 3600;   // seconds a private model URL stays valid

const warn = (e) => { if (import.meta.env?.DEV) console.warn("[catalog]", e?.message || e); };

export async function loadRemoteCatalog(){
  try {
    const sb = await cloudReady();
    if (!sb) return null;
    const { data:rows, error } = await sb.from("catalog_items")
      .select("id, owner, kind, name_en, name_ar, ai_description, category, w, d, h, surface, price, color, material, model_path, textures")
      .eq("status", "ready").order("created_at");
    if (error) throw error;

    const pub = (path) => sb.storage.from("catalog").getPublicUrl(path).data.publicUrl;
    for (const r of rows){
      if (r.model_path && !r.owner) r.modelUrl = pub(r.model_path);
      // Photo textures of built-in finishes and rugs (catalog-rows.mjs): public files next to the models.
      if (r.textures?.base && !r.owner) r.texUrls = {base:pub(r.textures.base), normal:r.textures.normal && pub(r.textures.normal), arm:r.textures.arm && pub(r.textures.arm)};
    }
    const own = rows.filter(r => r.model_path && r.owner);
    if (own.length){
      const { data:signed, error:signError } = await sb.storage.from("files").createSignedUrls(own.map(r => r.model_path), SIGNED_FOR);
      if (signError) warn(signError);
      own.forEach((r, i) => { r.modelUrl = signed?.[i]?.signedUrl; });
    }
    // A model that can't be loaded would only show its placeholder box: leave such pieces out.
    return rows.filter(r => !r.model_path || r.modelUrl);
  } catch (e) { warn(e); return null; }
}
