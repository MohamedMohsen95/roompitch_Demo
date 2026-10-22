// Library panel: furniture, windows & doors, wall and floor tiles that can be clicked or dragged into the room.
import { S, clampItem, findItem, nearestWall } from "./state.js";
import { FURN, WALL_MATS, FLOOR_MATS } from "./catalog.js";
import { OPENING_TYPES, addOpening, nearestWallAny } from "./openings.js";
import { swatchURL } from "./textures.js";
import { $, fmt } from "./utils.js";
import { update } from "./app.js";

const HINTS = {
  furn: "Drag a piece onto the plan or the 3D view, or click it to place it in the middle of the room.",
  open: "Drag a window or door onto any wall, or select a wall and click one. Drag it in the plan to move it.",
  wall: "Drag a finish onto any wall, or select a wall and click a finish.",
  floor:"Drag a finish onto the floor, or click it."
};
const LISTS = {furn:() => FURN, open:() => OPENING_TYPES, wall:() => WALL_MATS, floor:() => FLOOR_MATS};

// Front view of a window or door, to scale, for the library tile.
function openingIcon(t){
  const k = 34 / Math.max(t.w, 2.4), w = t.w * k, h = t.h * k, y = 40 - 4 - (t.sill * k) - h;
  const glass = t.kind === "window";
  const bars = glass ? `<line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="currentColor" stroke-width="1"/>` : `<circle cx="${w - 4}" cy="${h * .52}" r="1.4" fill="currentColor"/>`;
  return `<svg width="54" height="40" viewBox="0 0 54 40" aria-hidden="true"><line x1="2" y1="36" x2="52" y2="36" stroke="currentColor" stroke-opacity=".35"/>` +
    `<g transform="translate(${(54 - w) / 2} ${y})"><rect width="${w}" height="${h}" fill="${glass ? "#cfe4f2" : "#8a6a52"}" stroke="currentColor" stroke-width="1.2"/>${bars}</g></svg>`;
}

export function renderLib(){
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
  const lib = $("#lib"); lib.innerHTML = "";
  lib.classList.toggle("replacing", Boolean(S.replacing) && S.tab === "furn");
  for (const o of LISTS[S.tab]()){
    const t = document.createElement("button");
    t.type = "button"; t.className = "tile"; t.draggable = true; t.title = o.name;
    if (S.tab === "furn"){
      const k = 38 / Math.max(o.w, o.d);
      t.innerHTML = `<div class="sw" style="background:var(--stage)"><div class="fp" style="width:${o.w * k}px;height:${o.d * k}px;background:${o.c}"></div></div><b>${o.name}</b><span>${Math.round(o.w * 100)}×${Math.round(o.d * 100)} cm · ${fmt(o.price)}</span>`;
    } else if (S.tab === "open"){
      t.innerHTML = `<div class="sw" style="background:var(--stage); color:var(--muted)">${openingIcon(o)}</div><b>${o.name}</b><span>${Math.round(o.w * 100)}×${Math.round(o.h * 100)} cm</span>`;
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
  } else if (kind === "open"){
    // onto the wall nearest the drop point, onto a wall dropped on in 3D, or the selected wall (middle)
    let at = null;
    if (target && target.kind === "point") at = nearestWallAny(target.x, target.y);
    else if (target && target.kind === "wall") at = {wall:target.id, along:target.along};
    else if (S.sel && S.sel.kind === "wall") at = {wall:S.sel.id};
    if (!at){ flashHint("Drag it onto a wall, or select a wall first and then click it."); return; }
    if (at.along === undefined) at.along = (at.wall === "n" || at.wall === "s" ? S.L : S.W) / 2;
    const o = addOpening(id, at.wall, at.along);
    if (!o){ flashHint("There's no free space on that wall for it. Try another wall or make it narrower."); return; }
    S.sel = {kind:"opening", id:o.id};
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

export function flashHint(msg){
  const h = $("#hint"); h.textContent = msg; h.style.color = "var(--accent)";
  setTimeout(() => { h.style.color = ""; h.textContent = HINTS[S.tab]; }, 2600);
}

export function initLibrary(){
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderLib(); }));
}
