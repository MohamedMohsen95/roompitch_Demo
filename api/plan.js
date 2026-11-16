// RoomPitch — read the room names and written sizes on a floor plan with a vision model: Cloudflare Workers AI
// or fal.ai (any model fal's vision router runs: Gemini, Claude, GPT, …). The outlines come from the walls in
// the browser; this only reads text.
//
// GET  /api/plan  -> { enabled, provider, model }
// POST /api/plan  { image: "data:image/jpeg;base64,..." }  -> { rooms: [{name, size, area}] }
//
//   PLAN_PROVIDER                 optional: "cloudflare" or "fal". Unset: AI_PROVIDER, then whichever has keys
//                                 (Cloudflare first, as before)
//   CF_ACCOUNT_ID, CF_API_TOKEN   Cloudflare's keys (the same as api/generate.js)
//   CF_PLAN_MODEL                 optional: falls back to CF_VISION_MODEL, then "@cf/meta/llama-4-scout-17b-16e-instruct"
//   FAL_KEY                       fal's key (the same as api/generate.js)
//   FAL_PLAN_MODEL                optional: the model fal's router runs, default "google/gemini-3-pro-image" (Nano Banana Pro)
//   FAL_PLAN_ENDPOINT             optional: the fal app, default "openrouter/router/vision"
//   PLAN_MAX_TOKENS               optional: longest answer, default 1500 (a busy plan's list can need more)
//   ACCESS_CODE                   optional: the app must send this code (x-access-code header)
import { TEXT_PROMPT, parseTextReply } from "../src/studio/plan/plan-vision.js";
import { guard, runModel, replyText, failed } from "./_lib/cloudflare.js";

const hasCf = () => Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
const hasFal = () => Boolean(process.env.FAL_KEY);

// "cloudflare", "fal", or null when the chosen one has no keys
function planProvider(){
  const want = (process.env.PLAN_PROVIDER || process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (want === "fal") return hasFal() ? "fal" : null;
  if (want === "cloudflare") return hasCf() ? "cloudflare" : null;
  if (want) console.warn(`PLAN_PROVIDER="${want}" is not "cloudflare" or "fal"; using whichever has keys`);
  return hasCf() ? "cloudflare" : hasFal() ? "fal" : null;
}
const cfModel = () => process.env.CF_PLAN_MODEL || process.env.CF_VISION_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";
const falModel = () => process.env.FAL_PLAN_MODEL || "google/gemini-3-pro-image";
const falApp = () => (process.env.FAL_PLAN_ENDPOINT || "openrouter/router/vision").replace(/^\/+|\/+$/g, "");
const maxTokens = () => { const n = parseInt(process.env.PLAN_MAX_TOKENS, 10); return n >= 200 && n <= 32000 ? n : 1500; };

// fal's vision router: {ok:true, text} or {ok:false, status, error}
// Some models only answer with their reasoning on (Gemini 3 Pro): asked again with it, and room for its thinking,
// which counts toward max_tokens.
async function runFal(image, reasoning = false){
  const r = await fetch(`https://fal.run/${falApp()}`, {
    method:"POST", headers:{Authorization:`Key ${process.env.FAL_KEY}`, "Content-Type":"application/json"},
    body:JSON.stringify({model:falModel(), prompt:TEXT_PROMPT, image_urls:[image], temperature:0,
      ...(reasoning ? {reasoning:true, max_tokens:Math.max(maxTokens(), 12000)} : {max_tokens:maxTokens()})}),
    signal:AbortSignal.timeout(55_000)
  });
  const data = await r.json().catch(() => ({}));
  const id = r.headers.get("x-fal-request-id") || data.request_id || null;   // to find it on fal's dashboard
  if (r.ok && typeof data.output === "string") return {ok:true, text:data.output, id, cost:data.usage?.cost ?? null, reasoning};
  const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || data).slice(0, 300);
  if (!reasoning && r.status === 422 && /reasoning is mandatory/i.test(detail)) return runFal(image, true);
  console.error("[plan] fal error", falApp(), falModel(), r.status, id ? "request " + id : "", detail);
  const error = /balance|credit|exhausted|locked/i.test(detail) ? "Not enough fal credit — top up at fal.ai/dashboard/billing"
    : r.status === 401 || r.status === 403 ? "fal key rejected — check FAL_KEY"
    : r.status === 429 ? "fal is busy — try again in a minute"
    : `AI provider error (${r.status}): ${detail}`;
  return {ok:false, status:502, error, id};
}

// One line in the server's log per read: which provider and model, how it went, and for fal its request id and cost.
function logRead(info){
  const parts = [`[plan] ${info.provider} ${info.model}`, info.app && `via ${info.app}`, info.reasoning && "(reasoning on)",
    info.ok ? `→ ${info.rooms} room name(s)` : `→ failed: ${info.error}`, `in ${((Date.now() - info.t0) / 1000).toFixed(1)} s`,
    info.cost != null && `cost $${Number(info.cost).toFixed(4)}`, info.id && `request ${info.id}`];
  console.log(parts.filter(Boolean).join(" "));
}

export default async function handler(req, res){
  const provider = planProvider();
  if (req.method === "GET"){
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({enabled:Boolean(provider), provider, model:provider === "fal" ? falModel() : cfModel()});
  }
  const body = guard(req, res, cfModel(), () => null, {ready:Boolean(provider),
    missing:"Plan reading needs keys in .env: CF_ACCOUNT_ID and CF_API_TOKEN, or FAL_KEY (see PLAN_PROVIDER)"});
  if (!body) return;
  const t0 = Date.now();
  // which model read it goes back with the answer too, for the browser's console
  const used = provider === "fal" ? {provider, model:falModel(), app:falApp()} : {provider, model:cfModel()};
  try {
    if (provider === "fal"){
      const r = await runFal(body.image);
      if (!r.ok){ logRead({...used, t0, ok:false, error:r.error, id:r.id}); return res.status(r.status).json({error:r.error, used}); }
      const out = parseTextReply(r.text);
      logRead({...used, t0, ok:true, rooms:out.rooms.length, id:r.id, cost:r.cost, reasoning:r.reasoning});
      return res.status(200).json({...out, used:{...used, request:r.id, cost:r.cost}});
    }
    const r = await runModel(cfModel(), {
      messages:[{role:"user", content:[{type:"text", text:TEXT_PROMPT}, {type:"image_url", image_url:{url:body.image}}]}],
      max_tokens:maxTokens(), temperature:0
    });
    if (!r.ok){ logRead({...used, t0, ok:false, error:r.error}); return res.status(r.status).json({error:r.error, used}); }
    const out = parseTextReply(replyText(r.data));
    logRead({...used, t0, ok:true, rooms:out.rooms.length});
    return res.status(200).json({...out, used});
  } catch (err){ logRead({...used, t0, ok:false, error:err?.name || "error"}); failed(res, err, "plan"); }
}
