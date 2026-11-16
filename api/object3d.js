// RoomPitch — a 3D model from a photo of a piece of furniture (by default Tripo H3.1 on fal.ai, image to 3D). The browser
// sends the photo, then asks how the request is going every few seconds; once it's done it downloads the model
// and the designer names, prices and saves it like any uploaded model (ui/UploadDialog.tsx).
//
// GET  /api/object3d              -> { enabled, model, input, cost }
// POST /api/object3d  { image: "data:image/jpeg;base64,..." }  -> { task }
// GET  /api/object3d?task=<id>    -> { status: "working"|"done"|"failed", queued?, url?, preview?, error? }
// GET  /api/object3d?task=<id>&file=1  -> the model itself (.glb), for when the browser can't fetch fal's link
// GET  /api/object3d?recent=1     -> { models: [{task, at, preview}] }: models fal finished in the last 7 days (newest first),
//                                    from fal's own request history, so one the app stopped waiting for isn't lost
//
//   FAL_KEY              the same fal.ai key as api/generate.js
//   FAL_3D_MODEL         optional: default "tripo3d/h3.1/image-to-3d"
//   FAL_3D_TEXTURE       optional: "standard" (default, +$0.10), "detailed" (+$0.20) or "none" (bare grey geometry)
//   FAL_3D_GEOMETRY      optional: "standard" (default) or "detailed" (+$0.20)
//   FAL_3D_FACE_LIMIT    optional: triangles, default 40000
//   FAL_3D_AUTO_SIZE     optional: "true" (default: the model comes back in real-world metres) or "false"
//   FAL_3D_INPUT         optional: JSON added to (and overriding) everything above, for another model's own settings
//                        e.g. FAL_3D_INPUT={"quad":true} or, with FAL_3D_MODEL=fal-ai/trellis, {"texture_size":2048}
//   ACCESS_CODE     optional: the app must send this code (x-access-code header)
import { isImageDataUri } from "./_lib/cloudflare.js";

const model = () => process.env.FAL_3D_MODEL || "tripo3d/h3.1/image-to-3d";
// Status and results live under the app's id: its first two path parts ("tripo3d/h3.1").
const app = () => model().split("/").slice(0, 2).join("/");
const QUEUE = "https://queue.fal.run/";

const pick = (v, allowed, fallback) => {
  const x = String(v || "").trim().toLowerCase();
  if (!x) return fallback;
  if (allowed.includes(x)) return x;
  console.warn(`object3d: "${v}" isn't one of ${allowed.join(", ")}; using "${fallback}"`);
  return fallback;
};

// What's sent with the photo, from .env. Read on every request, so a change applies without a restart.
function input(){
  const e = process.env;
  const texture = pick(e.FAL_3D_TEXTURE, ["none", "standard", "detailed"], "standard");
  const geometry = pick(e.FAL_3D_GEOMETRY, ["standard", "detailed"], "standard");
  const faces = Math.round(Number(e.FAL_3D_FACE_LIMIT));
  const o = {
    texture:texture !== "none", pbr:texture !== "none",   // pbr turns texture on, so it follows it
    auto_size:pick(e.FAL_3D_AUTO_SIZE, ["true", "false"], "true") === "true",
    face_limit:faces >= 1000 && faces <= 2_000_000 ? faces : 40_000   // plenty for a piece of furniture, and a small file
  };
  if (texture === "detailed") o.texture_quality = "detailed";
  if (geometry === "detailed") o.geometry_quality = "detailed";
  if (e.FAL_3D_INPUT){
    try { Object.assign(o, JSON.parse(e.FAL_3D_INPUT)); }
    catch { const err = new Error("FAL_3D_INPUT in .env isn't valid JSON"); err.status = 500; throw err; }
  }
  return o;
}

// Dollars per model on Tripo H3.1 (fal's price list); null for any other model.
function cost(o){
  if (!model().startsWith("tripo3d/h3.1/")) return null;
  return Math.round(100 * (.2 + (o.texture || o.pbr ? (o.texture_quality === "detailed" ? .2 : .1) : 0)
    + (o.geometry_quality === "detailed" ? .2 : 0) + (o.quad ? .05 : 0))) / 100;
}

