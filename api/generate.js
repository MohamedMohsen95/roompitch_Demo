// RoomPitch — server function (runs on Vercel, keeps your AI key secret).
//
// GET  /api/generate  -> { aiEnabled, provider, maxInputSide, accessCodeRequired }
// POST /api/generate  -> { image: "data:image/jpeg;base64,..." }   (or { demo: true } when no key is set)
//
// Body for POST:
//   { mode: "restyle", image: <data URI>, prompt: <text>, width?, height? }
//   { mode: "edit",    image: <data URI>, mask: <data URI, white = change>, prompt: <text>, width?, height? }
//
// Two AI providers are supported. The first one with keys set is used:
//   1. Cloudflare Workers AI — has a FREE daily allowance (10,000 "neurons" ≈ 100 renders/day).
//        CF_ACCOUNT_ID      your Cloudflare account ID
//        CF_API_TOKEN       an API token with "Workers AI" permission
//        CF_IMAGE_MODEL     optional: default "@cf/black-forest-labs/flux-2-klein-4b"
//   2. fal.ai — paid, best quality.
//        FAL_KEY            your fal.ai API key
//        FAL_RESTYLE_MODEL  optional: default "fal-ai/nano-banana/edit"
//        FAL_INPAINT_MODEL  optional: default "fal-ai/flux-pro/v1/fill"
// Without any keys the app runs in demo mode.
//
//   ACCESS_CODE        optional: if set, the app must send this code (set it in the Studio dialog)
//   AI_PROVIDER        optional: "cloudflare" or "fal" to force one when both have keys

const RESTYLE_MODEL = process.env.FAL_RESTYLE_MODEL || "fal-ai/nano-banana/edit";
const INPAINT_MODEL = process.env.FAL_INPAINT_MODEL || "fal-ai/flux-pro/v1/fill";
const CF_MODEL = process.env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b";
const CF_MAX_INPUT_SIDE = 496; // FLUX.2 on Workers AI only accepts input images smaller than 512x512
const MAX_IMAGE_CHARS = 6_000_000; // ~4.4 MB of base64

const isImageDataUri = (s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length < MAX_IMAGE_CHARS;

function pickProvider() {
  const hasCf = Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
  const hasFal = Boolean(process.env.FAL_KEY);
  const forced = (process.env.AI_PROVIDER || "").toLowerCase();
  if (forced === "fal" && hasFal) return "fal";
  if (forced === "cloudflare" && hasCf) return "cloudflare";
  return hasCf ? "cloudflare" : hasFal ? "fal" : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const provider = pickProvider();

  if (req.method === "GET") {
    return res.status(200).json({
      aiEnabled: Boolean(provider),
      provider,
      maxInputSide: provider === "cloudflare" ? CF_MAX_INPUT_SIDE : null,
      accessCodeRequired: Boolean(process.env.ACCESS_CODE)
    });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Optional shared code so strangers who find your URL can't spend your AI credit.
  if (process.env.ACCESS_CODE && req.headers["x-access-code"] !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: "Access code required" });
  }

  if (!provider) return res.status(200).json({ demo: true });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }
  const { mode, image, mask, prompt } = body || {};

  if (!isImageDataUri(image)) return res.status(400).json({ error: "Missing or too large image" });
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 3000) {
    return res.status(400).json({ error: "Missing prompt" });
  }
  if (mode === "edit" && !isImageDataUri(mask)) return res.status(400).json({ error: "Missing mask" });

  try {
    return provider === "cloudflare"
      ? await runCloudflare(res, body)
      : await runFal(res, body);
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    console.error("generate failed", err);
    return res.status(timedOut ? 504 : 500).json({ error: timedOut ? "The AI took too long — try again" : "Server error" });
  }
}

async function runFal(res, { mode, image, mask, prompt }) {
  const key = process.env.FAL_KEY;
  let model, input;
  if (mode === "edit") {
    model = INPAINT_MODEL;
    input = { prompt, image_url: image, mask_url: mask, num_images: 1, output_format: "jpeg" };
  } else {
    model = RESTYLE_MODEL;
    input = { prompt, image_urls: [image], num_images: 1, output_format: "jpeg" };
  }

  const r = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(55_000)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || data).slice(0, 300);
    console.error("fal error", r.status, detail);
    const msg = r.status === 401 || r.status === 403 ? "AI key rejected — check FAL_KEY"
      : r.status === 402 ? "AI account has no credit left"
      : `AI provider error (${r.status}): ${detail}`;
    return res.status(502).json({ error: msg });
  }

  const url = data?.images?.[0]?.url;
  if (!url) return res.status(502).json({ error: "AI returned no image" });

  // Send the image back as a data URI so the browser can draw on it (no cross-site issues).
  if (url.startsWith("data:")) return res.status(200).json({ image: url });
  const img = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!img.ok) return res.status(502).json({ error: "Could not download the rendered image" });
  const type = img.headers.get("content-type") || "image/jpeg";
  const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
  return res.status(200).json({ image: `data:${type};base64,${b64}` });
}

// FLUX.2 on Workers AI edits the whole picture (no mask input). For brush edits the browser
// pastes the result back only inside the painted area — signalled by `maskComposite: true`.
async function runCloudflare(res, { mode, image, prompt, width, height }) {
  const [, mime, b64] = image.match(/^data:(image\/\w+);base64,(.*)$/);
  const form = new FormData();
  const instruction = mode === "edit"
    ? `Edit image 0: ${prompt} Keep everything else in the photo exactly the same.`
    : `Using image 0 as the room to redesign: ${prompt}`;
  form.append("prompt", instruction);
  form.append("input_image_0", new Blob([Buffer.from(b64, "base64")], { type: mime }), "room");
  const size = (v, d) => String(Math.min(1920, Math.max(256, Math.round((Number(v) || d) / 16) * 16)));
  form.append("width", size(width, 1024));
  form.append("height", size(height, 768));

  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CF_ACCOUNT_ID)}/ai/run/${CF_MODEL}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(55_000)
    }
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.success === false) {
    const detail = (data.errors || []).map(e => e.message).join("; ") || JSON.stringify(data).slice(0, 300);
    console.error("cloudflare error", r.status, detail);
    const msg = r.status === 401 || r.status === 403 ? "AI key rejected — check CF_ACCOUNT_ID and CF_API_TOKEN"
      : r.status === 429 || /neuron|quota|limit/i.test(detail) ? "Today's free AI allowance is used up — try again tomorrow"
      : `AI provider error (${r.status}): ${detail}`;
    return res.status(502).json({ error: msg });
  }

  const out = data?.result?.image;
  if (!out) return res.status(502).json({ error: "AI returned no image" });
  const type = out.startsWith("/9j/") ? "image/jpeg" : out.startsWith("iVBOR") ? "image/png" : "image/webp";
  return res.status(200).json({ image: `data:${type};base64,${out}`, maskComposite: mode === "edit" });
}
