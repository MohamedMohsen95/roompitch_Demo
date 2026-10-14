// RoomPitch — server function (runs on Vercel, keeps your AI key secret).
//
// GET  /api/generate  -> { aiEnabled: true|false }
// POST /api/generate  -> { image: "data:image/jpeg;base64,..." }   (or { demo: true } when no key is set)
//
// Body for POST:
//   { mode: "restyle", image: <data URI>, prompt: <text> }
//   { mode: "edit",    image: <data URI>, mask: <data URI, white = change>, prompt: <text> }
//
// Environment variables (set them in Vercel → Project → Settings → Environment Variables):
//   FAL_KEY            your fal.ai API key (without it the app runs in demo mode)
//   ACCESS_CODE        optional: if set, the app must send this code (set it in the Studio dialog)
//   FAL_RESTYLE_MODEL  optional: default "fal-ai/nano-banana/edit"
//   FAL_INPAINT_MODEL  optional: default "fal-ai/flux-pro/v1/fill"

const RESTYLE_MODEL = process.env.FAL_RESTYLE_MODEL || "fal-ai/nano-banana/edit";
const INPAINT_MODEL = process.env.FAL_INPAINT_MODEL || "fal-ai/flux-pro/v1/fill";
const MAX_IMAGE_CHARS = 6_000_000; // ~4.4 MB of base64

const isImageDataUri = (s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length < MAX_IMAGE_CHARS;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.FAL_KEY;

  if (req.method === "GET") {
    return res.status(200).json({ aiEnabled: Boolean(key), accessCodeRequired: Boolean(process.env.ACCESS_CODE) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Optional shared code so strangers who find your URL can't spend your AI credit.
  if (process.env.ACCESS_CODE && req.headers["x-access-code"] !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: "Access code required" });
  }

  if (!key) return res.status(200).json({ demo: true });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }
  const { mode, image, mask, prompt } = body || {};

  if (!isImageDataUri(image)) return res.status(400).json({ error: "Missing or too large image" });
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 3000) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  let model, input;
  if (mode === "edit") {
    if (!isImageDataUri(mask)) return res.status(400).json({ error: "Missing mask" });
    model = INPAINT_MODEL;
    input = { prompt, image_url: image, mask_url: mask, num_images: 1, output_format: "jpeg" };
  } else {
    model = RESTYLE_MODEL;
    input = { prompt, image_urls: [image], num_images: 1, output_format: "jpeg" };
  }

  try {
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
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    console.error("generate failed", err);
    return res.status(timedOut ? 504 : 500).json({ error: timedOut ? "The AI took too long — try again" : "Server error" });
  }
}
