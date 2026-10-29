// The floor plan's drawing (1 unit = 1 metre): floor, furniture, walls, doors and windows, wall numbers
// and lengths, and the north arrow. The studio's plan (PlanView.tsx) adds the dragging; the PDF draws it
// with its own language, no selection and its own grid id.
import type { ReactNode } from "react";
import { S } from "../state.js";
import { FU, WM, FM, isRug } from "../catalog.js";
import { wallsOf, wallFrame, alongWall, toCm } from "../geometry.js";
import { isGlassDoor } from "../openings.js";
import { shade } from "../utils.js";
import { t } from "../i18n.js";
import { FACINGS } from "../three/sun.js";

export const PAD = .7;
export const planViewBox = () => `${-PAD} ${-PAD} ${S.L + PAD * 2} ${S.W + PAD * 2}`;

type Sel = {kind: string, id?: number | string} | null;
type Pt = [number, number];

const f2 = (n: number) => Math.round(n * 1000) / 1000;
const pt = (p: Pt) => `${f2(p[0])} ${f2(p[1])}`;
const MONO = "IBM Plex Mono, monospace";

function Label({x, y, size = .17, rot = 0, mono = false, fill = "var(--muted)", children}:
  {x: number, y: number, size?: number, rot?: number, mono?: boolean, fill?: string, children: ReactNode}){
  return (
    <text x={f2(x)} y={f2(y)} transform={`rotate(${f2(rot)} ${f2(x)} ${f2(y)})`} fontSize={size} fill={fill}
      textAnchor="middle" dominantBaseline="middle" {...(mono ? {fontFamily:MONO, direction:"ltr"} : {})}>{children}</text>
  );
}

