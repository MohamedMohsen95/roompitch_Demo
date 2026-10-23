// Inspector: what's selected, its price, and the actions for it (replace, rotate, duplicate, delete...).
import { S, clampItem, findItem, selectedItem, wallArea } from "./state.js";
import { FU, WM, FM } from "./catalog.js";
import { OP, findOpening, refit, openingKind, duplicateOpening, centerOpening } from "./openings.js";
import { isAuto, supportUnder } from "./stacking.js";
import { $ } from "./utils.js";
import { update } from "./app.js";
import { renderLib } from "./library.js";
import { renderEst } from "./estimate.js";
import { t, nameOf, getLang } from "./i18n.js";
import { settings, priceOf, setPrice } from "./settings.js";
import { polyArea, toCm, toM } from "./geometry.js";

// Editable price for a finish or piece. Saved on change; the estimate and library follow.
function priceField(id, perKey){
  return `<label class="pricefield" for="priceIn"><span>${t("price")}</span>
    <input id="priceIn" type="number" min="0" step="1" inputmode="decimal" value="${priceOf(id)}" data-id="${id}">
    <span class="unit">${settings.currency} ${t(perKey)}</span></label>`;
}
function bindPrice(){
  const inp = $("#priceIn"); if (!inp) return;
  inp.addEventListener("change", () => { setPrice(inp.dataset.id, inp.value); inp.value = priceOf(inp.dataset.id); renderEst(); renderLib(); });
}

// A centimetre field for the inspector (value given in metres).
const cmField = (key, label, m, title = "") =>
  `<label class="num"${title ? ` title="${title}"` : ""}><span>${label}</span><input type="number" inputmode="numeric" step="5" min="0" data-k="${key}" value="${toCm(m)}"><em>${t("cm")}</em></label>`;

export function renderInspect(){
  const box = $("#inspect"); const s = S.sel;
  if (S.replacing){
    const old = findItem(S.replacing);
    if (old){
      box.innerHTML = `<div class="what">${t("replacing", {name:nameOf(FU[old.type])})}<em>${t("pickNew")}</em></div>
        <div class="acts"><button class="btn" type="button" id="cancelRep">${t("cancel")}</button></div>`;
      $("#cancelRep").onclick = () => { S.replacing = null; renderLib(); update(); };
      return;
    }
    S.replacing = null;
  }
  if (!s){ box.innerHTML = `<div class="what">${t("nothingSel")}<em>${t("nothingHint")}</em></div>`; return; }
  if (s.kind === "item"){
    const it = findItem(s.id); if (!it){ S.sel = null; return renderInspect(); }
    const f = FU[it.type];
    // where it sits: on the floor / on another piece (automatic), or at a height set by hand
    const under = isAuto(it) ? supportUnder(it) : null;
    const underName = under && (getLang() === "en" ? nameOf(FU[under.type]).toLowerCase() : nameOf(FU[under.type]));
    const rests = !isAuto(it) ? t("fixedHeight") : under ? t("restsOn", {name:underName}) : t("onFloor");
    box.innerHTML = `<div class="what">${nameOf(f)}<em>${Math.round(f.w * 100)}×${Math.round(f.d * 100)} ${t("cm")}</em></div>
      ${priceField(it.type, "perPiece")}
      <div class="dims">${cmField("z", t("fromFloor"), it.z || 0, t("raiseHint"))}
        <span class="rests">${rests}</span>${isAuto(it) ? "" : `<button class="btn" type="button" id="autoZ" title="${t("restOnSurfaceHint")}">${t("restOnSurface")}</button>`}</div>
      <div class="acts"><button class="btn" type="button" id="repBtn">${t("replace")}</button><button class="btn" type="button" id="rotBtn">${t("rotate")}</button><button class="btn" type="button" id="dupBtn">${t("duplicate")}</button><button class="btn danger" type="button" id="delBtn">${t("delete")}</button></div>`;
    // typing a height pins it there (e.g. a wall-mounted TV); "Rest on surface" lets it settle again
    box.querySelector('[data-k="z"]').onchange = (e) => { it.z = toM(e.target.value || 0); it.zAuto = false; clampItem(it); update(); };
    if (!isAuto(it)) $("#autoZ").onclick = () => { it.zAuto = true; update(); };
    $("#rotBtn").onclick = () => rotateSel(); $("#delBtn").onclick = () => deleteSel();
    $("#repBtn").onclick = () => { S.replacing = it.id; S.tab = "furn"; renderLib(); renderInspect(); };
    $("#dupBtn").onclick = () => { const c = {...it, id:S.nextId++, x:it.x + .3, y:it.y + .3}; clampItem(c); S.items.push(c); S.sel = {kind:"item", id:c.id}; update(); };
  } else if (s.kind === "opening"){
    const o = findOpening(s.id); if (!o){ S.sel = null; return renderInspect(); }
    box.innerHTML = `<div class="what">${nameOf(OP[openingKind(o)])}<em>${t("wallN", {n:o.wall + 1})} · ${(o.width * o.height).toFixed(1)} ${t("m2")} · ${t("dragToMove")}</em></div>
      <div class="sizes">${cmField("width", t("width"), o.width)}${cmField("height", t("height"), o.height)}${o.type === "door" ? "" : cmField("sill", t("fromFloor"), o.sill)}</div>
      <div class="acts"><button class="btn" type="button" id="dupBtn">${t("duplicate")}</button><button class="btn" type="button" id="centerBtn">${t("centerOnWall")}</button><button class="btn danger" type="button" id="delBtn">${t("delete")}</button></div>`;
    box.querySelectorAll(".sizes input").forEach(inp => inp.addEventListener("change", () => {
      const before = {...o};
      o[inp.dataset.k] = toM(inp.value || 0);
      const ok = refit(o);
      if (!ok) Object.assign(o, before);
      update();
      if (!ok) flashInspect(t("openingNoFit"));
    }));
    $("#delBtn").onclick = () => deleteSel();
    $("#dupBtn").onclick = () => {
      const c = duplicateOpening(o);
      if (!c) return flashInspect(t("hintNoRoomOnWall"));
      S.sel = {kind:"opening", id:c.id}; update();
    };
    $("#centerBtn").onclick = () => { if (centerOpening(o)) update(); };
    if (S.tab !== "open"){ S.tab = "open"; renderLib(); }
  } else if (s.kind === "wall"){
    const id = S.walls[s.id], m = WM[id];
    box.innerHTML = `<div class="what">${t("wallN", {n:s.id + 1})}<em>${nameOf(m)} · ${wallArea(s.id).toFixed(1)} ${t("m2")}</em></div>
      ${m.price || priceOf(id) ? priceField(id, "perM2") : ""}
      <div class="acts"><button class="btn" type="button" id="allBtn">${t("applyAll")}</button><button class="btn" type="button" id="delBtn">${t("removeFinish")}</button></div>`;
    $("#delBtn").onclick = () => deleteSel();
    $("#allBtn").onclick = () => { S.walls = S.walls.map(() => S.walls[s.id]); update(); };
    if (S.tab !== "wall"){ S.tab = "wall"; renderLib(); }
  } else {
    const id = S.floor, m = FM[id];
    box.innerHTML = `<div class="what">${t("floor")}<em>${nameOf(m)} · ${polyArea(S.poly).toFixed(1)} ${t("m2")}</em></div>
      ${m.price || priceOf(id) ? priceField(id, "perM2") : ""}
      <div class="acts"><button class="btn" type="button" id="delBtn">${t("removeFloor")}</button></div>`;
    $("#delBtn").onclick = () => deleteSel();
    if (S.tab !== "floor"){ S.tab = "floor"; renderLib(); }
  }
  bindPrice();
}

