// The centre panel: before/after comparison, brush editing, furniture tags and the render strip.
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { FURNITURE, STYLES, type Furniture } from "./data";
import { t, nameOf, money } from "./settings";
import type { Img } from "./images";

export type Render = Img & {id: string, styleId: string, kind: "render" | "edit", secs: string};
export type FurnItem = {uid: string, catId: string, x: number, y: number, z: number};
export type Mode = "none" | "edit" | "furn";

// The brush mask, drawn at the render's full resolution (white = change, black = keep).
export type Mask = {canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, painted: boolean};
export function newMask(w: number, h: number): Mask{
  const canvas = Object.assign(document.createElement("canvas"), {width: w, height: h});
  const m = {canvas, ctx: canvas.getContext("2d")!, painted: false};
  clearMask(m);
  return m;
}
export function clearMask(m: Mask){
  m.ctx.fillStyle = "#000";
  m.ctx.fillRect(0, 0, m.canvas.width, m.canvas.height);
  m.painted = false;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const Icon = ({f}: {f: Furniture}) => <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{__html: f.icon}}/>;

export function renderLabel(r: Render){
  if (r.kind === "edit") return t("editOf", {s: r.secs});
  const style = STYLES.find(s => s.id === r.styleId);
  return t("renderOf", {style: style ? nameOf(style) : "", s: r.secs});
}

// The visible brush strokes over the photo; `version` changes whenever the mask is cleared.
function BrushCanvas({mask, size, version, frame}: {mask: Mask, size: number, version: number, frame: RefObject<HTMLDivElement | null>}){
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{x: number, y: number} | null | false>(false);
  const queued = useRef(false);

  const redraw = () => {
    const bc = ref.current; if (!bc) return;
    const ctx = bc.getContext("2d", {willReadFrequently: true})!;
    ctx.clearRect(0, 0, bc.width, bc.height);
    if (!mask.painted) return;
    // Show white mask areas as a translucent accent colour.
    const tmp = Object.assign(document.createElement("canvas"), {width: bc.width, height: bc.height});
    const tctx = tmp.getContext("2d", {willReadFrequently: true})!;
    tctx.drawImage(mask.canvas, 0, 0, bc.width, bc.height);
    const id = tctx.getImageData(0, 0, bc.width, bc.height);
    for (let i = 0; i < id.data.length; i += 4){
      const a = id.data[i];
      id.data[i] = 214; id.data[i + 1] = 92; id.data[i + 2] = 60; id.data[i + 3] = a * 0.55;
    }
    ctx.putImageData(id, 0, 0);
  };
  const queue = () => {
    if (queued.current) return;
    queued.current = true;
    requestAnimationFrame(() => { queued.current = false; redraw(); });
  };

  // Match the frame's on-screen size (sharp on high-density screens).
  useEffect(() => {
    const fit = () => {
      const bc = ref.current, f = frame.current; if (!bc || !f) return;
      const rect = f.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      bc.width = Math.round(rect.width * dpr); bc.height = Math.round(rect.height * dpr);
      redraw();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [mask]);
  useEffect(redraw, [version]);

  const toMask = (e: PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * mask.canvas.width,
      y: (e.clientY - rect.top) / rect.height * mask.canvas.height,
      scale: mask.canvas.width / rect.width
    };
  };
  const paint = (e: PointerEvent) => {
    const p = toMask(e), last = drawing.current, ctx = mask.ctx, w = size * p.scale;
    ctx.strokeStyle = ctx.fillStyle = "#fff";
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = w;
    ctx.beginPath();
    if (last){ ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    else { ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2); ctx.fill(); }
    drawing.current = p;
    mask.painted = true;
    queue();
  };
  const stop = () => { drawing.current = false; };
  return <canvas id="brushCanvas" ref={ref}
    onPointerDown={e => { ref.current!.setPointerCapture(e.pointerId); drawing.current = null; paint(e); }}
    onPointerMove={e => { if (drawing.current !== false) paint(e); }}
    onPointerUp={stop} onPointerCancel={stop}/>;
}

// One furniture tag on the photo: drag it, nudge it with the arrow keys, Delete removes it.
function FurnTag({item, selected, frame, onSelect, onMove, onRemove}: {
  item: FurnItem, selected: boolean, frame: RefObject<HTMLDivElement | null>,
  onSelect: () => void, onMove: (x: number, y: number) => void, onRemove: () => void
}){
  const cat = FURNITURE.find(f => f.id === item.catId)!;
  const drag = useRef<{cx: number, cy: number, x: number, y: number, rect: DOMRect} | null>(null);
  const [dragging, setDragging] = useState(false);

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1.5;
    let {x, y} = item;
    if (e.key === "ArrowUp") y = clamp(y - step, 4, 98);
    else if (e.key === "ArrowDown") y = clamp(y + step, 4, 98);
    else if (e.key === "ArrowLeft") x = clamp(x - step, 2, 98);
    else if (e.key === "ArrowRight") x = clamp(x + step, 2, 98);
    else if (e.key === "Delete" || e.key === "Backspace"){ e.preventDefault(); onRemove(); return; }
    else return;
    e.preventDefault();
    onMove(x, y);
  };
  const end = () => { drag.current = null; setDragging(false); };
  return (
    <div className={"furn-item" + (selected ? " selected" : "") + (dragging ? " dragging" : "")} tabIndex={0} role="group"
      aria-label={`${nameOf(cat)} · ${money(cat.price)}`} style={{left: item.x + "%", top: item.y + "%", zIndex: item.z}}
      onFocus={onSelect} onKeyDown={onKey}
      onPointerDown={e => {
        if ((e.target as Element).closest(".fremove")) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {cx: e.clientX, cy: e.clientY, x: item.x, y: item.y, rect: frame.current!.getBoundingClientRect()};
        setDragging(true); onSelect();
      }}
      onPointerMove={e => {
        const d = drag.current; if (!d) return;
        onMove(clamp(d.x + (e.clientX - d.cx) / d.rect.width * 100, 2, 98), clamp(d.y + (e.clientY - d.cy) / d.rect.height * 100, 4, 98));
      }}
      onPointerUp={end} onPointerCancel={end}>
      <span className="ftag">
        <Icon f={cat}/>
        <span className="fn">{nameOf(cat)}</span><span className="fp">{money(cat.price)}</span>
        <button type="button" className="fremove" aria-label={t("remove")} onClick={e => { e.stopPropagation(); onRemove(); }}>
          <span aria-hidden="true">✕</span>
        </button>
      </span>
      <span className="fpin" aria-hidden="true"/>
    </div>
  );
}

