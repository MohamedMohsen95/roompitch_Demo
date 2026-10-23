// 2D floor plan (SVG, 1 unit = 1 metre): draw, select, drag pieces and openings, accept drops from the library.
import { S, clampItem, findItem } from "./state.js";
import { FU, WM, FM } from "./catalog.js";
import { wallsOf, wallFrame, alongWall, toCm } from "./geometry.js";
import { nearestWallAny, findOpening, moveOpening, isGlassDoor } from "./openings.js";
import { startCarry, carry } from "./stacking.js";
import { $, clamp, snap, shade } from "./utils.js";
import { update } from "./app.js";
import { applyPayload } from "./library.js";
import { t, getLang } from "./i18n.js";
import { renderEst } from "./estimate.js";
import { rotateSel, renderInspect } from "./inspector.js";
import { syncAll } from "./three/items.js";
import { buildRoom } from "./three/room.js";
import { FACINGS } from "./three/sun.js";
import { saveRoom } from "./room-store.js";

const PAD = .7;
let svg;

export const planViewBox = () => `${-PAD} ${-PAD} ${S.L + PAD * 2} ${S.W + PAD * 2}`;

export function renderPlan(){
  svg.setAttribute("viewBox", planViewBox());
  svg.innerHTML = planMarkup();
}

const f2 = (n) => Math.round(n * 1000) / 1000;
const pt = (p) => `${f2(p[0])} ${f2(p[1])}`;

