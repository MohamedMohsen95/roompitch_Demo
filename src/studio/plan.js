// 2D floor plan (SVG, 1 unit = 1 metre): draw, select, drag pieces, accept drops from the library.
import { S, clampItem, findItem } from "./state.js";
import { FU, WM, FM } from "./catalog.js";
import { OT, wallLine, INWARD, nearestWallAny, findOpening, moveOpening } from "./openings.js";
import { $, clamp, snap, shade } from "./utils.js";
import { update } from "./app.js";
import { applyPayload } from "./library.js";
import { renderEst } from "./estimate.js";
import { rotateSel, renderInspect } from "./inspector.js";
import { syncItem } from "./three/items.js";
import { buildRoom } from "./three/room.js";
import { FACINGS } from "./three/sun.js";

const PAD = .7;
let svg;

export function renderPlan(){
  const {L, W} = S, sel = S.sel;
  svg.setAttribute("viewBox", `${-PAD} ${-PAD} ${L + PAD * 2} ${W + PAD * 2}`);
  const fm = FM[S.floor];
  let h = "";
  h += `<defs><pattern id="g" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M.5 0H0V.5" fill="none" stroke="var(--grid)" stroke-width=".01"/></pattern></defs>`;
  h += `<rect x="${-PAD}" y="${-PAD}" width="${L + PAD * 2}" height="${W + PAD * 2}" fill="url(#g)"/>`;
  h += `<rect data-floor="1" x="0" y="0" width="${L}" height="${W}" fill="${fm.c}" fill-opacity=".55" stroke="${sel && sel.kind === "floor" ? "var(--accent)" : "none"}" stroke-width=".04" stroke-dasharray=".12 .08"/>`;
  // furniture: rugs first, then by height so raised pieces draw on top
  const items = [...S.items].sort((a, b) => (a.type === "rug" ? -1 : 0) - (b.type === "rug" ? -1 : 0) || (a.z || 0) - (b.z || 0));
  for (const it of items){
    const f = FU[it.type], on = sel && sel.kind === "item" && sel.id === it.id, z = it.z || 0;
    h += `<g data-item="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${-it.rot})" style="cursor:move">`;
    h += `<rect x="${-f.w / 2}" y="${-f.d / 2}" width="${f.w}" height="${f.d}" rx=".04" fill="${f.c}" fill-opacity="${it.type === "rug" ? .55 : .92}" stroke="${on ? "var(--accent)" : "rgba(0,0,0,.35)"}" stroke-width="${on ? .05 : .015}"${z > 0 ? ` stroke-dasharray=".08 .05"` : ""}/>`;
    if (z > 0) h += `<text transform="rotate(${it.rot})" y=".05" font-size=".14" font-family="IBM Plex Mono, monospace" text-anchor="middle" fill="#fff" stroke="rgba(0,0,0,.55)" stroke-width=".03" paint-order="stroke">↑${Math.round(z * 100)}</text>`;
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
  // windows and doors
  for (const o of S.openings) h += openingSvg(o, T, sel && sel.kind === "opening" && sel.id === o.id);
  // dimensions
  const tx = (x, y, s, rot = 0) => `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-size=".17" fill="var(--muted)" text-anchor="middle" font-family="IBM Plex Mono, monospace" direction="ltr">${s}</text>`;
  h += `<line x1="0" y1="${-.38}" x2="${L}" y2="${-.38}" stroke="var(--muted)" stroke-width=".01"/>` + tx(L / 2, -.45, `${L.toFixed(2)} m`);
  h += `<line x1="${L + .38}" y1="0" x2="${L + .38}" y2="${W}" stroke="var(--muted)" stroke-width=".01"/>` + tx(L + .5, W / 2, `${W.toFixed(2)} m`, 90);
  // compass: north arrow, turned by the direction the back wall faces (set in the Sun bar)
  const north = -FACINGS.indexOf(S.sun.facing) * 45;
  h += `<g transform="translate(${-PAD / 2} ${-PAD / 2}) rotate(${north})" opacity=".8"><title>North</title>` +
    `<circle r=".2" fill="none" stroke="var(--muted)" stroke-width=".012"/><path d="M0 -.17 L.06 .05 L0 .01 L-.06 .05 Z" fill="var(--accent)"/>` +
    `<text y="-.24" font-size=".13" fill="var(--muted)" text-anchor="middle" transform="rotate(${-north} 0 -.28)">N</text></g>`;
  svg.innerHTML = h;
}

// A window (double line in the wall) or a door (gap + swing arc into the room).
function openingSvg(o, T, on){
  const l = wallLine(o.wall), n = INWARD[o.wall];
  const a = {x:l.x + l.dx * o.offset, y:l.y + l.dy * o.offset};
  const b = {x:a.x + l.dx * o.w, y:a.y + l.dy * o.w};
  const ink = on ? "var(--accent)" : "var(--muted)", sw = on ? .03 : .015;
  let h = `<g data-opening="${o.id}" style="cursor:move">`;
  h += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--stage)" stroke-width="${T + .02}"/>`;
  if (OT[o.type].kind === "door"){
    const leaf = {x:a.x + n.x * o.w, y:a.y + n.y * o.w};
    const sweep = (l.dx * n.y - l.dy * n.x) < 0 ? 1 : 0;
    h += `<path d="M${a.x} ${a.y} L${leaf.x} ${leaf.y} A${o.w} ${o.w} 0 0 ${sweep} ${b.x} ${b.y}" fill="${on ? "var(--accent-soft)" : "none"}" stroke="${ink}" stroke-width="${sw}"/>`;
  } else {
    const off = (s) => `x1="${a.x + n.x * s}" y1="${a.y + n.y * s}" x2="${b.x + n.x * s}" y2="${b.y + n.y * s}"`;
    h += `<line ${off(-.045)} stroke="${ink}" stroke-width="${sw}"/><line ${off(.045)} stroke="${ink}" stroke-width="${sw}"/><line ${off(0)} stroke="${ink}" stroke-width="${sw * .7}"/>`;
    if (o.sill === 0) h += `<line ${off(.12)} stroke="${ink}" stroke-width="${sw * .7}" stroke-dasharray=".06 .05"/>`; // full-height glass
  }
  // generous invisible hit area so it's easy to grab
  h += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width=".4"/></g>`;
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
      const o = findOpening(+opEl.dataset.opening), p = svgPoint(e);
      S.sel = {kind:"opening", id:o.id};
      dragOpen = {o, grab:nearestWallAny(p.x, p.y).along - o.offset, moved:false};
      svg.setPointerCapture(e.pointerId); update(); return;
    }
    if (wEl){ S.sel = {kind:"wall", id:wEl.dataset.wall}; update(); return; }
    if (itEl){
      const it = findItem(+itEl.dataset.item), p = svgPoint(e);
      S.sel = {kind:"item", id:it.id}; drag = {it, dx:p.x - it.x, dy:p.y - it.y};
      svg.setPointerCapture(e.pointerId); update(); return;
    }
    S.sel = fEl ? {kind:"floor"} : null; update();
  });
  svg.addEventListener("pointermove", e => {
    if (dragOpen){
      const p = svgPoint(e), {wall, along} = nearestWallAny(p.x, p.y), o = dragOpen.o;
      // keep the grab point under the pointer on the same wall; centre it when switching walls
      const sameWall = wall === o.wall;
      if (moveOpening(o, wall, along - (sameWall ? dragOpen.grab : o.w / 2))){
        if (!sameWall) dragOpen.grab = o.w / 2;
        dragOpen.moved = true; renderPlan(); buildRoom();
      }
      return;
    }
    if (!drag) return;
    const p = svgPoint(e); drag.it.x = snap(p.x - drag.dx); drag.it.y = snap(p.y - drag.dy); clampItem(drag.it);
    renderPlan(); syncItem(drag.it);
  });
  const endDrag = () => {
    if (dragOpen){ const moved = dragOpen.moved; dragOpen = null; if (moved){ renderEst(); renderInspect(); } }
    if (drag){ drag = null; renderEst(); }
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
    if (itEl && payload.startsWith("furn:")) return applyPayload(payload, {kind:"item", id:+itEl.dataset.item});
    const p = svgPoint(e);
    applyPayload(payload, {kind:"point", x:clamp(p.x, 0, S.L), y:clamp(p.y, 0, S.W)});
  });
}
