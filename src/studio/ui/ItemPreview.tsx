// A furniture piece seen before it's added: clicking a library tile opens its preview, a small 3D view of
// the piece turning slowly (drag to turn it) with its size, price and group, and "Add to room". Beside the
// library on wide screens; a sheet from the bottom on narrow ones. On a mouse, resting on a tile shows a
// smaller card with the picture first (nothing 3D).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FU, furnCat } from "../catalog.js";
import { fmt } from "../utils.js";
import { notify, ui } from "../store.js";
import { applyPayload } from "../actions.js";
import { t, nameOf, getLang } from "../i18n.js";
import { priceOf } from "../settings.js";
import { thumbOf } from "../thumbs.js";
import { useMedia } from "./hooks";
import { IconClose, IconPlus, IconRotate, IconFocus } from "./Icons";

const NARROW = "(max-width:999px)";   // the one-column layout (studio.css): the preview is a bottom sheet
const MOUSE = "(hover:hover) and (pointer:fine)";
export const hasMouse = () => matchMedia(MOUSE).matches;

let three: Promise<typeof import("../three/preview.js")> | null = null;
const preview = () => three ??= import("../three/preview.js");

export function openPreview(id: string | null){ ui.libPreview = ui.libPreview === id ? null : id; notify(); }
export function closePreview(){ if (ui.libPreview){ ui.libPreview = null; notify(); } }
function add(id: string){ ui.libPreview = null; applyPayload(`furn:${id}`, null); }

// The picture until the 3D is drawn, then the 3D over it.
function Stage({f}: {f: any}){
  const el = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false), [touched, setTouched] = useState(false);
  const [spin, setSpin] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const mods = useRef<Awaited<ReturnType<typeof preview>> | null>(null);
  useEffect(() => {
    setLive(false); setTouched(false); setSpin(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    let stop: (() => void) | null = null, gone = false;
    preview().then(m => {
      if (gone || !el.current) return;
      mods.current = m;
      stop = m.showPreview(el.current, f.id, {onReady:() => setLive(true), onTouched:() => setTouched(true)});
    }).catch(e => { if (import.meta.env?.DEV) console.warn("[preview]", e?.message || e); });   // no WebGL: the picture stays
    return () => { gone = true; stop?.(); };
  }, [f.id]);
  const pic = thumbOf(f);
  return (
    <div className={"ipv-stage" + (live ? " live" : "") + (touched ? " touched" : "")}>
      <div ref={el} className="ipv-canvas"/>
      {pic && <img className="ipv-pic" src={pic} alt="" draggable={false}/>}
      <div className="ipv-tools">
        <button type="button" className="ipv-ib" aria-pressed={spin} title={t("previewSpin")} aria-label={t("previewSpin")}
          onClick={() => mods.current && setSpin(mods.current.toggleSpin())}><IconRotate/></button>
        <button type="button" className="ipv-ib" title={t("previewReset")} aria-label={t("previewReset")}
          onClick={() => mods.current?.resetPreview()}><IconFocus/></button>
      </div>
      <p className="ipv-how">{t(hasMouse() ? "previewHowMouse" : "previewHowTouch")}</p>
    </div>
  );
}

function Facts({f}: {f: any}){
  return (
    <dl className="ipv-facts">
      <dt>{t("factSize")}</dt><dd><bdi>{Math.round(f.w * 100)} × {Math.round(f.d * 100)} × {Math.round(f.h * 100)} {t("cm")}</bdi></dd>
      <dt>{t("factPrice")}</dt><dd><bdi>{fmt(priceOf(f.id))}</bdi></dd>
      <dt>{t("factGroup")}</dt><dd><span className="ipv-tag">{t("cat_" + furnCat(f))}</span></dd>
      {f.surface && <><dt>{t("factHolds")}</dt><dd>{t("factHoldsText")}</dd></>}
    </dl>
  );
}

// The other language's name under the name, when there is one.
const otherName = (f: any) => { const o = nameOf(f, getLang() === "ar" ? "en" : "ar"); return o !== nameOf(f) ? o : null; };

export function ItemPreview(){
  const narrow = useMedia(NARROW);
  const box = useRef<HTMLDivElement>(null);
  const f = ui.libPreview ? FU[ui.libPreview] : null;

  // Escape, or a press anywhere else (but a library tile, which opens its own), closes it.
  useEffect(() => {
    if (!f) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape"){ e.stopPropagation(); closePreview(); } };
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element;
      if (!box.current?.contains(el) && !el.closest?.(".library .tile")) closePreview();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true); };
  }, [Boolean(f)]);
  // Swipe the sheet down to close it.
  const drag = useRef<number | null>(null);
  const grab = {
    onPointerDown:(e: React.PointerEvent) => { drag.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); box.current!.style.transition = "none"; },
    onPointerMove:(e: React.PointerEvent) => { if (drag.current !== null) box.current!.style.translate = `0 ${Math.max(0, e.clientY - drag.current)}px`; },
    onPointerUp:(e: React.PointerEvent) => {
      if (drag.current === null) return;
      const dy = e.clientY - drag.current; drag.current = null;
      box.current!.style.transition = ""; box.current!.style.translate = "";
      if (dy > 80) closePreview();
    }
  };
  if (!f) return null;

  const other = otherName(f);
  const body = (
    <div ref={box} className={"ipv " + (narrow ? "bottom" : "side")} role="dialog" aria-label={nameOf(f)}>
      {narrow && <div className="ipv-grab" aria-hidden="true" {...grab}/>}
      <Stage f={f}/>
      <div className="ipv-info">
        <div className="ipv-head">
          <div><h3>{nameOf(f)}</h3>{other && <p className="ipv-other">{other}</p>}</div>
          <button type="button" className="ipv-ib" title={t("close")} aria-label={t("close")} onClick={closePreview}><IconClose/></button>
        </div>
        <Facts f={f}/>
        <button type="button" className="btn primary ipv-add" onClick={() => add(f.id)}><IconPlus/><span>{t("addToRoom")}</span></button>
      </div>
    </div>
  );
  return narrow ? createPortal(<><div className="ipv-scrim" onClick={closePreview}/>{body}</>, document.body) : body;
}

// The card shown while the mouse rests on a tile: the bigger picture, size and price.
export function HoverCard({f, top}: {f: any, top: number}){
  const pic = thumbOf(f);
  return (
    <div className="ihov" style={{top}} aria-hidden="true">
      <div className="ihov-pic">{pic && <img src={pic} alt=""/>}</div>
      <b>{nameOf(f)}</b>
      <span className="ihov-row"><bdi>{Math.round(f.w * 100)}×{Math.round(f.d * 100)}×{Math.round(f.h * 100)} {t("cm")}</bdi><bdi>{fmt(priceOf(f.id))}</bdi></span>
      <span className="ihov-tip">{t("hoverTip")}</span>
    </div>
  );
}
