// Library thumbnails: which picture each piece shows, and making the ones that are missing.
//   f.thumb  a saved picture: public/thumbs/<id>.webp for built-in pieces (npm run thumbs), or the catalog
//            row's thumbnail_path (catalog-remote.js)
//   made     pictures rendered in this browser (three/thumbs.js) for pieces with none, or whose saved one
//            didn't load. Each is saved back to the cloud when this account may (its own uploads, or an
//            admin's shared ones), so it's only made once.
import { notify } from "./store.js";
import { saveThumb } from "./model-upload.js";

const made = new Map();     // id -> object URL
const broken = new Set();   // ids whose saved picture failed to load
const asked = new Set();    // ids being (or already) rendered here

export const thumbOf = (f) => made.get(f.id) || (!broken.has(f.id) && f.thumb) || null;

// The saved picture didn't load (not there yet): render one instead.
export function thumbBroken(f){ if (broken.has(f.id)) return; broken.add(f.id); notify(); }

export function requestThumb(f){
  if (asked.has(f.id)) return;
  asked.add(f.id);
  import("./three/thumbs.js").then(m => m.renderThumb(f.id)).then(blob => {
    made.set(f.id, URL.createObjectURL(blob)); notify();
    if (f.remote) return saveThumb(f, blob).then(url => { if (url) f.thumb = url; });
  }).catch(e => { if (import.meta.env?.DEV) console.warn("[thumbs]", f.id, e?.message || e); });
}
