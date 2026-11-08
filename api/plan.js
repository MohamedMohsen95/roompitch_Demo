// RoomPitch — read the room names and written sizes on a floor plan (Cloudflare Workers AI vision model).
// The outlines come from the walls in the browser; this only reads text.
//
// GET  /api/plan  -> { enabled, model }
// POST /api/plan  { image: "data:image/jpeg;base64,..." }  -> { rooms: [{name, size, area}] }
//
//   CF_ACCOUNT_ID, CF_API_TOKEN   the same Cloudflare keys as api/generate.js
//   CF_PLAN_MODEL                 optional: falls back to CF_VISION_MODEL, then "@cf/meta/llama-4-scout-17b-16e-instruct"
//   ACCESS_CODE                   optional: the app must send this code (x-access-code header)
import { TEXT_PROMPT, parseTextReply } from "../src/studio/plan/plan-vision.js";
import { guard, runModel, replyText, failed } from "./_lib/cloudflare.js";

const model = () => process.env.CF_PLAN_MODEL || process.env.CF_VISION_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";

export default async function handler(req, res){
  const body = guard(req, res, model());
  if (!body) return;
  try {
    const r = await runModel(model(), {
      messages:[{role:"user", content:[{type:"text", text:TEXT_PROMPT}, {type:"image_url", image_url:{url:body.image}}]}],
      max_tokens:1500, temperature:0
    });
    if (!r.ok) return res.status(r.status).json({error:r.error});
    return res.status(200).json(parseTextReply(replyText(r.data)));
  } catch (err){ failed(res, err, "plan"); }
}
