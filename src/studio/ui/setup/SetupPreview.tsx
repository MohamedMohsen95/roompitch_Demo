// Live preview on the "New room" screen: outline, numbered walls with lengths, doors and windows.
// Openings can be dragged along their wall; walls can be clicked (used to tag photos).
import { useRef, type PointerEvent } from "react";
import { wallsOf, wallFrame, alongWall, bbox, toCm } from "../../geometry.js";
import { t } from "../../i18n.js";
import type { Point } from "../../types";

const f2 = (n: number) => Math.round(n * 1000) / 1000;
const pt = (p: number[]) => `${f2(p[0])} ${f2(p[1])}`;
const PAD = .8, T = .12, MONO = "IBM Plex Mono, monospace";

type Props = {
  room: {poly: Point[], openings: any[]} | null;
  errors: Record<string, string>;
  activeWall: number | null;
  onMove: (id: string, offsetCm: number) => void;
  onEnd: () => void;
  onWallClick: (i: number) => void;
};

export default function SetupPreview({room, errors, activeWall, onMove, onEnd, onWallClick}: Props){
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{id: string, wall: number, width: number} | null>(null);
  if (!room) return <svg id="setupPreview" aria-hidden="true"/>;
  const {L, W} = bbox(room.poly), ws = wallsOf(room.poly);

  const toPlan = (e: PointerEvent) => {
    const s = svg.current!, p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(s.getScreenCTM()!.inverse());
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    const el = e.target as Element;
    const g = el.closest("[data-open]") as SVGElement | null;
    if (g){
      const o = room.openings.find(x => x.id === g.dataset.open); if (!o) return;
      drag.current = {id:o.id, wall:o.wall, width:o.width};
      svg.current!.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    const wg = el.closest("[data-wall]") as SVGElement | null;
    if (wg) onWallClick(Number(wg.dataset.wall));
  };
  const onMoveP = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const w = ws[d.wall]; if (!w) return;
    const p = toPlan(e), {dir} = wallFrame(w);
    const s = (p.x - w.a[0]) * dir[0] + (p.y - w.a[1]) * dir[1];
    onMove(d.id, toCm(Math.min(Math.max(0, s - d.width / 2), Math.max(0, w.len - d.width))));
  };
  const end = () => { if (drag.current){ drag.current = null; onEnd(); } };

  return (
    <svg id="setupPreview" ref={svg} aria-hidden="true" viewBox={`${-PAD} ${-PAD} ${L + PAD * 2} ${W + PAD * 2}`}
      onPointerDown={onDown} onPointerMove={onMoveP} onPointerUp={end} onPointerCancel={end}>
      <polygon points={room.poly.map(pt).join(" ")} fill="var(--accent-soft)" stroke="none"/>
      {ws.map(w => <line key={w.i} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={activeWall === w.i ? "var(--accent)" : "var(--ink)"} strokeWidth={activeWall === w.i ? T * 1.5 : T} strokeLinecap="square"/>)}
      {/* Wall hit areas go under the openings, so dragging an opening never selects its wall. */}
      {ws.map(w => <line key={w.i} data-wall={w.i} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="transparent" strokeWidth=".4" style={{cursor:"pointer"}}/>)}
      {room.openings.map(o => {
        const w = ws[o.wall]; if (!w) return null;
        const {normal} = wallFrame(w), p0 = alongWall(w, Math.max(0, o.offset)), p1 = alongWall(w, Math.min(w.len, o.offset + o.width));
        const col = errors[o.id] ? "#c0392b" : o.type === "door" ? "#8a5a3c" : "#3d7fb0";
        const q = [[p0[0] + normal[0] * .14, p0[1] + normal[1] * .14], [p1[0] + normal[0] * .14, p1[1] + normal[1] * .14]];
        return (
          <g key={o.id} data-open={o.id} style={{cursor:"grab"}}>
            <line x1={f2(p0[0])} y1={f2(p0[1])} x2={f2(p1[0])} y2={f2(p1[1])} stroke="var(--surface)" strokeWidth={T + .03}/>
            <polygon points={[p0, p1, q[1], q[0]].map(pt).join(" ")} fill={col} fillOpacity=".85"/>
            <line x1={f2(p0[0])} y1={f2(p0[1])} x2={f2(p1[0])} y2={f2(p1[1])} stroke="transparent" strokeWidth=".45"/>
          </g>
        );
      })}
      {ws.map(w => {
        const {dir, normal} = wallFrame(w), mid = alongWall(w, w.len / 2);
        let ang = Math.atan2(dir[1], dir[0]) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
        const inn = [mid[0] + normal[0] * .42, mid[1] + normal[1] * .42], out = [mid[0] - normal[0] * .4, mid[1] - normal[1] * .4];
        return (
          <g key={w.i}>
            <g data-wall={w.i} style={{cursor:"pointer"}}>
              <circle cx={f2(inn[0])} cy={f2(inn[1])} r=".19" fill="var(--surface)" stroke={activeWall === w.i ? "var(--accent)" : "var(--muted)"} strokeWidth=".02"/>
              <text x={f2(inn[0])} y={f2(inn[1])} fontSize=".2" textAnchor="middle" dominantBaseline="central" fill="var(--ink)" fontFamily={MONO}>{w.i + 1}</text>
            </g>
            <text x={f2(out[0])} y={f2(out[1])} transform={`rotate(${f2(ang)} ${f2(out[0])} ${f2(out[1])})`} fontSize=".19" textAnchor="middle"
              dominantBaseline="central" fill="var(--muted)" fontFamily={MONO} direction="ltr">{toCm(w.len)} {t("cm")}</text>
          </g>
        );
      })}
    </svg>
  );
}