// SVG content of the plan. The PDF calls it with its own language, no selection and its own pattern id.
export function planMarkup({lang = getLang(), sel = S.sel, gridId = "g"} = {}){
  const {L, W} = S, T = .12, ws = wallsOf(S.poly);
  const fm = FM[S.floor];
  const text = (x, y, s, {size = .17, rot = 0, mono = false, fill = "var(--muted)"} = {}) =>
    `<text x="${f2(x)}" y="${f2(y)}" transform="rotate(${f2(rot)} ${f2(x)} ${f2(y)})" font-size="${size}" fill="${fill}" text-anchor="middle" dominant-baseline="middle"${mono ? ` font-family="IBM Plex Mono, monospace" direction="ltr"` : ""}>${s}</text>`;
  let h = "";
  h += `<defs><pattern id="${gridId}" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M.5 0H0V.5" fill="none" stroke="var(--grid)" stroke-width=".01"/></pattern></defs>`;
  h += `<rect x="${-PAD}" y="${-PAD}" width="${L + PAD * 2}" height="${W + PAD * 2}" fill="url(#${gridId})"/>`;
  h += `<polygon data-floor="1" points="${S.poly.map(pt).join(" ")}" fill="${fm.c}" fill-opacity=".55" stroke="${sel && sel.kind === "floor" ? "var(--accent)" : "none"}" stroke-width=".04" stroke-dasharray=".12 .08"/>`;
  // furniture: rugs first, then by height so raised pieces draw on top
  const items = [...S.items].sort((a, b) => (a.type === "rug" ? -1 : 0) - (b.type === "rug" ? -1 : 0) || (a.z || 0) - (b.z || 0));
  for (const it of items){
    const f = FU[it.type], on = sel && sel.kind === "item" && sel.id === it.id, z = it.z || 0;
    h += `<g data-item="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${-it.rot})" style="cursor:move">`;
    h += `<rect x="${-f.w / 2}" y="${-f.d / 2}" width="${f.w}" height="${f.d}" rx=".04" fill="${f.c}" fill-opacity="${it.type === "rug" ? .55 : .92}" stroke="${on ? "var(--accent)" : "rgba(0,0,0,.35)"}" stroke-width="${on ? .05 : .015}"${z > 0 ? ` stroke-dasharray=".08 .05"` : ""}/>`;
    if (it.type === "sofa" || it.type === "armchair") h += `<rect x="${-f.w / 2}" y="${-f.d / 2}" width="${f.w}" height=".2" fill="rgba(0,0,0,.18)"/>`;
    if (it.type === "bed") h += `<rect x="${-f.w / 2 + .1}" y="${-f.d / 2 + .1}" width="${f.w - .2}" height=".35" rx=".06" fill="rgba(255,255,255,.55)"/>`;
    if (it.type === "tvunit") h += `<rect x="-.6" y="${-f.d / 2 + .05}" width="1.2" height=".06" fill="#111"/>`;
    if (it.type === "plant") h += `<circle r=".2" fill="rgba(255,255,255,.18)"/>`;
    if (z > 0) h += `<text transform="rotate(${it.rot})" y=".05" font-size=".14" font-family="IBM Plex Mono, monospace" text-anchor="middle" fill="#fff" stroke="rgba(0,0,0,.55)" stroke-width=".03" paint-order="stroke" direction="ltr">↑${toCm(z)}</text>`;
    h += `</g>`;
  }
  // walls, then a wide invisible line per wall for clicks
  for (const w of ws){
    const m = WM[S.walls[w.i]] || WM["paint-white"], on = sel && sel.kind === "wall" && sel.id === w.i;
    h += `<line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="${on ? "var(--accent)" : shade(m.c, -.35)}" stroke-width="${on ? T * 1.4 : T}" stroke-linecap="square"/>`;
  }
  for (const w of ws){
    h += `<line data-wall="${w.i}" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="transparent" stroke-width=".35" style="cursor:pointer"/>`;
  }
  // doors (gap + swing into the room) and windows (gap + double line); each can be grabbed and dragged
  for (const o of S.openings){
    const w = ws[o.wall]; if (!w) continue;
    const on = sel && sel.kind === "opening" && sel.id === o.id, ink = on ? "var(--accent)" : "var(--muted)", sw = on ? .03 : .015;
    const {dir, normal} = wallFrame(w), p0 = alongWall(w, o.offset), p1 = alongWall(w, o.offset + o.width);
    h += `<g data-opening="${o.id}" style="cursor:move">`;
    h += `<line x1="${f2(p0[0])}" y1="${f2(p0[1])}" x2="${f2(p1[0])}" y2="${f2(p1[1])}" stroke="var(--stage)" stroke-width="${T + .02}"/>`;
    if (o.type === "door"){
      const tip = [p0[0] + normal[0] * o.width, p0[1] + normal[1] * o.width];
      const sweep = normal[0] * dir[1] - normal[1] * dir[0] > 0 ? 1 : 0;
      h += `<path d="M${pt(p0)} L${pt(tip)} A${o.width} ${o.width} 0 0 ${sweep} ${pt(p1)}" fill="${on ? "var(--accent-soft)" : "none"}" stroke="${ink}" stroke-width="${sw}"/>`;
    } else {
      const off = (k) => `x1="${f2(p0[0] + normal[0] * k)}" y1="${f2(p0[1] + normal[1] * k)}" x2="${f2(p1[0] + normal[0] * k)}" y2="${f2(p1[1] + normal[1] * k)}"`;
      for (const k of [-.035, .035]) h += `<line ${off(k)} stroke="${ink}" stroke-width="${sw}"/>`;
      if (isGlassDoor(o)) h += `<line ${off(.12)} stroke="${ink}" stroke-width="${sw * .7}" stroke-dasharray=".06 .05"/>`; // full-height glass
    }
    // generous invisible hit area so it's easy to grab
    h += `<line x1="${f2(p0[0])}" y1="${f2(p0[1])}" x2="${f2(p1[0])}" y2="${f2(p1[1])}" stroke="transparent" stroke-width=".4"/></g>`;
  }
  // wall numbers inside, lengths in cm outside
  for (const w of ws){
    const {dir, normal} = wallFrame(w), mid = alongWall(w, w.len / 2);
    let ang = Math.atan2(dir[1], dir[0]) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
    const inn = [mid[0] + normal[0] * .32, mid[1] + normal[1] * .32], out = [mid[0] - normal[0] * .36, mid[1] - normal[1] * .36];
    h += `<circle cx="${f2(inn[0])}" cy="${f2(inn[1])}" r=".14" fill="var(--surface, #fff)" stroke="var(--muted)" stroke-width=".012"/>` + text(inn[0], inn[1], w.i + 1, {size:.15, mono:true, fill:"var(--ink, #1b2220)"});
    h += text(out[0], out[1], `${toCm(w.len)} ${t("cm", null, lang)}`, {rot:ang, mono:true});
  }
  // compass: north arrow, turned by the direction the top of the plan faces (set in the Sun bar)
  const north = -FACINGS.indexOf(S.sun.facing) * 45;
  h += `<g transform="translate(${-PAD / 2} ${-PAD / 2}) rotate(${north})" opacity=".8"><title>${t("north", null, lang)}</title>` +
    `<circle r=".2" fill="none" stroke="var(--muted)" stroke-width=".012"/><path d="M0 -.17 L.06 .05 L0 .01 L-.06 .05 Z" fill="var(--accent)"/>` +
    `<text y="-.24" font-size=".13" fill="var(--muted)" text-anchor="middle" transform="rotate(${-north} 0 -.28)">${t("northLetter", null, lang)}</text></g>`;
  return h;
}

