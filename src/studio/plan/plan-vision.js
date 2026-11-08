// What the AI does when reading a floor plan: read the room names and the sizes written in them (the plan
// model), and point at where each name is written (Moondream). It never draws outlines: those come from
// the walls (walls.js, rooms.js). No DOM: shared by the browser and api/plan.js, api/point.js.

export const TEXT_PROMPT = [
  "This image is an architectural floor plan seen from above. It may show one room or a whole flat.",
  "List every room name written on the plan (for example BEDROOM, LIVING / DINING, KITCHEN, BATH 2, BALCONY), each time it is written: a name written three times is listed three times.",
  "For each, copy exactly the room size written with that name (for example 12'-0\" X 14'-6\" or 3.5 x 4 m), or null, and the area written with it (for example 64 sq ft or 12 m²), or null.",
  "Do not list furniture, fixtures, dimension chains along the outside, door or window tags, or text from the title block, legend or company details.",
  'Reply with JSON only, no other text, in this form: {"rooms":[{"name":"BEDROOM","size":"11\'-0\\" X 12\'-6\\"","area":null}]}. If there are no room names, reply {"rooms":[]}.'
].join(" ");

// First {...} in the text that parses as JSON and has the given array field.
function firstJson(text, field){
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)){
    let depth = 0, inStr = false;
    for (let i = start; i < text.length; i++){
      const ch = text[i];
      if (inStr){ if (ch === "\\") i++; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0){
        try { const o = JSON.parse(text.slice(start, i + 1)); if (o && Array.isArray(o[field])) return o; } catch { /* keep looking */ }
        break;
      }
    }
  }
  return null;
}

const str = (v) => typeof v === "string" && v.trim() ? v.trim() : null;

// -> {rooms:[{name, size, area}]}, usable entries only.
export function parseTextReply(text){
  if (typeof text !== "string" || !text) return {rooms:[]};
  const o = firstJson(text, "rooms");
  if (!o) return {rooms:[]};
  return {rooms:o.rooms.filter(r => r && str(r.name)).slice(0, 60).map(r => ({name:str(r.name), size:str(r.size), area:str(r.area)}))};
}

// Moondream's point reply -> [[x, y]] as fractions of the image. Accepts {x, y} or [x, y] items, as
// fractions or as pixels of an image of the given size; drops anything outside the image.
export function parsePointReply(json, {w, h}){
  const items = json && Array.isArray(json.points) ? json.points : [];
  const out = [];
  for (const it of items){
    let x = Array.isArray(it) ? it[0] : it && it.x, y = Array.isArray(it) ? it[1] : it && it.y;
    if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) continue;
    if (x > 1.02 || y > 1.02){ x /= w; y /= h; }
    if (x < -0.02 || y < -0.02 || x > 1.02 || y > 1.02) continue;
    out.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
  }
  return out;
}
