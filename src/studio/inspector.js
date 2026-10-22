// Inspector: what's selected, its price, and the actions for it (replace, rotate, duplicate, delete...).
import { S, clampItem, findItem, selectedItem, wallArea } from "./state.js";
import { FU, WM, FM } from "./catalog.js";
import { $ } from "./utils.js";
import { update } from "./app.js";
import { renderLib } from "./library.js";
import { renderEst } from "./estimate.js";
import { t, nameOf } from "./i18n.js";
import { settings, priceOf, setPrice } from "./settings.js";

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
    box.innerHTML = `<div class="what">${nameOf(f)}<em>${Math.round(f.w * 100)}×${Math.round(f.d * 100)} ${t("cm")}</em></div>
      ${priceField(it.type, "perPiece")}
      <div class="acts"><button class="btn" type="button" id="repBtn">${t("replace")}</button><button class="btn" type="button" id="rotBtn">${t("rotate")}</button><button class="btn" type="button" id="dupBtn">${t("duplicate")}</button><button class="btn" type="button" id="delBtn">${t("delete")}</button></div>`;
    $("#rotBtn").onclick = () => rotateSel(); $("#delBtn").onclick = () => deleteSel();
    $("#repBtn").onclick = () => { S.replacing = it.id; S.tab = "furn"; renderLib(); renderInspect(); };
    $("#dupBtn").onclick = () => { const c = {...it, id:S.nextId++, x:it.x + .3, y:it.y + .3}; clampItem(c); S.items.push(c); S.sel = {kind:"item", id:c.id}; update(); };
  } else if (s.kind === "wall"){
    const id = S.walls[s.id], m = WM[id];
    box.innerHTML = `<div class="what">${t("wall_" + s.id)}<em>${nameOf(m)} · ${wallArea(s.id).toFixed(1)} ${t("m2")}</em></div>
      ${m.price || priceOf(id) ? priceField(id, "perM2") : ""}
      <div class="acts"><button class="btn" type="button" id="allBtn">${t("applyAll")}</button><button class="btn" type="button" id="delBtn">${t("removeFinish")}</button></div>`;
    $("#delBtn").onclick = () => deleteSel();
    $("#allBtn").onclick = () => { for (const k in S.walls) S.walls[k] = S.walls[s.id]; update(); };
    if (S.tab !== "wall"){ S.tab = "wall"; renderLib(); }
  } else {
    const id = S.floor, m = FM[id];
    box.innerHTML = `<div class="what">${t("floor")}<em>${nameOf(m)} · ${(S.L * S.W).toFixed(1)} ${t("m2")}</em></div>
      ${m.price || priceOf(id) ? priceField(id, "perM2") : ""}
      <div class="acts"><button class="btn" type="button" id="delBtn">${t("removeFloor")}</button></div>`;
    $("#delBtn").onclick = () => deleteSel();
    if (S.tab !== "floor"){ S.tab = "floor"; renderLib(); }
  }
  bindPrice();
}

export function rotateSel(){
  const it = selectedItem(); if (!it) return;
  it.rot = (it.rot + 90) % 360; clampItem(it); update();
}

// Delete anything: a piece is removed, a wall or the floor goes back to unfinished.
export function deleteSel(){
  const s = S.sel; if (!s) return;
  if (s.kind === "item"){ S.items = S.items.filter(i => i.id !== s.id); S.sel = null; }
  else if (s.kind === "wall") S.walls[s.id] = "bare-wall";
  else if (s.kind === "floor") S.floor = "bare-floor";
  update();
}

const anyDialogOpen = () => [...document.querySelectorAll(".modal")].some(m => !m.hidden);

export function initKeyboard(){
  document.addEventListener("keydown", e => {
    if (e.key === "Escape"){
      if (anyDialogOpen()){ document.querySelectorAll(".modal").forEach(m => { m.hidden = true; }); return; }
      S.sel = null; S.replacing = null; renderLib(); update(); return;
    }
    if (anyDialogOpen() || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.key === "Delete" || e.key === "Backspace") deleteSel();
    if (e.key === "r" || e.key === "R") rotateSel();
  });
}
