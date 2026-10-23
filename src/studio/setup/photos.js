// Photo path of the "New room" screen: add photos, tag each with a wall, ask the AI for doors and windows.
import { $ } from "../utils.js";
import { t } from "../i18n.js";
import { addPhotos, applyAnalysis } from "./draft.js";
import { getDraft, setPhotoHooks, redraw } from "./screen.js";

let active = null;      // id of the selected photo
let busy = false;
let lastKey = "";

const getCode = () => { try { return JSON.parse(localStorage.getItem("rp_settings") || "{}").accessCode || ""; } catch { return ""; } };
const setCode = (v) => { try { const s = JSON.parse(localStorage.getItem("rp_settings") || "{}"); s.accessCode = v; localStorage.setItem("rp_settings", JSON.stringify(s)); } catch { /* ignore */ } };

// Downscale to at most 1024 px on the long side, as JPEG.
function readPhoto(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", .88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}

function status(msg, err = false){ const s = $("#photoStatus"); s.textContent = msg; s.classList.toggle("err", err); }

function render(draft, walls){
  const list = $("#photoList");
  // Only rebuild when photos, tags, the selection, the walls or the language changed (not on every keystroke).
  const key = [active, t("whichWall"), walls.map(w => w.i).join(","), ...draft.photos.map(p => p.id + ":" + p.wall)].join("|");
  $("#analyzeBtn").disabled = busy || !draft.photos.length;
  if (key === lastKey) return;
  lastKey = key;
  list.innerHTML = draft.photos.map(p => `
    <figure class="ph${p.id === active ? " on" : ""}" data-id="${p.id}">
      <img src="${p.dataUrl}" alt="">
      <figcaption>
        <select data-f="wall" aria-label="${t("onWall")}">
          <option value=""${p.wall == null ? " selected" : ""}>${t("whichWall")}</option>
          ${walls.map(w => `<option value="${w.i}"${w.i === p.wall ? " selected" : ""}>${t("wallN", {n:w.i + 1})}</option>`).join("")}
        </select>
        <button class="btn small" type="button" data-act="del">${t("removePhoto")}</button>
      </figcaption>
    </figure>`).join("");
}

async function analyze(){
  const d = getDraft(), tagged = d.photos.filter(p => p.wall != null);
  if (!tagged.length){ status(t("needTag"), true); return; }
  busy = true; $("#analyzeBtn").disabled = true; $("#codeRow2").hidden = true;
  let found = 0;
  try {
    for (let i = 0; i < tagged.length; i++){
      status(t("analyzing", {i:i + 1, n:tagged.length}));
      let r;
      try {
        r = await fetch("/api/analyze", {method:"POST", headers:{"Content-Type":"application/json", "x-access-code":getCode()}, body:JSON.stringify({image:tagged[i].dataUrl})});
      } catch { status(t("noServer"), true); return; }
      if (r.status === 401){ $("#codeRow2").hidden = false; status(t("enterCode"), true); $("#accessCode2").focus(); return; }
      const data = await r.json().catch(() => ({}));
      if (r.status === 503){ status(t("analysisOff"), true); return; }
      if (!r.ok){ status(data.error || t("wentWrong", {s:r.status}), true); return; }
      found += applyAnalysis(d, tagged[i].wall, data.openings || []);
      redraw();
    }
    const skipped = d.photos.length - tagged.length;
    status((found ? t("analyzeDone", {n:found}) : t("analyzeNone")) + (skipped ? " " + t("untagged", {n:skipped}) : ""));
  } finally {
    busy = false; $("#analyzeBtn").disabled = !getDraft().photos.length;
  }
}

export function initPhotos(){
  $("#photoSection").innerHTML = `
    <h2 data-i18n="photosTitle">${t("photosTitle")}</h2>
    <p class="dnote" data-i18n="photosHint">${t("photosHint")}</p>
    <div class="acts2"><label class="btn filebtn" for="photoInput"><span data-i18n="addPhotos">${t("addPhotos")}</span><input id="photoInput" type="file" accept="image/*" multiple></label></div>
    <div class="photos" id="photoList"></div>
    <div class="acts2"><button class="btn primary" id="analyzeBtn" type="button" data-i18n="analyze">${t("analyze")}</button></div>
    <p class="dnote" id="photoStatus" role="status"></p>
    <div class="coderow" id="codeRow2" hidden>
      <label for="accessCode2" data-i18n="accessLabel">${t("accessLabel")}</label>
      <input id="accessCode2" type="password" autocomplete="off">
      <button class="btn" id="codeGo2" type="button" data-i18n="send">${t("send")}</button>
    </div>`;

  $("#photoInput").addEventListener("change", async e => {
    const files = [...(e.target.files || [])].filter(f => f.type.startsWith("image/")); e.target.value = "";
    const read = [];
    for (const f of files){ try { read.push({id:"p" + Date.now().toString(36) + read.length, dataUrl:await readPhoto(f)}); } catch { /* skip non-images */ } }
    const d = getDraft(), r = addPhotos(d, read);
    if (r.added) active = d.photos[d.photos.length - r.added].id;
    status(r.skipped ? t("tooMany", {n:r.skipped}) : "", Boolean(r.skipped));
    redraw();
  });
  const list = $("#photoList");
  list.addEventListener("change", e => {
    if (e.target.dataset.f !== "wall") return;
    const p = getDraft().photos.find(x => x.id === e.target.closest(".ph").dataset.id);
    p.wall = e.target.value === "" ? null : +e.target.value; active = p.id; redraw();
  });
  list.addEventListener("click", e => {
    const fig = e.target.closest(".ph"); if (!fig) return;
    const d = getDraft();
    if (e.target.dataset.act === "del"){ d.photos = d.photos.filter(p => p.id !== fig.dataset.id); if (active === fig.dataset.id) active = null; redraw(); return; }
    if (e.target.tagName === "IMG"){ active = fig.dataset.id; redraw(); }
  });
  $("#analyzeBtn").onclick = analyze;
  $("#codeGo2").onclick = () => { setCode($("#accessCode2").value.trim()); analyze(); };

  setPhotoHooks({
    render,
    activeWall:() => { const p = getDraft().photos.find(x => x.id === active); return p ? p.wall : null; },
    onWallClick:(i) => { const p = getDraft().photos.find(x => x.id === active); if (p){ p.wall = i; redraw(); } }
  });
}
