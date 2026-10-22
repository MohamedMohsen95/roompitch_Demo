// "Photoreal render": snapshot the 3D view, describe the room in words, send both to /api/generate
// (Cloudflare Workers AI or fal.ai, chosen on the server) and show the result.
import { S, foot, wallLen } from "./state.js";
import { FU, EN } from "./catalog.js";
import { OT } from "./openings.js";
import { $ } from "./utils.js";
import { update } from "./app.js";
import { renderer, scene, camera } from "./three/scene.js";
import { buildRoom } from "./three/room.js";
import { refreshHelper } from "./three/items.js";
import { getLighting } from "./three/lighting.js";
import { sunWords } from "./three/sun.js";

const WALL_EN = {n:"the back wall", s:"the front wall", e:"the right-hand wall", w:"the left-hand wall"};
const FACE_EN = {0:"facing the front wall", 90:"facing the right-hand wall", 180:"facing the back wall", 270:"facing the left-hand wall"};
const ENDS = {n:["left", "right"], s:["left", "right"], w:["back", "front"], e:["back", "front"]};

function openingEn(o){
  const t = OT[o.type], c = (o.offset + o.w / 2) / wallLen(o.wall);
  const where = c < .3 ? `towards its ${ENDS[o.wall][0]} end` : c > .7 ? `towards its ${ENDS[o.wall][1]} end` : "in the middle";
  const size = `${Math.round(o.w * 100)} cm wide, ${Math.round(o.h * 100)} cm high${o.sill ? `, ${Math.round(o.sill * 100)} cm above the floor` : ""}`;
  return `${/^[aeiou]/.test(t.desc) ? "an" : "a"} ${t.desc} (${size}) on ${WALL_EN[o.wall]}, ${where}`;
}

function placeEn(it){
  if (it.type === "rug" && !it.z) return "on the floor";
  const f = foot(it), gaps = {n:it.y - f.d / 2, s:S.W - it.y - f.d / 2, w:it.x - f.w / 2, e:S.L - it.x - f.w / 2};
  const k = Object.keys(gaps).sort((a, b) => gaps[a] - gaps[b])[0];
  const where = gaps[k] < .35 ? `against ${WALL_EN[k]}` : "in the middle of the room";
  return `${heightEn(it)}${it.type === "plant" ? where : `${where}, ${FACE_EN[it.rot]}`}`;
}

// "on top of the coffee table, " / "raised 120 cm above the floor (wall-mounted), " / ""
function heightEn(it){
  const z = it.z || 0; if (z < .02) return "";
  const a = foot(it);
  const under = S.items.find(o => o !== it && Math.abs((o.z || 0) + FU[o.type].h - z) < .04 &&
    Math.abs(o.x - it.x) < (foot(o).w + a.w) / 2 && Math.abs(o.y - it.y) < (foot(o).d + a.d) / 2);
  if (under) return `standing on top of the ${EN[under.type]}, `;
  return `raised ${Math.round(z * 100)} cm above the floor${z > .4 ? " (wall-mounted or on a shelf)" : ""}, `;
}

export function describeScene(){
  const walls = ["n", "e", "s", "w"].map(k => `${WALL_EN[k]}: ${EN[S.walls[k]]}`).join("; ");
  const items = S.items.map(it => { const f = FU[it.type]; return `${EN[it.type]} (${Math.round(f.w * 100)} x ${Math.round(f.d * 100)} cm) ${placeEn(it)}`; }).join("; ");
  return [
    `Turn this simple 3D block model into a photorealistic interior design photograph of a room ${S.L} m long and ${S.W} m wide with a ${S.H} m ceiling.`,
    "Keep exactly the same camera angle, perspective, room shape, walls, windows and doors.",
    "Each coloured block is a piece of furniture: keep every piece in exactly the same position, size and orientation. Do not add, remove or move any furniture.",
    `Floor: ${EN[S.floor]}.`,
    `Walls: ${walls}.`,
    S.openings.length ? `Windows and doors: ${S.openings.map(openingEn).join("; ")}.` : "The room has no windows or doors.",
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
function snapshot(maxSide){
  const keep = S.sel; S.sel = null; buildRoom(); refreshHelper(); renderer.render(scene, camera);
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
  $("#spin").hidden = false; $("#spin").textContent = "Rendering…"; setStatus("");
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
      ? "Open this page through the server: run npm run dev and go to /studio.html"
      : "No AI keys in .env. Add CF_ACCOUNT_ID and CF_API_TOKEN, then restart the server.";
    setStatus("Rendering is off", true); return;
  }
  setStatus(`Sending to ${providerName(c.provider)}…`);
  const t0 = performance.now();
  try {
    const r = await fetch("/api/generate", {
      method:"POST",
      headers:{"Content-Type":"application/json", "x-access-code":getCode()},
      body:JSON.stringify({mode:"restyle", image:job.shot.small, prompt:job.prompt, width:job.outW, height:job.outH})
    });
    if (r.status === 401){ $("#codeRow").hidden = false; $("#spin").textContent = "Access code needed"; setStatus("Enter the code from your .env file", true); $("#accessCode").focus(); return; }
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.image){ $("#spin").textContent = data.error || `Something went wrong (${r.status})`; setStatus("Render failed", true); return; }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    $("#outImg").src = data.image; $("#outImg").hidden = false; $("#spin").hidden = true;
    $("#saveImg").href = data.image; $("#saveImg").hidden = false;
    setStatus(`Done in ${secs} s · ${providerName(c.provider)}`);
  } catch {
    $("#spin").textContent = "Could not reach the server. Make sure npm run dev is running."; setStatus("Render failed", true);
  }
}

export function initRenderDialog(){
  $("#renderBtn").onclick = () => { job = null; $("#modal").hidden = false; runRender(); };
  $("#again").onclick = () => runRender();        // same scene, new attempt
  $("#codeGo").onclick = () => { setCode($("#accessCode").value.trim()); runRender(); };
  $("#closeModal").onclick = () => { $("#modal").hidden = true; };
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal") $("#modal").hidden = true; });
}
