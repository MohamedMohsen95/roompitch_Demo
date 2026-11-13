// Shared by api/plan.js and api/point.js: calling a Workers AI model and turning its errors into the
// messages the app shows. (Files under api/_lib are not routes.)
export const hasKeys = () => Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
export const isImageDataUri = (s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length < 6_000_000;

// Text of a chat model's answer, whichever response shape the model uses.
export function replyText(data){
  const r = data && data.result;
  if (!r) return "";
  if (typeof r.response === "string") return r.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  const c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  return typeof c === "string" ? c : "";
}

// POST the body to the model: {ok:true, data} or {ok:false, status, error}.
export async function runModel(model, body, timeoutMs = 55_000){
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CF_ACCOUNT_ID)}/ai/run/${model}`,
    {method:"POST", headers:{Authorization:`Bearer ${process.env.CF_API_TOKEN}`, "Content-Type":"application/json"},
      body:JSON.stringify(body), signal:AbortSignal.timeout(timeoutMs)}
  );
  const data = await r.json().catch(() => ({}));
  if (r.ok && data.success !== false) return {ok:true, data};
  const detail = (data.errors || []).map(e => e.message).join("; ") || JSON.stringify(data).slice(0, 300);
  console.error("cloudflare error", model, r.status, detail);
  const error = r.status === 401 || r.status === 403 ? "AI key rejected — check CF_ACCOUNT_ID and CF_API_TOKEN"
    : r.status === 429 || /neuron|quota|limit/i.test(detail) ? "Today's free AI allowance is used up — try again tomorrow"
    : `AI provider error (${r.status}): ${detail}`;
  return {ok:false, status:502, error};
}

// The checks every AI route makes before calling the model: method, access code, keys, image.
// Returns the parsed body, or null after answering the request itself.
export function guard(req, res, model, extra = () => null){
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET"){ res.status(200).json({enabled:hasKeys(), model}); return null; }
  if (req.method !== "POST"){ res.setHeader("Allow", "GET, POST"); res.status(405).json({error:"Method not allowed"}); return null; }
  if (process.env.ACCESS_CODE && req.headers["x-access-code"] !== process.env.ACCESS_CODE){ res.status(401).json({error:"Access code required"}); return null; }
  if (!hasKeys()){ res.status(503).json({error:"Plan reading needs CF_ACCOUNT_ID and CF_API_TOKEN in .env"}); return null; }
  let body = req.body;
  if (typeof body === "string"){ try { body = JSON.parse(body); } catch { res.status(400).json({error:"Invalid JSON"}); return null; } }
  if (!body || !isImageDataUri(body.image)){ res.status(400).json({error:"Missing or too large image"}); return null; }
  const bad = extra(body);
  if (bad){ res.status(400).json({error:bad}); return null; }
  return body;
}

export function failed(res, err, what){
  const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
  console.error(what + " failed", err);
  res.status(timedOut ? 504 : 500).json({error:timedOut ? "The AI took too long — try again" : "Server error"});
}
