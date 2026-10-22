// Finding doors and windows in a photo of one wall: the question asked of the vision model,
// reading its answer, and turning it into openings. No DOM: shared by the browser and api/analyze.js.

export const VISION_PROMPT = [
  "This photo shows one wall of a room, seen from inside. Find every door and every window on that main wall.",
  "Ignore furniture, pictures, mirrors, cabinets, and openings on other walls.",
  "Give each one's edges as fractions of the wall as seen in the photo:",
  "left and right go across the wall's width (0 = the wall's left end, 1 = its right end);",
  "top and bottom go down the wall's height (0 = the ceiling line, 1 = the floor line).",
  'Reply with JSON only, no other text, in this form: {"openings":[{"type":"door","left":0.1,"right":0.28,"top":0.25,"bottom":1}]}.',
  'type is "door" or "window". If there are none, reply {"openings":[]}.'
].join(" ");

const TOL = 0.05;
const near01 = (v) => typeof v === "number" && isFinite(v) && v >= -TOL && v <= 1 + TOL;
const c01 = (v) => Math.min(1, Math.max(0, v));

// First {...} block in the text that parses as JSON with an "openings" array.
function firstJson(text){
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)){
    let depth = 0;
    for (let i = start; i < text.length; i++){
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0){
        try { const o = JSON.parse(text.slice(start, i + 1)); if (o && Array.isArray(o.openings)) return o; } catch { /* keep looking */ }
        break;
      }
    }
  }
  return null;
}

// -> [{type, left, right, top, bottom}] with usable values only; [] when nothing is usable.
export function parseVisionReply(text){
  if (typeof text !== "string" || !text) return [];
  const o = firstJson(text); if (!o) return [];
  const out = [];
  for (const it of o.openings){
    if (!it || (it.type !== "door" && it.type !== "window")) continue;
    if (![it.left, it.right, it.top, it.bottom].every(near01)) continue;
    const r = {type:it.type, left:c01(it.left), right:c01(it.right), top:c01(it.top), bottom:c01(it.bottom)};
    if (r.left < r.right && r.top < r.bottom) out.push(r);
  }
  return out;
}

const cm = (m) => Math.round(m * 100) / 100;

// Fractions of the tagged wall -> openings in metres (whole cm), marked as found by the AI.
export function openingsFromFractions(list, {wall, wallLen, H}){
  return list.map((f, n) => ({
    id:`ai-${wall}-${n}`,
    type:f.type,
    wall,
    offset:cm(f.left * wallLen),
    width:cm((f.right - f.left) * wallLen),
    height:cm((f.bottom - f.top) * H),
    sill:f.type === "door" ? 0 : cm((1 - f.bottom) * H),
    fromAI:true
  }));
}
