// RoomPitch — where each room name is written on a floor plan (Cloudflare Workers AI, Moondream "point").
// The browser fills each room from these points.
//
// GET  /api/point  -> { enabled, model }
// POST /api/point  { image: "data:image/jpeg;base64,...", w, h, names: ["BEDROOM", ...] }
//                  -> { points: { BEDROOM: [[x, y], ...] }, failed: [names] }   (fractions of the image)
//
//   CF_ACCOUNT_ID, CF_API_TOKEN   the same Cloudflare keys as api/generate.js
//   MOONDREAM_MODEL               optional: default "@cf/moondream/moondream3.1-9B-A2B"
//   ACCESS_CODE                   optional: the app must send this code (x-access-code header)
import { parsePointReply } from "../src/studio/plan/plan-vision.js";
import { guard, runModel, failed } from "./_lib/cloudflare.js";

const model = () => process.env.MOONDREAM_MODEL || "@cf/moondream/moondream3.1-9B-A2B";
const MAX_NAMES = 20, CONCURRENT = 4;

export default async function handler(req, res){
  const body = guard(req, res, model(), (b) => Array.isArray(b.names) && b.names.every(n => typeof n === "string") ? null : "names must be a list of strings");
  if (!body) return;
  const names = [...new Set(body.names.map(n => n.trim()).filter(Boolean))].slice(0, MAX_NAMES);
  const size = {w:Number(body.w) || 1, h:Number(body.h) || 1};
  try {
    // a few at a time (the free plan limits concurrent requests); a name that fails just has no points
    const results = new Array(names.length);
    for (let i = 0; i < names.length; i += CONCURRENT){
      const batch = names.slice(i, i + CONCURRENT).map((name, k) => runModel(model(), {task:"point", image:body.image, target:`the text "${name}"`, max_objects:20}, 25_000)
        .catch(err => ({ok:false, status:504, error:String(err && err.name === "TimeoutError" ? "The AI took too long — try again" : "Server error")}))
        .then(r => { results[i + k] = r; }));
      await Promise.all(batch);
    }
    if (results.every(r => !r.ok)) return res.status(results[0]?.status || 502).json({error:results[0]?.error || "No points"});
    const points = {};
    results.forEach((r, i) => { if (r.ok) points[names[i]] = parsePointReply(r.data && (r.data.result || r.data), size); });
    return res.status(200).json({points, failed:names.filter((_, i) => !results[i].ok)});
  } catch (err){ failed(res, err, "point"); }
}
