// Reading a floor plan with the vision model: the question asked, reading its answer, and turning
// it into a flat. No DOM: shared by the browser and api/plan.js.
import { newFlat, orientCW, scaleFromSizes } from "./flat.js";

export const PLAN_PROMPT = [
  "This image is an architectural floor plan seen from above. It may show one room or a whole flat.",
  "Find every space (room, hall, kitchen, bathroom, balcony). An open area that is not separated by walls, such as a living and dining area, is ONE space.",
  "Ignore furniture, fixtures, text that is not a room name or size, dimension lines and hatching.",
  "For each space give its outline along the inside face of its walls, as corner points in order, with coordinates as fractions of the image (x: 0 = left edge, 1 = right edge; y: 0 = top edge, 1 = bottom edge).",
  "Give its name as written on the plan (or an empty string) and its size text copied exactly as written (for example 12'-0\" X 29'-10\" or 3.5 x 4 m), or null when no size is written.",
  "Find every door and window and give each as a segment along its wall, from (x1, y1) to (x2, y2), in the same fractions.",
  'Reply with JSON only, no other text, in this form: {"spaces":[{"name":"LIVING","outline":[[0.1,0.1],[0.5,0.1],[0.5,0.6],[0.1,0.6]],"size":"13\' x 16\'"}],"openings":[{"type":"door","x1":0.5,"y1":0.2,"x2":0.5,"y2":0.28}]}.',
  'type is "door" or "window".'
].join(" ");

const TOL = 0.05;
const ok01 = (v) => typeof v === "number" && isFinite(v) && v >= -TOL && v <= 1 + TOL;
const c01 = (v) => Math.min(1, Math.max(0, v));

function firstJson(text){
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)){
    let depth = 0, inStr = false;
    for (let i = start; i < text.length; i++){
      const ch = text[i];
      if (inStr){ if (ch === "\\") i++; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0){
        try {
          const o = JSON.parse(text.slice(start, i + 1));
          if (o && (Array.isArray(o.spaces) || Array.isArray(o.openings))) return o;
        } catch { /* keep looking */ }
        break;
      }
    }
  }
  return null;
}

// -> {spaces:[{name, outline, size}], openings:[{type, x1, y1, x2, y2}]}, usable parts only.
export function parsePlanReply(text){
  const out = {spaces:[], openings:[]};
  if (typeof text !== "string" || !text) return out;
  const o = firstJson(text); if (!o) return out;
  for (const s of Array.isArray(o.spaces) ? o.spaces : []){
    if (!s || !Array.isArray(s.outline) || s.outline.length < 3) continue;
    if (!s.outline.every(p => Array.isArray(p) && p.length >= 2 && ok01(p[0]) && ok01(p[1]))) continue;
    out.spaces.push({
      name:typeof s.name === "string" ? s.name.trim() : "",
      outline:s.outline.map(p => [c01(p[0]), c01(p[1])]),
      size:typeof s.size === "string" && s.size.trim() ? s.size.trim() : null
    });
  }
  for (const it of Array.isArray(o.openings) ? o.openings : []){
    if (!it || (it.type !== "door" && it.type !== "window")) continue;
    if (![it.x1, it.y1, it.x2, it.y2].every(ok01)) continue;
    const r = {type:it.type, x1:c01(it.x1), y1:c01(it.y1), x2:c01(it.x2), y2:c01(it.y2)};
    if (r.x1 !== r.x2 || r.y1 !== r.y2) out.openings.push(r);
  }
  return out;
}

const px = (v) => Math.round(v * 10) / 10;

// A parsed reply -> a flat in image pixels, everything marked as found by the AI.
export function flatFromReply(reply, image){
  const f = newFlat(image), {w, h} = image;
  f.spaces = (reply.spaces || []).map((s, i) => ({
    id:"s" + (i + 1), name:s.name || "", outline:orientCW(s.outline.map(p => [px(p[0] * w), px(p[1] * h)])),
    sizeText:s.size ?? null, status:"todo", design:null, fromAI:true
  }));
  f.openings = (reply.openings || []).map((o, i) => ({
    id:"o" + (i + 1), type:o.type, a:[px(o.x1 * w), px(o.y1 * h)], b:[px(o.x2 * w), px(o.y2 * h)],
    heightCm:o.type === "door" ? 210 : 120, sillCm:o.type === "door" ? 0 : 90, fromAI:true
  }));
  const {scale} = scaleFromSizes(f);
  f.scale = scale; f.scaleFrom = scale ? "sizes" : null;
  return f;
}
