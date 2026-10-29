// The plan with the spaces, doors and windows drawn over it, for checking and correcting what the AI read
// (or tracing by hand). Everything is in plan pixels; the logic lives in plan/flat.js.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../../i18n.js";
import { snapPoint, wallLengthsCm, nearestPlanWall, orientCW, newId } from "../../plan/flat.js";
import type { Flat, Space, PlanOpening } from "../../plan/flat";
import type { Point } from "../../types";

export type Tool = "select" | "trace" | "door" | "window";
export type PlanSel = {kind: "space", id: string, corner?: number} | {kind: "opening", id: string} | null;

type Props = {
  flat: Flat;
  imageUrl: string;
  onChange: (f: Flat) => void;
  sel: PlanSel;
  onSelect: (s: PlanSel) => void;
  tool: Tool;
  onTool: (t: Tool) => void;
  bad: Record<string, string>;        // space id -> reason (outline problem or a size that disagrees)
};

type Drag =
  | {kind: "corner", id: string, i: number, moved: boolean}
  | {kind: "end", id: string, end: "a" | "b"}
  | {kind: "new", type: "door" | "window", a: Point, ux: number, uy: number, len: number, t0: number, t1: number};

const centre = (o: Point[]): Point => {
  const xs = o.map(p => p[0]), ys = o.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
const pts = (o: Point[]) => o.map(p => p.join(",")).join(" ");

export default function PlanEditor({flat, imageUrl, onChange, sel, onSelect, tool, onTool, bad}: Props){
  const svgRef = useRef<SVGSVGElement>(null);
  const [k, setK] = useState(1);                     // plan pixels per screen pixel
  const [trace, setTrace] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const flatRef = useRef(flat); flatRef.current = flat;
  const {w, h} = flat.image;
  const tol = 10 * k;

  useLayoutEffect(() => {
    const el = svgRef.current; if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width) setK(Math.max(w / r.width, h / r.height)); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  useEffect(() => { if (tool !== "trace") setTrace([]); }, [tool]);

  const toPlan = (e: {clientX: number, clientY: number}): Point => {
    const svg = svgRef.current!, m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.max(0, Math.min(w, p.x)), Math.max(0, Math.min(h, p.y))];
  };
  const cornersExcept = (id: string | null): Point[] => flat.spaces.filter(s => s.id !== id).flatMap(s => s.outline);

  const setSpace = (id: string, fn: (s: Space) => Space) =>
    onChange({...flatRef.current, spaces:flatRef.current.spaces.map(s => s.id === id ? fn(s) : s)});
  const setOpening = (id: string, fn: (o: PlanOpening) => PlanOpening) =>
    onChange({...flatRef.current, openings:flatRef.current.openings.map(o => o.id === id ? fn(o) : o)});

  function closeTrace(points = trace){
    if (points.length >= 3){
      const id = newId("s");
      const n = flatRef.current.spaces.length + 1;
      onChange({...flatRef.current, spaces:[...flatRef.current.spaces,
        {id, name:t("spaceN", {n}), outline:orientCW(points), sizeText:null, status:"todo", design:null, fromAI:false}]});
      onSelect({kind:"space", id});
      onTool("select");
    }
    setTrace([]);
  }

  // Keys: Enter / Escape / Backspace while tracing; Delete removes the selected corner or opening.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (tool === "trace"){
        if (e.key === "Enter"){ e.preventDefault(); closeTrace(); }
        else if (e.key === "Escape"){ setTrace([]); onTool("select"); }
        else if (e.key === "Backspace"){ e.preventDefault(); setTrace(tr => tr.slice(0, -1)); }
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (sel?.kind === "opening"){
        e.preventDefault();
        onChange({...flat, openings:flat.openings.filter(o => o.id !== sel.id)}); onSelect(null);
      } else if (sel?.kind === "space" && sel.corner != null){
        const s = flat.spaces.find(x => x.id === sel.id);
        if (s && s.outline.length > 3){
          e.preventDefault();
          setSpace(s.id, x => ({...x, outline:x.outline.filter((_, i) => i !== sel.corner), fromAI:false}));
          onSelect({kind:"space", id:s.id});
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // ---- pointer ----
  function onBackgroundDown(e: React.PointerEvent){
    if (tool === "door" || tool === "window"){
      const p = toPlan(e), wall = nearestPlanWall(flat, p, tol * 2);
      if (!wall) return;
      const ux = (wall.b[0] - wall.a[0]) / wall.len, uy = (wall.b[1] - wall.a[1]) / wall.len;
      svgRef.current!.setPointerCapture(e.pointerId);
      setDrag({kind:"new", type:tool, a:wall.a, ux, uy, len:wall.len, t0:wall.t, t1:wall.t});
    } else if (tool === "select" && e.target === e.currentTarget.querySelector("image")){
      onSelect(null);
    }
  }

  function onClick(e: React.MouseEvent){
    if (tool !== "trace") return;
    if (e.detail >= 2){ closeTrace(); return; }
    const raw = toPlan(e);
    if (trace.length >= 3 && Math.hypot(raw[0] - trace[0][0], raw[1] - trace[0][1]) <= tol){ closeTrace(); return; }
    const prev = trace.length ? trace[trace.length - 1] : null;
    const p = e.shiftKey ? raw : snapPoint(raw, prev, [...cornersExcept(null), ...trace], tol);
    setTrace(tr => [...tr, p]);
  }

  function onMove(e: React.PointerEvent){
    const raw = toPlan(e);
    if (tool === "trace"){
      const prev = trace.length ? trace[trace.length - 1] : null;
      setHover(e.shiftKey ? raw : snapPoint(raw, prev, [...cornersExcept(null), ...trace], tol));
    }
    if (!drag) return;
    if (drag.kind === "corner"){
      const s = flatRef.current.spaces.find(x => x.id === drag.id); if (!s) return;
      const n = s.outline.length, prev = s.outline[(drag.i - 1 + n) % n];
      const p = e.shiftKey ? raw : snapPoint(raw, prev, cornersExcept(drag.id), tol);
      setSpace(drag.id, x => ({...x, outline:x.outline.map((q, i) => i === drag.i ? p : q), fromAI:false}));
      if (!drag.moved) setDrag({...drag, moved:true});
    } else if (drag.kind === "end"){
      const o = flatRef.current.openings.find(x => x.id === drag.id); if (!o) return;
      const fixed = drag.end === "a" ? o.b : o.a, other = drag.end === "a" ? o.a : o.b;
      const len = Math.hypot(other[0] - fixed[0], other[1] - fixed[1]) || 1;
      const ux = (other[0] - fixed[0]) / len, uy = (other[1] - fixed[1]) / len;
      const s = Math.max(4 * k, (raw[0] - fixed[0]) * ux + (raw[1] - fixed[1]) * uy);
      const p: Point = [fixed[0] + ux * s, fixed[1] + uy * s];
      setOpening(drag.id, x => ({...x, [drag.end]:p, fromAI:false}));
    } else {
      const t1 = Math.max(0, Math.min(drag.len, (raw[0] - drag.a[0]) * drag.ux + (raw[1] - drag.a[1]) * drag.uy));
      setDrag({...drag, t1});
    }
  }

  function onUp(){
    if (drag?.kind === "new"){
      let s0 = Math.min(drag.t0, drag.t1), s1 = Math.max(drag.t0, drag.t1);
      if (s1 - s0 < 6 * k){
        // A tap: a standard size centred where it landed (90 cm door, 120 cm window; 40 px before the scale is known).
        const size = flat.scale ? (drag.type === "door" ? 0.9 : 1.2) / flat.scale : 40;
        s0 = Math.max(0, Math.min(drag.len - size, drag.t0 - size / 2)); s1 = Math.min(drag.len, s0 + size);
      }
      const at = (s: number): Point => [drag.a[0] + drag.ux * s, drag.a[1] + drag.uy * s];
      const id = newId("o");
      onChange({...flat, openings:[...flat.openings, {id, type:drag.type, a:at(s0), b:at(s1),
        heightCm:drag.type === "door" ? 210 : 120, sillCm:drag.type === "door" ? 0 : 90, fromAI:false}]});
      onSelect({kind:"opening", id});
    } else if (drag?.kind === "corner" && !drag.moved){
      onSelect({kind:"space", id:drag.id, corner:drag.i});
    }
    setDrag(null);
  }

  const selSpace = sel?.kind === "space" ? flat.spaces.find(s => s.id === sel.id) : null;
  const lengths = selSpace && flat.scale ? wallLengthsCm(selSpace.outline, flat.scale) : null;
  const r = 7 * k, fs = 13 * k;

  const tools: [Tool, string][] = [["select", "toolSelect"], ["trace", "toolTrace"], ["door", "toolDoor"], ["window", "toolWindow"]];
  return (
    <div className="pedit">
      <div className="ptools" role="toolbar">
        <div className="seg">
          {tools.map(([v, key]) => (
            <label key={v}><input type="radio" name="planTool" value={v} checked={tool === v} onChange={() => onTool(v)}/><span>{t(key)}</span></label>
          ))}
        </div>
        {tool === "trace" && <button className="btn small primary" type="button" disabled={trace.length < 3} onClick={() => closeTrace()}>{t("finishSpace")}</button>}
        {tool === "trace" && trace.length > 0 && <button className="btn small" type="button" onClick={() => setTrace(tr => tr.slice(0, -1))}>{t("undoCorner")}</button>}
      </div>
      <p className="dnote">{t("hint_" + tool)}</p>
    <svg ref={svgRef} className={"planedit tool-" + tool} viewBox={`0 0 ${w} ${h}`} role="application" aria-label={t("planEditAria")}
      onPointerDown={onBackgroundDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={onClick}
      onPointerLeave={() => setHover(null)}>
      <image href={imageUrl} width={w} height={h}/>
      {flat.spaces.map(s => {
        const on = sel?.kind === "space" && sel.id === s.id, c = centre(s.outline);
        return (
          <g key={s.id} className={"psp" + (on ? " on" : "") + (bad[s.id] ? " bad" : "") + (s.fromAI ? " ai" : "")}>
            <polygon points={pts(s.outline)} vectorEffect="non-scaling-stroke"
              onPointerDown={e => { if (tool === "select"){ e.stopPropagation(); onSelect({kind:"space", id:s.id}); } }}
              onDoubleClick={e => {
                if (tool !== "select") return;
                const p = toPlan(e), wall = nearestPlanWall(flat, p, tol * 2, s.id);
                if (!wall) return;
                const q: Point = [wall.a[0] + (wall.b[0] - wall.a[0]) * wall.t / wall.len, wall.a[1] + (wall.b[1] - wall.a[1]) * wall.t / wall.len];
                setSpace(s.id, x => ({...x, outline:[...x.outline.slice(0, wall.i + 1), q, ...x.outline.slice(wall.i + 1)], fromAI:false}));
                onSelect({kind:"space", id:s.id, corner:wall.i + 1});
              }}/>
            <text x={c[0]} y={c[1]} fontSize={fs} textAnchor="middle" dominantBaseline="middle">{s.name || "—"}</text>
          </g>
        );
      })}
      {flat.openings.map(o => {
        const on = sel?.kind === "opening" && sel.id === o.id;
        return (
          <g key={o.id} className={"pop " + o.type + (on ? " on" : "") + (o.fromAI ? " ai" : "")}>
            <line x1={o.a[0]} y1={o.a[1]} x2={o.b[0]} y2={o.b[1]} vectorEffect="non-scaling-stroke"
              onPointerDown={e => { if (tool === "select"){ e.stopPropagation(); onSelect({kind:"opening", id:o.id}); } }}/>
            {on && (["a", "b"] as const).map(end => (
              <circle key={end} className="handle" cx={o[end][0]} cy={o[end][1]} r={r} vectorEffect="non-scaling-stroke"
                onPointerDown={e => { e.stopPropagation(); svgRef.current!.setPointerCapture(e.pointerId); setDrag({kind:"end", id:o.id, end}); }}/>
            ))}
          </g>
        );
      })}
      {selSpace && tool === "select" && selSpace.outline.map((p, i) => {
        const q = selSpace.outline[(i + 1) % selSpace.outline.length];
        return lengths ? (
          <text key={"l" + i} className="plen" x={(p[0] + q[0]) / 2} y={(p[1] + q[1]) / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle">
            {i + 1} · {lengths[i]}
          </text>
        ) : (
          <text key={"l" + i} className="plen" x={(p[0] + q[0]) / 2} y={(p[1] + q[1]) / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle">{i + 1}</text>
        );
      })}
      {selSpace && tool === "select" && selSpace.outline.map((p, i) => (
        <circle key={"c" + i} className={"handle" + (sel?.kind === "space" && sel.corner === i ? " on" : "")} cx={p[0]} cy={p[1]} r={r} vectorEffect="non-scaling-stroke"
          onPointerDown={e => { e.stopPropagation(); svgRef.current!.setPointerCapture(e.pointerId); setDrag({kind:"corner", id:selSpace.id, i, moved:false}); }}/>
      ))}
      {drag?.kind === "new" && (
        <line className={"pop new " + drag.type} vectorEffect="non-scaling-stroke"
          x1={drag.a[0] + drag.ux * drag.t0} y1={drag.a[1] + drag.uy * drag.t0} x2={drag.a[0] + drag.ux * drag.t1} y2={drag.a[1] + drag.uy * drag.t1}/>
      )}
      {tool === "trace" && trace.length > 0 && (
        <g className="ptrace">
          <polyline points={pts(hover ? [...trace, hover] : trace)} vectorEffect="non-scaling-stroke"/>
          {trace.map((p, i) => <circle key={i} className={i === 0 ? "first" : ""} cx={p[0]} cy={p[1]} r={r * (i === 0 ? 1.3 : 0.8)} vectorEffect="non-scaling-stroke"/>)}
        </g>
      )}
    </svg>
    </div>
  );
}
