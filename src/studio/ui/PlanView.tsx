// The 2D floor plan panel: select, drag pieces and openings, accept drops from the library.
import { useRef, useState, type SyntheticEvent, type PointerEvent, type DragEvent } from "react";
import { S, clampItem, findItem, isLocked } from "../state.js";
import { nearestWallAny, findOpening, moveOpening } from "../openings.js";
import { startCarry, carry } from "../stacking.js";
import { snapToGuides, showGuides, clearGuides } from "../align.js";
import { toggleInMulti } from "../selection.js";
import { clamp, snap } from "../utils.js";
import { update } from "../app.js";
import { applyPayload, rotateSel, select } from "../actions.js";
import { notify, ui } from "../store.js";
import { t } from "../i18n.js";
import { toCm } from "../geometry.js";
import { syncAll } from "../three/items.js";
import { buildRoom } from "../three/room.js";
import { saveRoom } from "../room-store.js";
import PlanSvg, { planViewBox } from "./PlanSvg";
import { useLang } from "./hooks";
import { MaxButton, ViewRail, viewClass, type MaxProps } from "./ViewMax";
import Hints from "./Hints";

type Drag = {it: any, dx: number, dy: number, riders: any[]} | null;
type DragOpen = {o: any, grab: number, moved: boolean} | null;

export default function PlanView({max, onMax}: MaxProps){
  const lang = useLang();
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null), dragOpen = useRef<DragOpen>(null);
  const [dropOn, setDropOn] = useState(false);

  const svgPoint = (e: {clientX: number, clientY: number}) => {
    const s = svg.current!, p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(s.getScreenCTM()!.inverse());
  };
  const closest = (e: SyntheticEvent | Event, sel: string) => (e.target as Element).closest?.(sel) as HTMLElement | SVGElement | null;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    ui.keyView = "plan";
    const opEl = closest(e, "[data-opening]"), itEl = closest(e, "[data-item]"), wEl = closest(e, "[data-wall]"), fEl = closest(e, "[data-floor]");
    if (opEl){
      // Drag a window/door along its wall, or onto another wall.
      const o = findOpening(opEl.dataset.opening), p = svgPoint(e); if (!o) return;
      // Shift/Ctrl/Cmd+click: add it to the selection as a fixed reference to align pieces with (no drag)
      if (e.shiftKey || e.ctrlKey || e.metaKey){ toggleInMulti(o.id, "opening"); update(); return; }
      dragOpen.current = {o, grab:nearestWallAny(p.x, p.y).along - o.offset, moved:false};
      svg.current!.setPointerCapture(e.pointerId); select({kind:"opening", id:o.id}); return;
    }
    if (wEl){ select({kind:"wall", id:Number(wEl.dataset.wall)}); return; }
    if (itEl){
      const it = findItem(Number(itEl.dataset.item)), p = svgPoint(e); if (!it) return;
      // Shift/Ctrl/Cmd+click: add the piece to the selection, or take it out (no drag)
      if (e.shiftKey || e.ctrlKey || e.metaKey){ toggleInMulti(it.id); update(); return; }
      if (isLocked(it)){ select({kind:"item", id:it.id}); return; }   // locked: select only, no drag
      drag.current = {it, dx:p.x - it.x, dy:p.y - it.y, riders:startCarry(it)};
      svg.current!.setPointerCapture(e.pointerId); select({kind:"item", id:it.id}); return;
    }
    select(fEl ? {kind:"floor"} : null);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = dragOpen.current;
    if (d){
      const p = svgPoint(e), {wall, along} = nearestWallAny(p.x, p.y), o = d.o;
      // keep the grab point under the pointer on the same wall; centre it when switching walls
      const sameWall = wall === o.wall;
      if (moveOpening(o, wall, along - (sameWall ? d.grab : o.width / 2))){
        if (!sameWall) d.grab = o.width / 2;
        d.moved = true; notify(); buildRoom();
      }
      return;
    }
    const g = drag.current; if (!g) return;
    const p = svgPoint(e); g.it.x = snap(p.x - g.dx); g.it.y = snap(p.y - g.dy);
    if (!e.altKey) snapToGuides(g.it, g.riders);   // line up with other pieces (Alt: place freely)
    clampItem(g.it);
    carry(g.it, g.riders);   // things on it come along; it lands on whatever is below
    showGuides(g.it, g.riders);
    notify(); syncAll();
  };

  const endDrag = () => {
    if (dragOpen.current){ const moved = dragOpen.current.moved; dragOpen.current = null; if (moved){ notify(); saveRoom(); } }
    if (drag.current){ drag.current = null; clearGuides(); update(); }
  };

  // HTML5 drop from the library
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDropOn(false);
    const payload = e.dataTransfer.getData("text/plain"); if (!payload) return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const itEl = over?.closest?.("[data-item]") as SVGElement | null;
    const p = svgPoint(e);
    if (itEl && payload.startsWith("furn:")) return applyPayload(payload, {kind:"item", id:Number(itEl.dataset.item), x:p.x, y:p.y});
    applyPayload(payload, {kind:"point", x:clamp(p.x, 0, S.L), y:clamp(p.y, 0, S.W)});
  };

  return (
    <div className={viewClass("plan", max)}>
      <ViewRail title={t("planTitle")} onMax={onMax}/>
      <div className="phead">
        <h2>{t("planTitle")}</h2>
        <div className="phead-tools"><small className="plan-dims" dir="ltr">{toCm(S.L)} × {toCm(S.W)} × {toCm(S.H)} {t("cm")}</small><MaxButton id="plan" max={max} onMax={onMax}/></div>
      </div>
      <div className={"stage" + (dropOn ? " drop-on" : "")}
        onDragOver={e => { e.preventDefault(); setDropOn(true); }} onDragLeave={() => setDropOn(false)} onDrop={onDrop}>
        <svg id="plan" ref={svg} viewBox={planViewBox()} aria-label={t("planAria")}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
          onDoubleClick={e => { if (closest(e, "[data-item]")) rotateSel(); }}>
          <PlanSvg lang={lang} sel={S.sel}/>
        </svg>
        <Hints text={t("planHint")}/>
      </div>
    </div>
  );
}
