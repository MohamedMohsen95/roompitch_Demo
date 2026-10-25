// Screen 1, "New room": choose how to start, set the shape and size in cm, place doors and windows,
// then hand the room to the studio. The photo path (setup/photos.js) plugs into the same form.
import { $ } from "../utils.js";
import { t } from "../i18n.js";
import { newDraft, newOpening, draftWalls, draftToRoom, fitDraftToWalls } from "./draft.js";
import { renderPreview, initPreview } from "./preview.js";

let draft = newDraft("manual");
let keepDesign = false;
let onStart = () => {};
let onChoose = () => {};      // the "How do you want to start?" view was shown (main.js refreshes the projects)
let photoHooks = null;        // set by photos.js: {render(draft), activeWall()}
let last = {ok:false, room:null, shapeError:null, openingErrors:{}};

export const getDraft = () => draft;
export const setPhotoHooks = (hooks) => { photoHooks = hooks; };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const ERR_KEY = {beyondWall:"errBeyondWall", tooTall:"errTooTall", overlap:"errOverlap", tooSmall:"errTooSmall"};
const SHAPE_FIELDS = [["#suLength", "lengthCm"], ["#suWidth", "widthCm"], ["#suHeight", "heightCm"], ["#suCutLength", "cutLengthCm"], ["#suCutWidth", "cutWidthCm"]];

/* ───────── Screens ───────── */

export function showStudio(){ $("#setupScreen").hidden = true; $("#studioScreen").hidden = false; window.dispatchEvent(new Event("resize")); }

// keep: true when coming back from the studio (furniture and finishes are kept).
export function showSetup({keepDesign:keep = false, draft:d = null, canContinue = false} = {}){
  keepDesign = keep;
  $("#studioScreen").hidden = true; $("#setupScreen").hidden = false;
  $("#continueLast").hidden = !canContinue;
  if (d){ draft = d; openForm(); } else showChoose();
  window.scrollTo(0, 0);
}

function showChoose(){ $("#setupChoose").hidden = false; $("#setupForm").hidden = true; onChoose(); }

function openForm(){
  $("#setupChoose").hidden = true; $("#setupForm").hidden = false;
  $("#photoSection").hidden = draft.mode !== "photos";
  fillShape(); refresh(true);
}

/* ───────── Form ───────── */

function fillShape(){
  for (const [sel, key] of SHAPE_FIELDS) $(sel).value = draft[key];
  document.querySelectorAll("[name=suShape]").forEach(r => { r.checked = r.value === draft.shape; });
  $("#suCorner").value = draft.corner;
  $("#cutFields").hidden = draft.shape !== "L";
}

// Recompute the room, then redraw. full=true also rebuilds the openings list (not while typing in it).
function refresh(full){
  fitDraftToWalls(draft);
  last = draftToRoom(draft);
  const walls = draftWalls(draft);
  $("#shapeError").textContent = last.shapeError ? t("err_" + last.shapeError) : "";
  $("#wallList").innerHTML = walls.map(w => `<li><span class="wn">${w.i + 1}</span><bdi dir="ltr">${w.lenCm} ${t("cm")}</bdi></li>`).join("");
  if (full) renderOpenings(walls);
  else markErrors();
  renderPreview($("#setupPreview"), last.room, {errors:last.openingErrors, activeWall:photoHooks ? photoHooks.activeWall() : null});
  $("#startDesign").disabled = !last.ok;
  if (photoHooks) photoHooks.render(draft, walls);
}

function num(label, field, o, extra = ""){
  return `<label><span>${t(label)}</span><input type="number" min="0" step="1" inputmode="numeric" data-f="${field}" value="${o[field]}" ${extra}><small>${t("cm")}</small></label>`;
}

function renderOpenings(walls){
  const box = $("#openList");
  if (!draft.openings.length){ box.innerHTML = `<p class="dnote">${t("noOpenings")}</p>`; return; }
  box.innerHTML = draft.openings.map(o => `
    <div class="orow${o.fromAI ? " ai" : ""}" data-id="${o.id}">
      <div class="ohead">
        <strong>${t(o.type === "door" ? "door1" : "window1")}</strong>
        ${o.fromAI ? `<span class="aitag">${t("foundByAI")}</span>` : ""}
        <label class="owall"><span>${t("onWall")}</span><select data-f="wall">${walls.map(w => `<option value="${w.i}"${w.i === o.wall ? " selected" : ""}>${w.i + 1}</option>`).join("")}</select></label>
        <button class="btn small" type="button" data-act="del">${t("remove")}</button>
      </div>
      <div class="ofields">
        ${num("fromCorner", "offsetCm", o)}${num("oWidth", "widthCm", o)}${num("oHeight", "heightCm", o)}${o.type === "window" ? num("oSill", "sillCm", o) : ""}
      </div>
      <p class="oerr" data-err></p>
    </div>`).join("");
  markErrors();
}

