// Library panel: furniture, windows & doors, wall and floor tiles that can be clicked or dragged into the room.
import { S, clampItem, findItem, nearestWall } from "./state.js";
import { FURN, WALL_MATS, FLOOR_MATS } from "./catalog.js";
import { OPENING_PRESETS, addOpening, nearestWallAny } from "./openings.js";
import { canRestOn } from "./stacking.js";
import { swatchURL } from "./textures.js";
import { $, fmt } from "./utils.js";
import { update } from "./app.js";
import { t, nameOf } from "./i18n.js";
import { priceOf } from "./settings.js";
import { wallsOf, toCm } from "./geometry.js";

const HINT_KEYS = {furn:"hintFurn", open:"hintOpen", wall:"hintWall", floor:"hintFloor"};
const hint = () => t(HINT_KEYS[S.tab]);
const LISTS = {furn:() => FURN, open:() => OPENING_PRESETS, wall:() => WALL_MATS, floor:() => FLOOR_MATS};

// Front view of a window or door, to scale, for the library tile.
function openingIcon(p){
  const k = 34 / Math.max(p.width, 2.4), w = p.width * k, h = p.height * k, y = 40 - 4 - (p.sill * k) - h;
  const glass = p.type === "window";
  const bars = glass ? `<line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="currentColor" stroke-width="1"/>` : `<circle cx="${w - 4}" cy="${h * .52}" r="1.4" fill="currentColor"/>`;
  return `<svg width="54" height="40" viewBox="0 0 54 40" aria-hidden="true"><line x1="2" y1="36" x2="52" y2="36" stroke="currentColor" stroke-opacity=".35"/>` +
    `<g transform="translate(${(54 - w) / 2} ${y})"><rect width="${w}" height="${h}" fill="${glass ? "#cfe4f2" : "#8a6a52"}" stroke="currentColor" stroke-width="1.2"/>${bars}</g></svg>`;
}

export function renderLib(){
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
  const lib = $("#lib"); lib.innerHTML = "";
  lib.classList.toggle("replacing", Boolean(S.replacing) && S.tab === "furn");
  for (const o of LISTS[S.tab]()){
    const tile = document.createElement("button");
    tile.type = "button"; tile.className = "tile"; tile.draggable = true; tile.title = nameOf(o);
    if (S.tab === "furn"){
      const k = 38 / Math.max(o.w, o.d);
      tile.innerHTML = `<div class="sw" style="background:var(--stage)"><div class="fp" style="width:${o.w * k}px;height:${o.d * k}px;background:${o.c}"></div></div><b>${nameOf(o)}</b><span>${Math.round(o.w * 100)}×${Math.round(o.d * 100)} ${t("cm")} · ${fmt(priceOf(o.id))}</span>`;
    } else if (S.tab === "open"){
      tile.innerHTML = `<div class="sw" style="background:var(--stage); color:var(--muted)">${openingIcon(o)}</div><b>${nameOf(o)}</b><span>${toCm(o.width)}×${toCm(o.height)} ${t("cm")}</span>`;
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

// Apply a dragged/clicked library entry ("furn:sofa", "open:window", "wall:paint-white", "floor:oak").
// `target` = {kind:'point', x, y} | {kind:'item', id, x?, y?} | {kind:'wall', id, along?} | {kind:'floor'} | null
export function applyPayload(payload, target){
  const [kind, id] = payload.split(":");
  if (kind === "furn"){
    // Dropped on a piece: if the new piece can sit on it (a vase on a table) it's placed on top,
    // otherwise it replaces that piece (same spot and direction). Rugs are never swapped: pieces go on top.
    if (target && target.kind === "item" && target.x !== undefined){
      const under = findItem(target.id);
      if (under && (canRestOn(id, under) || under.type === "rug")) target = {kind:"point", x:target.x, y:target.y};
    }
    const swapId = target && target.kind === "item" ? target.id : S.replacing;
    const old = swapId && findItem(swapId);
    if (old){
      const it = {id:S.nextId++, type:id, x:old.x, y:old.y, z:old.z || 0, zAuto:old.zAuto, rot:old.rot};
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
    if (!at){ flashHint(t("hintOpenWallFirst")); return; }
    if (at.along === undefined) at.along = (wallsOf(S.poly)[at.wall] || {len:0}).len / 2;
    const o = addOpening(id, at.wall, at.along);
    if (!o){ flashHint(t("hintNoRoomOnWall")); return; }
    S.sel = {kind:"opening", id:o.id};
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

export function flashHint(msg, ms = 2600){
  const h = $("#hint"); h.textContent = msg; h.style.color = "var(--accent)";
  setTimeout(() => { h.style.color = ""; h.textContent = hint(); }, ms);
}

export function initLibrary(){
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderLib(); }));
}
