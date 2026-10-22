// Live preview on the "New room" screen: outline, numbered walls with lengths, doors and windows.
// Openings can be dragged along their wall; walls can be clicked (used to tag photos).
import { wallsOf, wallFrame, alongWall, bbox, toCm } from "../geometry.js";
import { t } from "../i18n.js";

const f2 = (n) => Math.round(n * 1000) / 1000;
const pt = (p) => `${f2(p[0])} ${f2(p[1])}`;
const PAD = .8;

// room: {poly, openings (metres)} or null; errors: {id: key}; activeWall: highlighted wall index or null
export function renderPreview(svg, room, {errors = {}, activeWall = null} = {}){
  if (!room){ svg.innerHTML = ""; return; }
  const {L, W} = bbox(room.poly), ws = wallsOf(room.poly), T = .12;
  svg.setAttribute("viewBox", `${-PAD} ${-PAD} ${L + PAD * 2} ${W + PAD * 2}`);
  let h = `<polygon points="${room.poly.map(pt).join(" ")}" fill="var(--accent-soft)" stroke="none"/>`;
  for (const w of ws){
    const on = activeWall === w.i;
    h += `<line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="${on ? "var(--accent)" : "var(--ink)"}" stroke-width="${on ? T * 1.5 : T}" stroke-linecap="square"/>`;
  }
  // Wall hit areas go under the openings, so dragging an opening never selects its wall.
  for (const w of ws) h += `<line data-wall="${w.i}" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="transparent" stroke-width=".4" style="cursor:pointer"/>`;
  for (const o of room.openings){
    const w = ws[o.wall]; if (!w) continue;
    const {normal} = wallFrame(w), p0 = alongWall(w, Math.max(0, o.offset)), p1 = alongWall(w, Math.min(w.len, o.offset + o.width));
    const bad = Boolean(errors[o.id]), col = bad ? "#c0392b" : o.type === "door" ? "#8a5a3c" : "#3d7fb0";
    const q = [[p0[0] + normal[0] * .14, p0[1] + normal[1] * .14], [p1[0] + normal[0] * .14, p1[1] + normal[1] * .14]];
    h += `<g data-open="${o.id}" style="cursor:grab">
      <line x1="${f2(p0[0])}" y1="${f2(p0[1])}" x2="${f2(p1[0])}" y2="${f2(p1[1])}" stroke="var(--surface)" stroke-width="${T + .03}"/>
      <polygon points="${[p0, p1, q[1], q[0]].map(pt).join(" ")}" fill="${col}" fill-opacity=".85"/>
      <line x1="${f2(p0[0])}" y1="${f2(p0[1])}" x2="${f2(p1[0])}" y2="${f2(p1[1])}" stroke="transparent" stroke-width=".45"/></g>`;
  }
  for (const w of ws){
    const {dir, normal} = wallFrame(w), mid = alongWall(w, w.len / 2);
    let ang = Math.atan2(dir[1], dir[0]) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
    const inn = [mid[0] + normal[0] * .42, mid[1] + normal[1] * .42], out = [mid[0] - normal[0] * .4, mid[1] - normal[1] * .4];
    h += `<g data-wall="${w.i}" style="cursor:pointer"><circle cx="${f2(inn[0])}" cy="${f2(inn[1])}" r=".19" fill="var(--surface)" stroke="${activeWall === w.i ? "var(--accent)" : "var(--muted)"}" stroke-width=".02"/>
      <text x="${f2(inn[0])}" y="${f2(inn[1])}" font-size=".2" text-anchor="middle" dominant-baseline="central" fill="var(--ink)" font-family="IBM Plex Mono, monospace">${w.i + 1}</text>
</g>`;
    h += `<text x="${f2(out[0])}" y="${f2(out[1])}" transform="rotate(${f2(ang)} ${f2(out[0])} ${f2(out[1])})" font-size=".19" text-anchor="middle" dominant-baseline="central" fill="var(--muted)" font-family="IBM Plex Mono, monospace" direction="ltr">${toCm(w.len)} ${t("cm")}</text>`;
  }
  svg.innerHTML = h;
}

// Pointer handling, bound once. getRoom() returns the room currently drawn.
export function initPreview(svg, {getRoom, onMove, onEnd, onWallClick}){
  const toPlan = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    const room = getRoom(); if (!room) return;
    const g = e.target.closest("[data-open]");
    if (g){
      const o = room.openings.find(x => x.id === g.dataset.open); if (!o) return;
      drag = {id:o.id, wall:o.wall, width:o.width};
      svg.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    const wg = e.target.closest("[data-wall]");
    if (wg && onWallClick) onWallClick(Number(wg.dataset.wall));
  });
  svg.addEventListener("pointermove", e => {
    if (!drag) return;
    const room = getRoom(), w = room && wallsOf(room.poly)[drag.wall]; if (!w) return;
    const p = toPlan(e), {dir} = wallFrame(w);
    const s = (p.x - w.a[0]) * dir[0] + (p.y - w.a[1]) * dir[1];
    const offset = Math.min(Math.max(0, s - drag.width / 2), Math.max(0, w.len - drag.width));
    onMove(drag.id, toCm(offset));
  });
  const end = () => { if (drag){ drag = null; onEnd && onEnd(); } };
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
}
