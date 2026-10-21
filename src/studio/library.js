// Library panel: furniture, wall and floor tiles that can be clicked or dragged into the room.
import { S, clampItem, findItem, nearestWall } from "./state.js";
import { FURN, WALL_MATS, FLOOR_MATS } from "./catalog.js";
import { swatchURL } from "./textures.js";
import { $, fmt } from "./utils.js";
import { update } from "./app.js";

const HINTS = {
  furn: "Drag a piece onto the plan or the 3D view, or click it to place it in the middle of the room.",
  wall: "Drag a finish onto any wall, or select a wall and click a finish.",
  floor:"Drag a finish onto the floor, or click it."
};

export function renderLib(){
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
  const lib = $("#lib"); lib.innerHTML = "";
  lib.classList.toggle("replacing", Boolean(S.replacing) && S.tab === "furn");
  const list = S.tab === "furn" ? FURN : S.tab === "wall" ? WALL_MATS : FLOOR_MATS;
  for (const o of list){
    const t = document.createElement("button");
    t.type = "button"; t.className = "tile"; t.draggable = true; t.title = o.name;
    if (S.tab === "furn"){
      const k = 38 / Math.max(o.w, o.d);
      t.innerHTML = `<div class="sw" style="background:var(--stage)"><div class="fp" style="width:${o.w * k}px;height:${o.d * k}px;background:${o.c}"></div></div><b>${o.name}</b><span>${Math.round(o.w * 100)}×${Math.round(o.d * 100)} cm · ${fmt(o.price)}</span>`;
    } else {
      t.innerHTML = `<div class="sw" style="background-image:url(${swatchURL(o)})"></div><b>${o.name}</b><span>${fmt(o.price)} / m²</span>`;
    }
    const payload = `${S.tab}:${o.id}`;
    t.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", payload); e.dataTransfer.effectAllowed = "copy"; });
    t.addEventListener("click", () => applyPayload(payload, null));
    lib.appendChild(t);
  }
  $("#hint").textContent = S.replacing && S.tab === "furn" ? "Pick the new piece. It takes the old one's place and direction." : HINTS[S.tab];
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
    if (!w && target && target.kind === "point") w = nearestWall(target.x, target.y);
    if (!w && S.sel && S.sel.kind === "wall") w = S.sel.id;
    if (!w){ flashHint("Select a wall first in the plan or 3D view, or drag the finish onto it."); return; }
    S.walls[w] = id; S.sel = {kind:"wall", id:w};
  } else if (kind === "floor"){
    S.floor = id; S.sel = {kind:"floor"};
  }
  update();
}

function flashHint(msg){
  const h = $("#hint"); h.textContent = msg; h.style.color = "var(--accent)";
  setTimeout(() => { h.style.color = ""; h.textContent = HINTS[S.tab]; }, 2600);
}

export function initLibrary(){
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderLib(); }));
}
