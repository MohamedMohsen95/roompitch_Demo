// RoomPitch — where each room name is written on a floor plan (Cloudflare Workers AI, Moondream "point").
// The browser fills each room from these points.
//
// GET  /api/point  -> { enabled, model }
// POST /api/point  { image: "data:image/jpeg;base64,...", w, h, names: ["BEDROOM", ...] }
//                  -> { points: { BEDROOM: [[x, y], ...] } }   (fractions of the image)
//
//   CF_ACCOUNT_ID, CF_API_TOKEN   the same Cloudflare keys as api/generate.js
//   MOONDREAM_MODEL               optional: default "@cf/moondream/moondream3.1-9B-A2B"
//   ACCESS_CODE                   optional: the app must send this code (x-access-code header)
import { parsePointReply } from "../src/studio/plan/plan-vision.js";
import { guard, runModel, failed } from "./_lib/cloudflare.js";

const model = () => process.env.MOONDREAM_MODEL || "@cf/moondream/moondream3.1-9B-A2B";
const MAX_NAMES = 20;

export default async function handler(req, res){
  const body = guard(req, res, model(), (b) => Array.isArray(b.names) && b.names.every(n => typeof n === "string") ? null : "names must be a list of strings");
  if (!body) return;
  const names = [...new Set(body.names.map(n => n.trim()).filter(Boolean))].slice(0, MAX_NAMES);
  const size = {w:Number(body.w) || 1, h:Number(body.h) || 1};
  try {
    const results = await Promise.all(names.map(name => runModel(model(), {task:"point", image:body.image, target:`the text "${name}"`, max_objects:20}, 30_000)));
    const bad = results.find(r => !r.ok);
    if (bad) return res.status(bad.status).json({error:bad.error});
    const points = {};
    results.forEach((r, i) => { points[names[i]] = parsePointReply(r.data && (r.data.result || r.data), size); });
    return res.status(200).json({points});
  } catch (err){ failed(res, err, "point"); }
}