// "Rendering…" with a running timer.
export function Loading({text}: {text: string}){
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const h = setInterval(() => setSecs((performance.now() - t0) / 1000), 100);
    return () => clearInterval(h);
  }, []);
  return (
    <div className="loading" id="loading">
      <div className="spinner"/>
      <p id="loadingText">{text}</p>
      <p className="timer" id="timer">{secs.toFixed(1)}s</p>
    </div>
  );
}

type Props = {
  original: Img | null; renders: Render[]; active: Render | null; busy: string | null;
  mode: Mode; setMode: (m: Mode) => void; onPick: (id: string) => void;
  furniture: FurnItem[]; setFurniture: (fn: (list: FurnItem[]) => FurnItem[]) => void;
  mask: Mask | null; maskVersion: number; onClearMask: () => void;
  editPrompt: string; setEditPrompt: (s: string) => void; onApplyEdit: () => void;
};

export default function Viewer(p: Props){
  const {original, active, mode} = p;
  const frame = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [brush, setBrush] = useState(40);
  const [selected, setSelected] = useState<string | null>(null);
  const [dropReady, setDropReady] = useState(false);
  const furnZ = useRef(0);
  const editInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mode === "edit") editInput.current?.focus({preventScroll: true}); }, [mode]);

  const place = (catId: string, x = 50, y = 55) => {
    if (!original) return;
    const uid = "f" + Date.now() + Math.random().toString(36).slice(2, 6);
    p.setFurniture(list => {
      const n = list.length;
      // Cascade repeated taps in a loose grid so they land apart, not stacked exactly.
      const col = n % 5, row = Math.floor(n / 5) % 4;
      const jx = x === 50 ? col * 11 - 22 : 0, jy = x === 50 ? row * 10 - 15 : 0;
      return [...list, {uid, catId, x: clamp(x + jx, 4, 96), y: clamp(y + jy, 8, 96), z: ++furnZ.current}];
    });
    setSelected(uid);
  };
  const remove = (uid: string) => {
    p.setFurniture(list => list.filter(i => i.uid !== uid));
    if (selected === uid) setSelected(null);
  };
  const isFurnDrag = (e: DragEvent) => e.dataTransfer?.types.includes("text/plain");
  const onDrop = (e: DragEvent) => {
    setDropReady(false);
    const catId = e.dataTransfer?.getData("text/plain");
    if (!catId || !FURNITURE.find(f => f.id === catId)) return;
    e.preventDefault();
    const rect = frame.current!.getBoundingClientRect();
    place(catId, (e.clientX - rect.left) / rect.width * 100, (e.clientY - rect.top) / rect.height * 100);
  };

  // Size the frame to the image's exact proportions (capped at 72% of screen height)
  // so the brush lines up with the picture pixel-for-pixel.
  const shown = mode === "edit" && active ? active : original;
  const frameStyle = shown ? {
    aspectRatio: `${shown.w} / ${shown.h}`,
    width: `min(100%, calc(72vh * ${(shown.w / shown.h).toFixed(4)}))`,
    "--pos": pos + "%"
  } as CSSProperties : undefined;
  const subtotal = p.furniture.reduce((s, i) => s + (FURNITURE.find(f => f.id === i.catId)?.price || 0), 0);

  return (
    <section className="panel viewer">
      <div className="stage" id="stage">
        {!original ? (
          <div className="empty" id="emptyState">
            <p className="empty-title">{t("emptyTitle")}</p>
            <p className="empty-sub">{t("emptySub")}</p>
          </div>
        ) : (
          <div ref={frame} id="frame" style={frameStyle}
            className={"frame" + (active ? " comparing" : "") + (mode === "edit" ? " editing" : "") + (dropReady ? " furn-drop-ready" : "")}
            onDragEnter={e => { if (isFurnDrag(e)){ e.preventDefault(); setDropReady(true); } }}
            onDragOver={e => { if (isFurnDrag(e)){ e.preventDefault(); setDropReady(true); } }}
            onDragLeave={() => setDropReady(false)} onDrop={onDrop}>
            <img id="imgBefore" src={original.src} alt="" draggable={false}/>
            {active && <img id="imgAfter" src={active.src} alt="" draggable={false}/>}
            {mode === "edit" && p.mask && <BrushCanvas mask={p.mask} size={brush} version={p.maskVersion} frame={frame}/>}
            <span className="tag tag-before">{t("before")}</span>
            <span className="tag tag-after">{t("after")}</span>
            <input type="range" id="compare" min="0" max="100" value={pos} aria-label="Before / after" onChange={e => setPos(Number(e.target.value))}/>
            <div className="handle" id="handle" aria-hidden="true"><span/></div>
            <div className="furn-layer" id="furnLayer">
              {p.furniture.filter(i => FURNITURE.some(f => f.id === i.catId)).map(item =>
                <FurnTag key={item.uid} item={item} selected={item.uid === selected} frame={frame}
                  onSelect={() => setSelected(item.uid)} onRemove={() => remove(item.uid)}
                  onMove={(x, y) => p.setFurniture(list => list.map(i => i.uid === item.uid ? {...i, x, y} : i))}/>)}
            </div>
          </div>
        )}
        {p.busy && <Loading text={p.busy}/>}
      </div>

      {original && (
        <div className="viewer-tools" id="viewerTools">
          <div className="tool-row">
            {mode !== "edit" && <button className="secondary" type="button" disabled={!active} onClick={() => p.setMode("edit")}>{t("editArea")}</button>}
            <button className="secondary" type="button" aria-pressed={mode === "furn"} onClick={() => p.setMode(mode === "furn" ? "none" : "furn")}>{t("furnitureToggle")}</button>
            <span className="muted small" id="renderMeta">{active ? renderLabel(active) : ""}</span>
          </div>
          {mode === "edit" && (
            <div className="edit-bar" id="editBar">
              <p className="small muted">{t("editHelp")}</p>
              <div className="edit-row">
                <label className="field inline"><span>{t("brush")}</span><input type="range" min="10" max="120" value={brush} onChange={e => setBrush(Number(e.target.value))}/></label>
                <button className="ghost" type="button" onClick={p.onClearMask}>{t("clear")}</button>
              </div>
              <div className="edit-row">
                <input ref={editInput} type="text" placeholder={t("editPh")} value={p.editPrompt} onChange={e => p.setEditPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter"){ e.preventDefault(); p.onApplyEdit(); } }}/>
                <button className="primary" type="button" disabled={!!p.busy} onClick={p.onApplyEdit}>{t("apply")}</button>
                <button className="ghost" type="button" onClick={() => p.setMode("none")}>{t("cancel")}</button>
              </div>
            </div>
          )}
          {mode === "furn" && (
            <div className="furn-bar" id="furnBar">
              <p className="small muted">{t("furnitureHint")}</p>
              <div className="furn-catalog" id="furnCatalog">
                {FURNITURE.map(f => (
                  <button key={f.id} type="button" className="furn-chip" draggable onClick={() => place(f.id)}
                    onDragStart={e => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", f.id); }}>
                    <Icon f={f}/><span className="fname">{nameOf(f)}</span><span className="fprice">{money(f.price)}</span>
                  </button>
                ))}
              </div>
              {p.furniture.length > 0 && (
                <div className="furn-summary" id="furnSummary">
                  <span>{t("furnSummary", {n: p.furniture.length, total: money(subtotal)})}</span>
                  <button className="ghost" type="button" onClick={() => { p.setFurniture(() => []); setSelected(null); }}>{t("clearFurniture")}</button>
                </div>
              )}
            </div>
          )}
          <div className="strip" id="strip">
            {p.renders.map(r => (
              <button key={r.id} type="button" className={"thumb" + (r.id === active?.id ? " active" : "")} title={renderLabel(r)}
                onClick={() => { p.setMode(mode === "edit" ? "none" : mode); p.onPick(r.id); }}>
                <img src={r.src} alt=""/><span>{renderLabel(r)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