async function fal(path, init = {}){
  const r = await fetch(QUEUE + path, {...init, headers:{Authorization:`Key ${process.env.FAL_KEY}`, ...init.headers},
    signal:AbortSignal.timeout(25_000)});
  const data = await r.json().catch(() => ({}));
  if (r.ok) return data;
  const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || data).slice(0, 300);
  console.error("fal error", path, r.status, detail);
  const err = new Error(/balance|credit|locked|exhausted/i.test(detail) ? "Not enough fal credit — top up at fal.ai/dashboard/billing"
    : r.status === 401 || r.status === 403 ? "fal key rejected — check FAL_KEY"
    : r.status === 429 ? "fal is busy — try again in a minute"
    : `fal error (${r.status}): ${detail}`);
  err.status = 502;
  throw err;
}

// Finished models from fal's request history (its platform API, the same key). The input photos come back too, so
// only a few are asked for.
async function recent(){
  const q = new URLSearchParams({endpoint_id:model(), start:new Date(Date.now() - 7 * 864e5).toISOString(), status:"success", limit:"12", expand:"payloads"});
  const r = await fetch(`https://api.fal.ai/v1/models/requests/by-endpoint?${q}`,
    {headers:{Authorization:`Key ${process.env.FAL_KEY}`}, signal:AbortSignal.timeout(20_000)});
  if (!r.ok){ console.error("object3d recent", r.status, (await r.text()).slice(0, 200)); return []; }
  const data = await r.json().catch(() => ({}));
  return (data.items || []).filter(i => i.json_output?.model_mesh?.url)
    .map(i => ({task:i.request_id, at:i.ended_at, preview:i.json_output.rendered_image?.url || null}));
}

export default async function handler(req, res){
  res.setHeader("Cache-Control", "no-store");
  const url = new URL(req.url, "http://localhost");
  const task = url.searchParams.get("task");
  if (req.method === "GET" && !task && !url.searchParams.get("recent")){
    let o = null; try { o = input(); } catch {}
    return res.status(200).json({enabled:Boolean(process.env.FAL_KEY), model:model(), input:o, cost:o && cost(o)});
  }
  if (req.method !== "GET" && req.method !== "POST"){ res.setHeader("Allow", "GET, POST"); return res.status(405).json({error:"Method not allowed"}); }
  if (process.env.ACCESS_CODE && req.headers["x-access-code"] !== process.env.ACCESS_CODE) return res.status(401).json({error:"Access code required"});
  if (!process.env.FAL_KEY) return res.status(503).json({error:"Photo to 3D needs FAL_KEY in .env"});

  try {
    if (req.method === "GET" && url.searchParams.get("recent")) return res.status(200).json({models:await recent()});
    if (req.method === "POST"){
      let body = req.body;
      if (typeof body === "string"){ try { body = JSON.parse(body); } catch { body = null; } }
      if (!body || !isImageDataUri(body.image)) return res.status(400).json({error:"Missing or too large photo"});
      const queued = await fal(model(), {method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...input(), image_url:body.image})});   // fal takes the photo inline
      return res.status(200).json({task:queued.request_id});
    }

    if (!/^[\w-]{8,64}$/.test(task)) return res.status(400).json({error:"Bad task id"});
    const base = `${app()}/requests/${encodeURIComponent(task)}`;
    const s = await fal(`${base}/status`);
    if (s.status !== "COMPLETED") return res.status(200).json({status:"working", queued:s.status === "IN_QUEUE",
      position:typeof s.queue_position === "number" ? s.queue_position : null});
    let out;
    try { out = await fal(base); }
    catch (err){ return res.status(200).json({status:"failed", error:err.message}); }
    const mesh = out.model_mesh?.url;
    if (!mesh) return res.status(200).json({status:"failed", error:"fal returned no model"});
    if (url.searchParams.get("file")){
      const r = await fetch(mesh, {signal:AbortSignal.timeout(50_000)});
      if (!r.ok) return res.status(502).json({error:`Couldn't download the model (${r.status})`});
      res.setHeader("Content-Type", "model/gltf-binary");
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    return res.status(200).json({status:"done", url:mesh, preview:out.rendered_image?.url});
  } catch (err){
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    if (!err.status) console.error("object3d failed", err);
    res.status(err.status || (timedOut ? 504 : 500)).json({error:err.status ? err.message : timedOut ? "fal took too long — try again" : "Server error"});
  }
}