// A short message under the inspector title (e.g. a size that doesn't fit).
function flashInspect(msg){
  const em = $("#inspect .what em"); if (!em) return;
  em.textContent = msg; em.style.color = "var(--accent)";
}

export function rotateSel(){
  const it = selectedItem(); if (!it) return;
  it.rot = (it.rot + 90) % 360; clampItem(it); update();
}

// Delete anything: a piece or an opening is removed, a wall or the floor goes back to unfinished.
export function deleteSel(){
  const s = S.sel; if (!s) return;
  if (s.kind === "item"){ S.items = S.items.filter(i => i.id !== s.id); S.sel = null; }
  else if (s.kind === "opening"){ S.openings = S.openings.filter(o => o.id !== s.id); S.sel = null; }
  else if (s.kind === "wall") S.walls[s.id] = "bare-wall";
  else if (s.kind === "floor") S.floor = "bare-floor";
  update();
}

const anyDialogOpen = () => [...document.querySelectorAll(".modal")].some(m => !m.hidden);

export function initKeyboard(){
  document.addEventListener("keydown", e => {
    // Shortcuts only act on the studio, never while the New room screen is showing.
    const studio = document.getElementById("studioScreen");
    if (studio && studio.hidden) return;
    if (e.key === "Escape"){
      if (anyDialogOpen()){ document.querySelectorAll(".modal").forEach(m => { m.hidden = true; }); return; }
      S.sel = null; S.replacing = null; renderLib(); update(); return;
    }
    if (anyDialogOpen() || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.key === "Delete" || e.key === "Backspace") deleteSel();
    if (e.key === "r" || e.key === "R") rotateSel();
    if (e.key === "PageUp" || e.key === "PageDown"){
      // raise / lower the selected piece by 5 cm (pins its height)
      const it = selectedItem(); if (!it) return;
      e.preventDefault();
      it.z = (it.z || 0) + (e.key === "PageUp" ? .05 : -.05); it.zAuto = false; clampItem(it); update();
    }
  });
}
