// 2D floor plan (SVG, 1 unit = 1 metre): draw, select, drag pieces, accept drops from the library.
import { S, clampItem, findItem } from "./state.js";
import { FU, WM, FM, DOOR, WIN } from "./catalog.js";
import { $, clamp, snap, shade } from "./utils.js";
import { update } from "./app.js";
import { applyPayload } from "./library.js";
import { t, getLang } from "./i18n.js";
import { renderEst } from "./estimate.js";
import { rotateSel } from "./inspector.js";
import { syncItem } from "./three/items.js";

const PAD = .7;
let svg;

export const planViewBox = () => `${-PAD} ${-PAD} ${S.L + PAD * 2} ${S.W + PAD * 2}`;

export function renderPlan(){
  svg.setAttribute("viewBox", planViewBox());
  svg.innerHTML = planMarkup();
}

// SVG content of the plan. The PDF calls it with its own language, no selection and its own pattern id.
export function planMarkup({lang = getLang(), sel = S.sel, gridId = "g"} = {}){
  const {L, W} = S;
  const fm = FM[S.floor];
  let h = "";
  h += `<defs><pattern id="${gridId}" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M.5 0H0V.5" fill="none" stroke="var(--grid)" stroke-width=".01"/></pattern></defs>`;
  h += `<rect x="${-PAD}" y="${-PAD}" width="${L + PAD * 2}" height="${W + PAD * 2}" fill="url(#${gridId})"/>`;
  h += `<rect data-floor="1" x="0" y="0" width="${L}" height="${W}" fill="${fm.c}" fill-opacity=".55" stroke="${sel && sel.kind === "floor" ? "var(--accent)" : "none"}" stroke-width=".04" stroke-dasharray=".12 .08"/>`;
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
  // walls
  const T = .12, walls = {n:[0,0,L,0], s:[0,W,L,W], w:[0,0,0,W], e:[L,0,L,W]};
  for (const [k, [x1, y1, x2, y2]] of Object.entries(walls)){
    const m = WM[S.walls[k]], on = sel && sel.kind === "wall" && sel.id === k;
    h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? "var(--accent)" : shade(m.c, -.35)}" stroke-width="${on ? T * 1.4 : T}" stroke-linecap="square"/>`;
    h += `<line data-wall="${k}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width=".35" style="cursor:pointer"/>`;
  }
  // door + window
  const dx = DOOR.from;
  h += `<line x1="${dx}" y1="${W}" x2="${dx + DOOR.w}" y2="${W}" stroke="var(--stage)" stroke-width="${T + .02}"/>`;
  h += `<path d="M${dx} ${W} L${dx} ${W - DOOR.w} A${DOOR.w} ${DOOR.w} 0 0 1 ${dx + DOOR.w} ${W}" fill="none" stroke="var(--muted)" stroke-width=".015"/>`;
  const wx = L / 2 - WIN.w / 2;
  h += `<rect x="${wx}" y="-.06" width="${WIN.w}" height=".12" fill="var(--stage)" stroke="var(--muted)" stroke-width=".015"/><line x1="${wx}" y1="0" x2="${wx + WIN.w}" y2="0" stroke="var(--muted)" stroke-width=".015"/>`;
  // dimensions
  const tx = (x, y, s, rot = 0) => `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-size=".17" fill="var(--muted)" text-anchor="middle" font-family="IBM Plex Mono, monospace" direction="ltr">${s}</text>`;
  h += `<line x1="0" y1="${-.38}" x2="${L}" y2="${-.38}" stroke="var(--muted)" stroke-width=".01"/>` + tx(L / 2, -.45, `${L.toFixed(2)} ${t("m", null, lang)}`);
  h += `<line x1="${L + .38}" y1="0" x2="${L + .38}" y2="${W}" stroke="var(--muted)" stroke-width=".01"/>` + tx(L + .5, W / 2, `${W.toFixed(2)} ${t("m", null, lang)}`, 90);
  h += `<text x="${dx + DOOR.w / 2}" y="${W + .35}" font-size=".15" fill="var(--muted)" text-anchor="middle">${t("door", null, lang)}</text><text x="${L / 2}" y="-.14" font-size=".15" fill="var(--muted)" text-anchor="middle">${t("window", null, lang)}</text>`;
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
    if (wEl){ S.sel = {kind:"wall", id:wEl.dataset.wall}; update(); return; }
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
  const endDrag = () => { if (drag){ drag = null; renderEst(); } };
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
