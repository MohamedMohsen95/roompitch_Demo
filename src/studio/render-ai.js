// "Photoreal render": snapshot the 3D view, describe the room in words, send both to /api/generate
// (Cloudflare Workers AI or fal.ai, chosen on the server) and show the result.
import { S, foot } from "./state.js";
import { FU, EN } from "./catalog.js";
import { $ } from "./utils.js";
import { update } from "./app.js";
import { renderer, scene, camera } from "./three/scene.js";
import { buildRoom, cullForCamera } from "./three/room.js";
import { refreshHelper } from "./three/items.js";
import { t } from "./i18n.js";
import { wallsOf, wallFrame, nearestWall, toCm } from "./geometry.js";
import { openingDesc } from "./openings.js";
import { getLighting } from "./three/lighting.js";
import { sunWords } from "./three/sun.js";

// Every successful render this session (newest last); the PDF proposal uses them.
export const renders = [];

// Walls are numbered 1..n going clockwise from the top-left corner of the plan.
// e.g. "a window (160 x 130 cm, 90 cm above the floor) in the middle"
function openingText(o, w){
  const c = (o.offset + o.width / 2) / w.len, d = openingDesc(o);
  const where = c < .3 ? "near the start of the wall" : c > .7 ? "near the end of the wall" : "in the middle";
  const size = `${toCm(o.width)} x ${toCm(o.height)} cm${o.sill ? `, ${toCm(o.sill)} cm above the floor` : ""}`;
  return `${/^[aeiou]/.test(d) ? "an" : "a"} ${d} (${size}) ${where}`;
}
function wallText(w){
  const ops = S.openings.filter(o => o.wall === w.i).sort((a, b) => a.offset - b.offset);
  return `wall ${w.i + 1} (${toCm(w.len)} cm${ops.length ? ", with " + ops.map(o => openingText(o, w)).join(" and ") : ""}): ${EN[S.walls[w.i]]}`;
}

// Which wall a point in front of a piece looks at: the wall hit first along the piece's front direction.
function facingWall(it, ws){
  const r = it.rot * Math.PI / 180, f = [Math.sin(r), Math.cos(r)];
  let best = null, bestT = Infinity;
  for (const w of ws){
    const {normal} = wallFrame(w); if (normal[0] * f[0] + normal[1] * f[1] > -.5) continue;
    const t = ((w.a[0] - it.x) * normal[0] + (w.a[1] - it.y) * normal[1]) / (f[0] * normal[0] + f[1] * normal[1]);
    if (!(t > 0 && t < bestT)) continue;
    // the hit point must lie on the wall segment, not just on its line
    const hx = it.x + f[0] * t, hy = it.y + f[1] * t, {dir} = wallFrame(w);
    const s = (hx - w.a[0]) * dir[0] + (hy - w.a[1]) * dir[1];
    if (s >= -1e-6 && s <= w.len + 1e-6){ bestT = t; best = w.i; }
  }
  return best;
}

// "standing on top of the coffee table, " / "raised 120 cm above the floor (wall-mounted or on a shelf), " / ""
function heightEn(it){
  const z = it.z || 0; if (z < .02) return "";
  const a = foot(it);
  const under = S.items.find(o => o !== it && Math.abs((o.z || 0) + FU[o.type].h - z) < .04 &&
    Math.abs(o.x - it.x) < (foot(o).w + a.w) / 2 && Math.abs(o.y - it.y) < (foot(o).d + a.d) / 2);
  if (under) return `standing on top of the ${EN[under.type]}, `;
  return `raised ${toCm(z)} cm above the floor${z > .4 ? " (wall-mounted or on a shelf)" : ""}, `;
}

function placeEn(it, ws){
  if (it.type === "rug" && !it.z) return "on the floor";
  const fp = foot(it), near = nearestWall(it.x, it.y, S.poly, Math.max(fp.w, fp.d) / 2 + .35);
  const where = near == null ? "in the middle of the room" : `against wall ${near + 1}`;
  const face = facingWall(it, ws);
  return heightEn(it) + (it.type === "plant" || face == null ? where : `${where}, facing wall ${face + 1}`);
}