export default function PlanSvg({lang, sel = null, gridId = "g"}: {lang: string, sel?: Sel, gridId?: string}){
  const {L, W} = S, T = .12, ws = wallsOf(S.poly);
  const fm = FM[S.floor];
  // furniture: rugs first, then by height so raised pieces draw on top
  const items = [...S.items].sort((a, b) => (isRug(a.type) ? -1 : 0) - (isRug(b.type) ? -1 : 0) || (a.z || 0) - (b.z || 0));
  const north = -FACINGS.indexOf(S.sun.facing) * 45;
  return (<>
    <defs><pattern id={gridId} width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M.5 0H0V.5" fill="none" stroke="var(--grid)" strokeWidth=".01"/></pattern></defs>
    <rect x={-PAD} y={-PAD} width={L + PAD * 2} height={W + PAD * 2} fill={`url(#${gridId})`}/>
    <polygon data-floor="1" points={S.poly.map(pt).join(" ")} fill={fm.c} fillOpacity=".55"
      stroke={sel && sel.kind === "floor" ? "var(--accent)" : "none"} strokeWidth=".04" strokeDasharray=".12 .08"/>
    {items.map(it => {
      const f = FU[it.type], on = sel?.kind === "item" && sel.id === it.id, z = it.z || 0;
      return (
        <g key={it.id} data-item={it.id} transform={`translate(${it.x} ${it.y}) rotate(${-it.rot})`} style={{cursor:"move"}}>
          <rect x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d} rx=".04" fill={f.c} fillOpacity={isRug(it.type) ? .55 : .92}
            stroke={on ? "var(--accent)" : "rgba(0,0,0,.35)"} strokeWidth={on ? .05 : .015} strokeDasharray={z > 0 ? ".08 .05" : undefined}/>
          {(it.type === "sofa" || it.type === "armchair") && <rect x={-f.w / 2} y={-f.d / 2} width={f.w} height=".2" fill="rgba(0,0,0,.18)"/>}
          {it.type === "bed" && <rect x={-f.w / 2 + .1} y={-f.d / 2 + .1} width={f.w - .2} height=".35" rx=".06" fill="rgba(255,255,255,.55)"/>}
          {it.type === "tvunit" && <rect x="-.6" y={-f.d / 2 + .05} width="1.2" height=".06" fill="#111"/>}
          {it.type === "plant" && <circle r=".2" fill="rgba(255,255,255,.18)"/>}
          {z > 0 && <text transform={`rotate(${it.rot})`} y=".05" fontSize=".14" fontFamily={MONO} textAnchor="middle" fill="#fff"
            stroke="rgba(0,0,0,.55)" strokeWidth=".03" paintOrder="stroke" direction="ltr">↑{toCm(z)}</text>}
        </g>
      );
    })}
    {/* walls, then a wide invisible line per wall for clicks */}
    {ws.map(w => {
      const m = WM[S.walls[w.i]] || WM["paint-white"], on = sel?.kind === "wall" && sel.id === w.i;
      return <line key={w.i} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={on ? "var(--accent)" : shade(m.c, -.35)} strokeWidth={on ? T * 1.4 : T} strokeLinecap="square"/>;
    })}
    {ws.map(w => <line key={w.i} data-wall={w.i} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="transparent" strokeWidth=".35" style={{cursor:"pointer"}}/>)}
    {/* doors (gap + swing into the room) and windows (gap + double line); each can be grabbed and dragged */}
    {S.openings.map(o => {
      const w = ws[o.wall]; if (!w) return null;
      const on = sel?.kind === "opening" && sel.id === o.id, ink = on ? "var(--accent)" : "var(--muted)", sw = on ? .03 : .015;
      const {dir, normal} = wallFrame(w), p0: Pt = alongWall(w, o.offset), p1: Pt = alongWall(w, o.offset + o.width);
      const off = (k: number) => ({x1:f2(p0[0] + normal[0] * k), y1:f2(p0[1] + normal[1] * k), x2:f2(p1[0] + normal[0] * k), y2:f2(p1[1] + normal[1] * k)});
      const tip: Pt = [p0[0] + normal[0] * o.width, p0[1] + normal[1] * o.width];
      const sweep = normal[0] * dir[1] - normal[1] * dir[0] > 0 ? 1 : 0;
      return (
        <g key={o.id} data-opening={o.id} style={{cursor:"move"}}>
          <line x1={f2(p0[0])} y1={f2(p0[1])} x2={f2(p1[0])} y2={f2(p1[1])} stroke="var(--stage)" strokeWidth={T + .02}/>
          {o.type === "door"
            ? <path d={`M${pt(p0)} L${pt(tip)} A${o.width} ${o.width} 0 0 ${sweep} ${pt(p1)}`} fill={on ? "var(--accent-soft)" : "none"} stroke={ink} strokeWidth={sw}/>
            : <>
                {[-.035, .035].map(k => <line key={k} {...off(k)} stroke={ink} strokeWidth={sw}/>)}
                {isGlassDoor(o) && <line {...off(.12)} stroke={ink} strokeWidth={sw * .7} strokeDasharray=".06 .05"/>/* full-height glass */}
              </>}
          {/* generous invisible hit area so it's easy to grab */}
          <line x1={f2(p0[0])} y1={f2(p0[1])} x2={f2(p1[0])} y2={f2(p1[1])} stroke="transparent" strokeWidth=".4"/>
        </g>
      );
    })}
    {/* wall numbers inside, lengths in cm outside */}
    {ws.map(w => {
      const {dir, normal} = wallFrame(w), mid = alongWall(w, w.len / 2);
      let ang = Math.atan2(dir[1], dir[0]) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
      const inn: Pt = [mid[0] + normal[0] * .32, mid[1] + normal[1] * .32], out: Pt = [mid[0] - normal[0] * .36, mid[1] - normal[1] * .36];
      return (
        <g key={w.i}>
          <circle cx={f2(inn[0])} cy={f2(inn[1])} r=".14" fill="var(--surface, #fff)" stroke="var(--muted)" strokeWidth=".012"/>
          <Label x={inn[0]} y={inn[1]} size={.15} mono fill="var(--ink, #1b2220)">{w.i + 1}</Label>
          <Label x={out[0]} y={out[1]} rot={ang} mono>{`${toCm(w.len)} ${t("cm", null, lang)}`}</Label>
        </g>
      );
    })}
    {/* compass: north arrow, turned by the direction the top of the plan faces (set in the view bar) */}
    <g transform={`translate(${-PAD / 2} ${-PAD / 2}) rotate(${north})`} opacity=".8">
      <title>{t("north", null, lang)}</title>
      <circle r=".2" fill="none" stroke="var(--muted)" strokeWidth=".012"/>
      <path d="M0 -.17 L.06 .05 L0 .01 L-.06 .05 Z" fill="var(--accent)"/>
      <text y="-.24" fontSize=".13" fill="var(--muted)" textAnchor="middle" transform={`rotate(${-north} 0 -.28)`}>{t("northLetter", null, lang)}</text>
    </g>
  </>);
}
