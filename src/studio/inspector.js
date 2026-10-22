// Inspector: what's selected, and the actions for it (replace, rotate, duplicate, delete...).
import { S, clampItem, findItem, selectedItem, wallArea } from "./state.js";
import { FU, WM, FM, WALL_NAMES } from "./catalog.js";
import { OT, findOpening, refit } from "./openings.js";
import { $, fmt } from "./utils.js";
import { update } from "./app.js";
import { renderLib } from "./library.js";

export function renderInspect(){
  const box = $("#inspect"); const s = S.sel;
  if (S.replacing){
    const old = findItem(S.replacing);
    if (old){
      box.innerHTML = `<div class="what">Replacing: ${FU[old.type].name}<em>Pick the new piece from the library</em></div>
        <div class="acts"><button class="btn" type="button" id="cancelRep">Cancel</button></div>`;
      $("#cancelRep").onclick = () => { S.replacing = null; renderLib(); update(); };
      return;
    }
    S.replacing = null;
  }
  if (!s){ box.innerHTML = `<div class="what">Nothing selected<em>Click a piece, a wall or the floor</em></div>`; return; }
  if (s.kind === "item"){
    const it = findItem(s.id); if (!it){ S.sel = null; return renderInspect(); }
    const f = FU[it.type];
    box.innerHTML = `<div class="what">${f.name}<em>${Math.round(f.w * 100)}×${Math.round(f.d * 100)} cm · EGP ${fmt(f.price)}</em></div>
      <div class="dims"><label class="num" title="Shift + drag in 3D, or PageUp / PageDown"><span>From floor</span><input type="number" inputmode="numeric" step="5" min="0" id="zIn" value="${Math.round((it.z || 0) * 100)}"><em>cm</em></label></div>
      <div class="acts"><button class="btn" type="button" id="repBtn">Replace</button><button class="btn" type="button" id="rotBtn">Rotate 90°</button><button class="btn" type="button" id="dupBtn">Duplicate</button><button class="btn" type="button" id="delBtn">Delete</button></div>`;
    $("#zIn").onchange = () => { it.z = (parseFloat($("#zIn").value) || 0) / 100; clampItem(it); update(); };
    $("#rotBtn").onclick = () => rotateSel(); $("#delBtn").onclick = () => deleteSel();
    $("#repBtn").onclick = () => { S.replacing = it.id; S.tab = "furn"; renderLib(); renderInspect(); };
    $("#dupBtn").onclick = () => { const c = {...it, id:S.nextId++, x:it.x + .3, y:it.y + .3}; clampItem(c); S.items.push(c); S.sel = {kind:"item", id:c.id}; update(); };
  } else if (s.kind === "opening"){
    const o = findOpening(s.id); if (!o){ S.sel = null; return renderInspect(); }
    const t = OT[o.type], cm = (v) => Math.round(v * 100);
    const field = (key, label, val) => `<label class="num"><span>${label}</span><input type="number" inputmode="numeric" step="5" min="0" data-k="${key}" value="${val}"><em>cm</em></label>`;
    box.innerHTML = `<div class="what">${t.name}<em>${WALL_NAMES[o.wall]} · ${(o.w * o.h).toFixed(1)} m² · drag it in the plan to move</em></div>
      <div class="dims">${field("w", "Width", cm(o.w))}${field("h", "Height", cm(o.h))}${t.kind === "door" ? "" : field("sill", "From floor", cm(o.sill))}</div>
      <div class="acts"><button class="btn" type="button" id="delBtn">Delete</button></div>`;
    box.querySelectorAll(".dims input").forEach(inp => inp.addEventListener("change", () => {
      const before = {...o};
      o[inp.dataset.k] = (parseFloat(inp.value) || 0) / 100;
      const ok = refit(o);
      if (!ok) Object.assign(o, before);
      update();
      if (!ok) flashInspect("That size doesn't fit on this wall.");
    }));
    $("#delBtn").onclick = () => deleteSel();
    if (S.tab !== "open"){ S.tab = "open"; renderLib(); }
  } else if (s.kind === "wall"){
    const m = WM[S.walls[s.id]];
    box.innerHTML = `<div class="what">${WALL_NAMES[s.id]}<em>${m.name} · ${wallArea(s.id).toFixed(1)} m²</em></div>
      <div class="acts"><button class="btn" type="button" id="allBtn">Apply to all walls</button><button class="btn" type="button" id="delBtn">Remove finish</button></div>`;
    $("#delBtn").onclick = () => deleteSel();
    $("#allBtn").onclick = () => { for (const k in S.walls) S.walls[k] = S.walls[s.id]; update(); };
    if (S.tab !== "wall"){ S.tab = "wall"; renderLib(); }
  } else {
    box.innerHTML = `<div class="what">Floor<em>${FM[S.floor].name} · ${(S.L * S.W).toFixed(1)} m²</em></div>
      <div class="acts"><button class="btn" type="button" id="delBtn">Remove floor finish</button></div>`;
    $("#delBtn").onclick = () => deleteSel();
    if (S.tab !== "floor"){ S.tab = "floor"; renderLib(); }
  }
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

// Delete anything: a piece is removed, a wall or the floor goes back to unfinished.
export function deleteSel(){
  const s = S.sel; if (!s) return;
  if (s.kind === "item"){ S.items = S.items.filter(i => i.id !== s.id); S.sel = null; }
  else if (s.kind === "opening"){ S.openings = S.openings.filter(o => o.id !== s.id); S.sel = null; }
  else if (s.kind === "wall") S.walls[s.id] = "bare-wall";
  else if (s.kind === "floor") S.floor = "bare-floor";
  update();
}

export function initKeyboard(){
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "Delete" || e.key === "Backspace") deleteSel();
    if (e.key === "r" || e.key === "R") rotateSel();
    if (e.key === "PageUp" || e.key === "PageDown"){
      // raise / lower the selected piece by 5 cm
      const it = selectedItem(); if (!it) return;
      e.preventDefault();
      it.z = (it.z || 0) + (e.key === "PageUp" ? .05 : -.05); clampItem(it); update();
    }
    if (e.key === "Escape"){ S.sel = null; S.replacing = null; renderLib(); update(); $("#modal").hidden = true; }
  });
}
