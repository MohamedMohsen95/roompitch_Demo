// RoomPitch — find doors and windows in a photo of one wall (Cloudflare Workers AI vision model).
//
// GET  /api/analyze  -> { enabled, model }
// POST /api/analyze  { image: "data:image/jpeg;base64,..." }  -> { openings: [{type, left, right, top, bottom}] }
//   Positions are fractions of the wall in the photo; the browser turns them into centimetres.
//
//   CF_ACCOUNT_ID, CF_API_TOKEN   the same Cloudflare keys as api/generate.js
//   CF_VISION_MODEL               optional: default "@cf/meta/llama-4-scout-17b-16e-instruct"
//   ACCESS_CODE                   optional: the app must send this code (x-access-code header)
import { VISION_PROMPT, parseVisionReply } from "../src/studio/vision.js";

const DEFAULT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const MAX_IMAGE_CHARS = 6_000_000; // ~4.4 MB of base64
const isImageDataUri = (s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length < MAX_IMAGE_CHARS;

const model = () => process.env.CF_VISION_MODEL || DEFAULT_MODEL;
const hasKeys = () => Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);

// Text of the model's answer, whichever response shape the model uses.
function replyText(data){
  const r = data && data.result;
  if (!r) return "";
  if (typeof r.response === "string") return r.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  const c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  return typeof c === "string" ? c : "";
}

export default async function handler(req, res){
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({enabled:hasKeys(), model:model()});
  if (req.method !== "POST"){ res.setHeader("Allow", "GET, POST"); return res.status(405).json({error:"Method not allowed"}); }

  if (process.env.ACCESS_CODE && req.headers["x-access-code"] !== process.env.ACCESS_CODE){
    return res.status(401).json({error:"Access code required"});
  }
  if (!hasKeys()) return res.status(503).json({error:"Photo analysis needs CF_ACCOUNT_ID and CF_API_TOKEN in .env"});

  let body = req.body;
  if (typeof body === "string"){ try { body = JSON.parse(body); } catch { return res.status(400).json({error:"Invalid JSON"}); } }
  const image = body && body.image;
  if (!isImageDataUri(image)) return res.status(400).json({error:"Missing or too large image"});

  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CF_ACCOUNT_ID)}/ai/run/${model()}`,
      {
        method:"POST",
        headers:{Authorization:`Bearer ${process.env.CF_API_TOKEN}`, "Content-Type":"application/json"},
        body:JSON.stringify({
          messages:[{role:"user", content:[{type:"text", text:VISION_PROMPT}, {type:"image_url", image_url:{url:image}}]}],
          max_tokens:600,
          temperature:0
        }),
        signal:AbortSignal.timeout(55_000)
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.success === false){
      const detail = (data.errors || []).map(e => e.message).join("; ") || JSON.stringify(data).slice(0, 300);
      console.error("cloudflare vision error", r.status, detail);
      const msg = r.status === 401 || r.status === 403 ? "AI key rejected — check CF_ACCOUNT_ID and CF_API_TOKEN"
        : r.status === 429 || /neuron|quota|limit/i.test(detail) ? "Today's free AI allowance is used up — try again tomorrow"
        : `AI provider error (${r.status}): ${detail}`;
      return res.status(502).json({error:msg});
    }
    return res.status(200).json({openings:parseVisionReply(replyText(data))});
  } catch (err){
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    console.error("analyze failed", err);
    return res.status(timedOut ? 504 : 500).json({error:timedOut ? "The AI took too long — try again" : "Server error"});
  }
}
