// A 3D model from a photo of a piece of furniture (api/object3d.js: Tripo on fal.ai). The result is an ordinary .glb File,
// which the upload dialog measures, names, prices and saves like any model the designer uploads.
import { getCode } from "./render-ai.js";

// fal's queue can be slow at busy times; giving up only stops waiting (the model is still made and charged),
// so the dialog offers to keep waiting on the same task rather than starting again.
const POLL_MS = 3000, GIVE_UP_MS = 10 * 60_000;

// Whether it's on, and what one model costs in dollars (null when the model's price isn't known).
/** @returns {Promise<{enabled: boolean, cost: number | null}>} */
export async function photo3dInfo(){
  try { const j = await (await fetch("/api/object3d")).json(); return {enabled:Boolean(j.enabled), cost:typeof j.cost === "number" ? j.cost : null}; }
  catch { return {enabled:false, cost:null}; }
}

// The photo as a JPEG data URI, at most `max` px on its longer side (keeps the request small, whatever the camera).
export async function shrinkPhoto(file, max = 1536){
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // a transparent PNG gets a plain background
  g.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return c.toDataURL("image/jpeg", .92);
}

async function call(url, init){
  const r = await fetch(url, {...init, headers:{"x-access-code":getCode(), ...init?.headers}});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Server error (${r.status})`);
  return data;
}

// The safety net: models fal finished lately that weren't added to the library yet, newest first. A model is charged
// whether or not anyone waits for it, so one the dialog stopped waiting for (or that was closed) can be fetched later.
// Added or dismissed ones are remembered in this browser and left out; names come from tasks started here.
const USED = "rp_3d_used", NAMES = "rp_3d_names";
const readStore = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k) || "") || fallback; } catch { return fallback; } };
const writeStore = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
export function rememberTask(task, name){ writeStore(NAMES, {...readStore(NAMES, {}), [task]:name}); }
export function setAsideTask(task){ writeStore(USED, [...readStore(USED, []), task].slice(-200)); }

/** @returns {Promise<{task: string, at: string, preview: string | null, name: string | null}[]>} */
export async function earlierModels(){
  try {
    const { models } = await call("/api/object3d?recent=1");
    const used = new Set(readStore(USED, [])), names = readStore(NAMES, {});
    return (models || []).filter(m => !used.has(m.task)).map(m => ({...m, name:names[m.task] || null}));
  } catch { return []; }
}

// Sends the photo; returns the task to wait for.
/** @param {File} photo @param {AbortSignal} [signal] @returns {Promise<string>} */
export async function startPhoto3D(photo, signal){
  const image = await shrinkPhoto(photo);
  const { task } = await call("/api/object3d", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({image}), signal});
  return task;
}

// Waits for the task's model. Gives up with Error("timeout") after GIVE_UP_MS; waiting again on the same task costs nothing.
/** @param {string} task @param {{name?: string, signal?: AbortSignal, onProgress?: (p: {seconds: number, queued: boolean, position: number | null}) => void}} [opts]
 *  @returns {Promise<{file: File, preview?: string}>} */
export async function waitFor3D(task, {name = "model", signal, onProgress = () => {}} = {}){
  const start = Date.now();
  for (;;){
    await new Promise((ok, fail) => {
      const timer = setTimeout(ok, POLL_MS);
      signal?.addEventListener("abort", () => { clearTimeout(timer); fail(new DOMException("aborted", "AbortError")); }, {once:true});
    });
    const s = await call(`/api/object3d?task=${encodeURIComponent(task)}`, {signal});
    if (s.status === "failed") throw new Error(s.error);
    if (s.status === "done"){
      // If the browser may not fetch the model's link directly, the server passes it on.
      let blob = await fetch(s.url, {signal}).then(r => r.ok ? r.blob() : null).catch(() => null);
      if (!blob){
        const r = await fetch(`/api/object3d?task=${encodeURIComponent(task)}&file=1`, {headers:{"x-access-code":getCode()}, signal});
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Couldn't download the model (${r.status})`);
        blob = await r.blob();
      }
      return {file:new File([blob], `${name}.glb`, {type:"model/gltf-binary"}), preview:s.preview};
    }
    onProgress({seconds:Math.round((Date.now() - start) / 1000), queued:Boolean(s.queued), position:s.position ?? null});
    if (Date.now() - start > GIVE_UP_MS) throw new Error("timeout");
  }
}