function svgPoint(evt){
  const p = svg.createSVGPoint(); p.x = evt.clientX; p.y = evt.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

export function initPlan(){
  svg = $("#plan");
  let drag = null, dragOpen = null;
  svg.addEventListener("pointerdown", e => {
    const opEl = e.target.closest("[data-opening]");
    const itEl = e.target.closest("[data-item]"), wEl = e.target.closest("[data-wall]"), fEl = e.target.closest("[data-floor]");
    if (opEl){
      // Drag a window/door along its wall, or onto another wall.
      const o = findOpening(opEl.dataset.opening), p = svgPoint(e);
      S.sel = {kind:"opening", id:o.id};
      dragOpen = {o, grab:nearestWallAny(p.x, p.y).along - o.offset, moved:false};
      svg.setPointerCapture(e.pointerId); update(); return;
    }
    if (wEl){ S.sel = {kind:"wall", id:Number(wEl.dataset.wall)}; update(); return; }
    if (itEl){
      const it = findItem(+itEl.dataset.item), p = svgPoint(e);
      S.sel = {kind:"item", id:it.id}; drag = {it, dx:p.x - it.x, dy:p.y - it.y, riders:startCarry(it)};
      svg.setPointerCapture(e.pointerId); update(); return;
    }
    S.sel = fEl ? {kind:"floor"} : null; update();
  });
  svg.addEventListener("pointermove", e => {
    if (dragOpen){
      const p = svgPoint(e), {wall, along} = nearestWallAny(p.x, p.y), o = dragOpen.o;
      // keep the grab point under the pointer on the same wall; centre it when switching walls
      const sameWall = wall === o.wall;
      if (moveOpening(o, wall, along - (sameWall ? dragOpen.grab : o.width / 2))){
        if (!sameWall) dragOpen.grab = o.width / 2;
        dragOpen.moved = true; renderPlan(); buildRoom();
      }
      return;
    }
    if (!drag) return;
    const p = svgPoint(e); drag.it.x = snap(p.x - drag.dx); drag.it.y = snap(p.y - drag.dy); clampItem(drag.it);
    carry(drag.it, drag.riders);   // things on it come along; it lands on whatever is below
    renderPlan(); syncAll();
  });
  const endDrag = () => {
    if (dragOpen){ const moved = dragOpen.moved; dragOpen = null; if (moved){ renderEst(); renderInspect(); saveRoom(); } }
    if (drag){ drag = null; renderEst(); renderInspect(); saveRoom(); }
  };
  svg.addEventListener("pointerup", endDrag); svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("dblclick", e => { if (e.target.closest("[data-item]")) rotateSel(); });

  // HTML5 drop from the library onto the plan
  const stage = svg.parentElement;
  stage.addEventListener("dragover", e => { e.preventDefault(); stage.classList.add("drop-on"); });
  stage.addEventListener("dragleave", () => stage.classList.remove("drop-on"));
  stage.addEventListener("drop", e => {
    e.preventDefault(); stage.classList.remove("drop-on");
    const payload = e.dataTransfer.getData("text/plain"); if (!payload) return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const itEl = over && over.closest && over.closest("[data-item]");
    const p = svgPoint(e);
    if (itEl && payload.startsWith("furn:")) return applyPayload(payload, {kind:"item", id:+itEl.dataset.item, x:p.x, y:p.y});
    applyPayload(payload, {kind:"point", x:clamp(p.x, 0, S.L), y:clamp(p.y, 0, S.W)});
  });
}
