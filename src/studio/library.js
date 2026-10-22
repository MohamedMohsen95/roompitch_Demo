// Library panel: furniture, wall and floor tiles that can be clicked or dragged into the room.
import { S, clampItem, findItem, nearestWall } from "./state.js";
import { FURN, WALL_MATS, FLOOR_MATS } from "./catalog.js";
import { swatchURL } from "./textures.js";
import { $, fmt } from "./utils.js";
import { update } from "./app.js";
import { t, nameOf } from "./i18n.js";
import { priceOf } from "./settings.js";

const HINT_KEYS = {furn:"hintFurn", wall:"hintWall", floor:"hintFloor"};
const hint = () => t(HINT_KEYS[S.tab]);

export function renderLib(){
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
  const lib = $("#lib"); lib.innerHTML = "";
  lib.classList.toggle("replacing", Boolean(S.replacing) && S.tab === "furn");
  const list = S.tab === "furn" ? FURN : S.tab === "wall" ? WALL_MATS : FLOOR_MATS;
  for (const o of list){
    const tile = document.createElement("button");
    tile.type = "button"; tile.className = "tile"; tile.draggable = true; tile.title = nameOf(o);
    if (S.tab === "furn"){
      const k = 38 / Math.max(o.w, o.d);
      tile.innerHTML = `<div class="sw" style="background:var(--stage)"><div class="fp" style="width:${o.w * k}px;height:${o.d * k}px;background:${o.c}"></div></div><b>${nameOf(o)}</b><span>${Math.round(o.w * 100)}×${Math.round(o.d * 100)} ${t("cm")} · ${fmt(priceOf(o.id))}</span>`;
    } else {
      tile.innerHTML = `<div class="sw" style="background-image:url(${swatchURL(o)})"></div><b>${nameOf(o)}</b><span>${fmt(priceOf(o.id))} / ${t("m2")}</span>`;
    }
    const payload = `${S.tab}:${o.id}`;
    tile.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", payload); e.dataTransfer.effectAllowed = "copy"; });
    tile.addEventListener("click", () => applyPayload(payload, null));
    lib.appendChild(tile);
  }
  $("#hint").textContent = S.replacing && S.tab === "furn" ? t("hintReplace") : hint();
}

// Apply a dragged/clicked library entry ("furn:sofa", "wall:paint-white", "floor:oak").
// `target` = {kind:'point', x, y} | {kind:'item', id} | {kind:'wall', id} | {kind:'floor'} | null
export function applyPayload(payload, target){
  const [kind, id] = payload.split(":");
  if (kind === "furn"){
    // Swap: dropped on an existing piece, or "replace" mode is on
    const swapId = target && target.kind === "item" ? target.id : S.replacing;
    const old = swapId && findItem(swapId);
    if (old){
      const it = {id:S.nextId++, type:id, x:old.x, y:old.y, rot:old.rot};
      clampItem(it);
      S.items = S.items.map(i => i.id === old.id ? it : i);
      S.sel = {kind:"item", id:it.id}; S.replacing = null; renderLib();
      update(); return;
    }
    const p = target && target.kind === "point" ? target : {x:S.L / 2, y:S.W / 2};
    const it = {id:S.nextId++, type:id, x:p.x, y:p.y, rot:0};
    clampItem(it); S.items.push(it); S.sel = {kind:"item", id:it.id};
  } else if (kind === "wall"){
    let w = target && target.kind === "wall" ? target.id : null;
    if (w == null && target && target.kind === "point") w = nearestWall(target.x, target.y);
    if (w == null && S.sel && S.sel.kind === "wall") w = S.sel.id;
    if (w == null){ flashHint(t("hintWallFirst")); return; }
    S.walls[w] = id; S.sel = {kind:"wall", id:w};
  } else if (kind === "floor"){
    S.floor = id; S.sel = {kind:"floor"};
  }
  update();
}

function flashHint(msg){
  const h = $("#hint"); h.textContent = msg; h.style.color = "var(--accent)";
  setTimeout(() => { h.style.color = ""; h.textContent = hint(); }, 2600);
}

export function initLibrary(){
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderLib(); }));
}
