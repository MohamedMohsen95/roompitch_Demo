// 2D floor plan (SVG, 1 unit = 1 metre): draw, select, drag pieces, accept drops from the library.
import { S, clampItem, findItem } from "./state.js";
import { FU, WM, FM } from "./catalog.js";
import { wallsOf, wallFrame, alongWall, toCm } from "./geometry.js";
import { $, clamp, snap, shade } from "./utils.js";
import { update } from "./app.js";
import { applyPayload } from "./library.js";
import { t, getLang } from "./i18n.js";
import { renderEst } from "./estimate.js";
import { rotateSel } from "./inspector.js";
import { syncItem } from "./three/items.js";
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
  // furniture (rugs first so they sit underneath)
  const items = [...S.items].sort((a, b) => (a.type === "rug" ? -1 : 0) - (b.type === "rug" ? -1 : 0));
  for (const it of items){
    const f = FU[it.type], on = sel && sel.kind === "item" && sel.id === it.id;
    h += `<g data-item="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${-it.rot})" style="cursor:move">`;
    h += `<rect x="${-f.w / 2}" y="${-f.d / 2}" width="${f.w}" height="${f.d}" rx=".04" fill="${f.c}" fill-opacity="${it.type === "rug" ? .55 : .92}" stroke="${on ? "var(--accent)" : "rgba(0,0,0,.35)"}" stroke-width="${on ? .05 : .015}"/>`;
    if (it.type === "sofa" || it.type === "armchair") h += `<rect x="${-f.w / 2}" y="${-f.d / 2}" width="${f.w}" height=".2" fill="rgba(0,0,0,.18)"/>`;
    if (it.type === "bed") h += `<rect x="${-f.w / 2 + .1}" y="${-f.d / 2 + .1}" width="${f.w - .2}" height=".35" rx=".06" fill="rgba(255,255,255,.55)"/>`;
    if (it.type === "tvunit") h += `<rect x="-.6" y="${-f.d / 2 + .05}" width="1.2" height=".06" fill="#111"/>`;
    if (it.type === "plant") h += `<circle r=".2" fill="rgba(255,255,255,.18)"/>`;
    h += `</g>`;
  }
  // walls, then a wide invisible line per wall for clicks
  for (const w of ws){
    const m = WM[S.walls[w.i]] || WM["paint-white"], on = sel && sel.kind === "wall" && sel.id === w.i;
    h += `<line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="${on ? "var(--accent)" : shade(m.c, -.35)}" stroke-width="${on ? T * 1.4 : T}" stroke-linecap="square"/>`;
  }
  // doors (gap + swing into the room) and windows (gap + double line)
  for (const o of S.openings){
    const w = ws[o.wall]; if (!w) continue;
    const {dir, normal} = wallFrame(w), p0 = alongWall(w, o.offset), p1 = alongWall(w, o.offset + o.width);
    h += `<line x1="${f2(p0[0])}" y1="${f2(p0[1])}" x2="${f2(p1[0])}" y2="${f2(p1[1])}" stroke="var(--stage)" stroke-width="${T + .02}"/>`;
    if (o.type === "door"){
      const tip = [p0[0] + normal[0] * o.width, p0[1] + normal[1] * o.width];
      const sweep = normal[0] * dir[1] - normal[1] * dir[0] > 0 ? 1 : 0;
      h += `<path d="M${pt(p0)} L${pt(tip)} A${o.width} ${o.width} 0 0 ${sweep} ${pt(p1)}" fill="none" stroke="var(--muted)" stroke-width=".015"/>`;
    } else {
      for (const k of [-.035, .035]){
        h += `<line x1="${f2(p0[0] + normal[0] * k)}" y1="${f2(p0[1] + normal[1] * k)}" x2="${f2(p1[0] + normal[0] * k)}" y2="${f2(p1[1] + normal[1] * k)}" stroke="var(--muted)" stroke-width=".015"/>`;
      }
    }
  }
  for (const w of ws){
    h += `<line data-wall="${w.i}" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="transparent" stroke-width=".35" style="cursor:pointer"/>`;
  }
  // wall numbers inside, lengths in cm outside
  for (const w of ws){
    const {dir, normal} = wallFrame(w), mid = alongWall(w, w.len / 2);
    let ang = Math.atan2(dir[1], dir[0]) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
    const inn = [mid[0] + normal[0] * .32, mid[1] + normal[1] * .32], out = [mid[0] - normal[0] * .36, mid[1] - normal[1] * .36];
    h += `<circle cx="${f2(inn[0])}" cy="${f2(inn[1])}" r=".14" fill="var(--surface, #fff)" stroke="var(--muted)" stroke-width=".012"/>` + text(inn[0], inn[1], w.i + 1, {size:.15, mono:true, fill:"var(--ink, #1b2220)"});
    h += text(out[0], out[1], `${toCm(w.len)} ${t("cm", null, lang)}`, {rot:ang, mono:true});
  }
  return h;
}

function svgPoint(evt){
  const p = svg.createSVGPoint(); p.x = evt.clientX; p.y = evt.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

export function initPlan(){
  svg = $("#plan");
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    const itEl = e.target.closest("[data-item]"), wEl = e.target.closest("[data-wall]"), fEl = e.target.closest("[data-floor]");
    if (wEl){ S.sel = {kind:"wall", id:Number(wEl.dataset.wall)}; update(); return; }
    if (itEl){
      const it = findItem(+itEl.dataset.item), p = svgPoint(e);
      S.sel = {kind:"item", id:it.id}; drag = {it, dx:p.x - it.x, dy:p.y - it.y};
      svg.setPointerCapture(e.pointerId); update(); return;
    }
    S.sel = fEl ? {kind:"floor"} : null; update();
  });
  svg.addEventListener("pointermove", e => {
    if (!drag) return;
    const p = svgPoint(e); drag.it.x = snap(p.x - drag.dx); drag.it.y = snap(p.y - drag.dy); clampItem(drag.it);
    renderPlan(); syncItem(drag.it);
  });
  const endDrag = () => { if (drag){ drag = null; renderEst(); saveRoom(); } };
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
    if (itEl && payload.startsWith("furn:")) return applyPayload(payload, {kind:"item", id:+itEl.dataset.item});
    const p = svgPoint(e);
    applyPayload(payload, {kind:"point", x:clamp(p.x, 0, S.L), y:clamp(p.y, 0, S.W)});
  });
}