export function describeScene(){
  const ws = wallsOf(S.poly);
  const shape = S.poly.length === 4 ? "rectangular" : "L-shaped";
  const items = S.items.map(it => { const f = FU[it.type]; return `${EN[it.type]} (${Math.round(f.w * 100)} x ${Math.round(f.d * 100)} cm) ${placeEn(it, ws)}`; }).join("; ");
  return [
    `Turn this simple 3D block model into a photorealistic interior design photograph of a ${shape} room, ${toCm(S.L)} x ${toCm(S.W)} cm, with a ${toCm(S.H)} cm ceiling.`,
    "Keep exactly the same camera angle, perspective, room shape, walls, doors and windows.",
    "Each coloured block is a piece of furniture: keep every piece in exactly the same position, size and orientation. Do not add, remove or move any furniture.",
    `Floor: ${EN[S.floor]}.`,
    `Walls, numbered clockwise: ${ws.map(wallText).join("; ")}.`,
    items ? `Furniture: ${items}.` : "The room has no furniture.",
    `Light: ${getLighting().prompt}; ${sunWords()}.`,
    "Realistic materials, textures and shadows, professional architectural interior photography, high detail. No people, no text, no watermark."
  ].join(" ").slice(0, 2900); // the server rejects prompts over 3000 characters
}

let cfg = null, job = null;
async function getCfg(){
  if (cfg) return cfg;
  try { const r = await fetch("/api/generate"); cfg = await r.json(); }
  catch { cfg = {aiEnabled:false, offline:true}; }
  return cfg;
}
// The access code is shared with the main app's Studio settings.
const getCode = () => { try { return JSON.parse(localStorage.getItem("rp_settings") || "{}").accessCode || ""; } catch { return ""; } };
const setCode = (v) => { try { const s = JSON.parse(localStorage.getItem("rp_settings") || "{}"); s.accessCode = v; localStorage.setItem("rp_settings", JSON.stringify(s)); } catch {} };

// Capture the 3D view without the selection outline. `small` respects the provider's input size limit.
export function snapshot(maxSide = 1600){
  // Rebuilding the room makes fresh wall meshes, so hide the walls/ceiling in front of the camera
  // again before this one-off render (the render loop normally does that every frame).
  const keep = S.sel; S.sel = null; buildRoom(); refreshHelper(); cullForCamera(camera); renderer.render(scene, camera);
  const src = renderer.domElement, k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.max(8, Math.floor(src.width * k / 8) * 8); c.height = Math.max(8, Math.floor(src.height * k / 8) * 8);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  const shot = {full:src.toDataURL("image/jpeg", .9), small:c.toDataURL("image/jpeg", .92), aspect:src.width / src.height};
  S.sel = keep; update();
  return shot;
}

function setStatus(msg, err = false){ const s = $("#mStatus"); s.textContent = msg; s.classList.toggle("err", err); }
const providerName = (p) => p === "cloudflare" ? "Cloudflare Workers AI" : p;

async function runRender(){
  $("#codeRow").hidden = true; $("#outImg").hidden = true; $("#saveImg").hidden = true;
  $("#spin").hidden = false; $("#spin").textContent = t("rendering"); setStatus("");
  const c = await getCfg();
  if (!job){
    const shot = snapshot(c.maxInputSide || 1024);
    const outW = shot.aspect >= 1 ? 1024 : Math.round(1024 * shot.aspect);
    const outH = shot.aspect >= 1 ? Math.round(1024 / shot.aspect) : 1024;
    job = {shot, prompt:describeScene(), outW, outH};
  }
  $("#shot").src = job.shot.full; $("#promptTxt").textContent = job.prompt;
  if (!c.aiEnabled){
    $("#spin").textContent = c.offline
      ? t("offline")
      : t("noKeys");
    setStatus(t("renderOff"), true); return;
  }
  setStatus(t("sending", {p:providerName(c.provider)}));
  const t0 = performance.now();
  try {
    const r = await fetch("/api/generate", {
      method:"POST",
      headers:{"Content-Type":"application/json", "x-access-code":getCode()},
      body:JSON.stringify({mode:"restyle", image:job.shot.small, prompt:job.prompt, width:job.outW, height:job.outH})
    });
    if (r.status === 401){ $("#codeRow").hidden = false; $("#spin").textContent = t("codeNeeded"); setStatus(t("enterCode"), true); $("#accessCode").focus(); return; }
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.image){ $("#spin").textContent = data.error || t("wentWrong", {s:r.status}); setStatus(t("failed"), true); return; }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    $("#outImg").src = data.image; $("#outImg").hidden = false; $("#spin").hidden = true;
    $("#saveImg").href = data.image; $("#saveImg").hidden = false;
    setStatus(t("done", {s:secs, p:providerName(c.provider)}));
    renders.push({src:data.image, at:Date.now()});
  } catch {
    $("#spin").textContent = t("noServer"); setStatus(t("failed"), true);
  }
}

export function initRenderDialog(){
  $("#renderBtn").onclick = () => { job = null; $("#modal").hidden = false; runRender(); };
  $("#again").onclick = () => runRender();        // same scene, new attempt
  $("#codeGo").onclick = () => { setCode($("#accessCode").value.trim()); runRender(); };
  $("#closeModal").onclick = () => { $("#modal").hidden = true; };
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal") $("#modal").hidden = true; });
}