function markErrors(){
  document.querySelectorAll("#openList .orow").forEach(row => {
    const e = last.openingErrors[row.dataset.id];
    row.classList.toggle("bad", Boolean(e));
    row.querySelector("[data-err]").textContent = e ? t(ERR_KEY[e]) : "";
  });
}

function bindForm(){
  for (const [sel, key] of SHAPE_FIELDS){
    $(sel).addEventListener("input", e => { draft[key] = Math.round(+e.target.value || 0); refresh(false); });
    $(sel).addEventListener("change", () => refresh(true));
  }
  document.querySelectorAll("[name=suShape]").forEach(r => r.addEventListener("change", () => { draft.shape = r.value; $("#cutFields").hidden = draft.shape !== "L"; refresh(true); }));
  $("#suCorner").addEventListener("change", e => { draft.corner = e.target.value; refresh(true); });
  $("#addDoor").onclick = () => { draft.openings.push(newOpening("door", 0, draft)); refresh(true); };
  $("#addWindow").onclick = () => { draft.openings.push(newOpening("window", 0, draft)); refresh(true); };

  const list = $("#openList");
  const rowOf = (el) => draft.openings.find(o => o.id === el.closest(".orow").dataset.id);
  list.addEventListener("input", e => {
    const f = e.target.dataset.f; if (!f) return;
    const o = rowOf(e.target);
    o[f] = Math.round(+e.target.value || 0); o.fromAI = false;
    refresh(false);
  });
  list.addEventListener("change", e => {
    const f = e.target.dataset.f; if (!f) return;
    const o = rowOf(e.target);
    if (f === "wall"){
      // Moving to another wall: centre it there, so it fits whenever the wall is long enough.
      o.wall = +e.target.value; o.fromAI = false;
      const w = draftWalls(draft)[o.wall]; if (w) o.offsetCm = Math.max(0, Math.round((w.lenCm - o.widthCm) / 2));
    }
    refresh(true);
  });
  list.addEventListener("click", e => {
    if (e.target.dataset.act !== "del") return;
    const o = rowOf(e.target); draft.openings = draft.openings.filter(x => x !== o); refresh(true);
  });

  initPreview($("#setupPreview"), {
    getRoom:() => last.room,
    onMove:(id, offsetCm) => { const o = draft.openings.find(x => x.id === id); if (o){ o.offsetCm = offsetCm; o.fromAI = false; } refresh(false); syncOffsets(); },
    onEnd:() => refresh(true),
    onWallClick:(i) => { if (photoHooks && photoHooks.onWallClick) photoHooks.onWallClick(i); }
  });
}

// While dragging in the preview, keep the "From corner" boxes in step without rebuilding the list.
function syncOffsets(){
  for (const o of draft.openings){
    const inp = document.querySelector(`#openList .orow[data-id="${CSS.escape(o.id)}"] [data-f="offsetCm"]`);
    if (inp && document.activeElement !== inp) inp.value = o.offsetCm;
  }
}

export const redraw = () => refresh(true);

export function initSetup({onStart:start, onContinue, onChoose:choose}){
  onStart = start; if (choose) onChoose = choose;
  $("#chooseManual").onclick = () => { draft = newDraft("manual"); keepDesign = false; openForm(); };
  $("#choosePhotos").onclick = () => { draft = newDraft("photos"); keepDesign = false; openForm(); };
  $("#continueLast").onclick = () => onContinue();
  $("#setupBack").onclick = showChoose;
  $("#startDesign").onclick = () => { last = draftToRoom(draft); if (last.ok) onStart(last.room, {keepDesign, draft}); };
  bindForm();
}

// Re-fill text after a language change.
export function relabelSetup(){ if (!$("#setupForm").hidden) refresh(true); }
export { esc };
