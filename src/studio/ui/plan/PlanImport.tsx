// "I have a floor plan": upload an image or PDF; the rooms are read from the walls (readPlan.ts) and the AI
// reads their names and written sizes; correct it on top of the plan, set the scale and ceiling height,
// then start designing.
import { useEffect, useReducer, useRef, useState } from "react";
import { t } from "../../i18n.js";
import { setCode } from "../../render-ai.js";
import { newFlat, orientCW, outlineProblem, scaleFromSizes, scaleFromWall, strayOpenings, withSizeScale } from "../../plan/flat.js";
import { realSpace, realOverlaps, rescale, resetReal, syncTracing, planLayout } from "../../plan/real.js";
import { roomBox, planCorrection, applyCorrection, type Correction, type CorrectionPlan } from "../../plan/correct.js";
import RealFlatView from "./RealFlatView";
import CorrectDialog from "./CorrectDialog";
import { polyArea } from "../../geometry.js";
import type { Flat } from "../../plan/flat";
import NumField from "../NumField";
import PlanEditor, { type PlanSel, type Tool } from "./PlanEditor";
import { AccountButton } from "../AccountDialog";
import { useLang } from "../hooks";
import { loadImage } from "./image";
import { readPlan as readFromWalls, type WallHandle } from "./readPlan";

const MAX_EDIT = 2400;

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isCad = (f: File) => /\.(dwg|dxf)$/i.test(f.name);

type Props = {
  initialFlat: Flat | null;            // "Edit plan" from the flat screen
  imageUrl?: string | null;            // the plan image when the flat keeps it in the cloud (image.path)
  onDone: (flat: Flat, isNew: boolean) => void;   // isNew: a new plan, not the same flat corrected
  onCancel: () => void;
  onAccount: () => void;
  onLang: () => void;
};

export default function PlanImport(props: Props){
  useLang();
  const [flat, setFlat] = useState<Flat | null>(props.initialFlat);
  const [pdf, setPdf] = useState<{file: File, pages: number, page: number, preview: string | null} | null>(null);
  const [sel, setSel] = useState<PlanSel>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [status, setStatus] = useState<{text: string, err: boolean}>({text:"", err:false});
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCodeText] = useState("");
  const [armRescale, setArmRescale] = useState(false);   // the next number rescales the whole plan
  const [ask, setAsk] = useState<{kind: "scale" | "line", f: Flat, c: Correction, plan?: CorrectionPlan, side?: number} | null>(null);
  const [last, setLast] = useState<{before: Flat, c: Correction, otherSide: number} | null>(null);   // "move the other side"
  const [layout, setLayout] = useState<"stacked" | "side" | null>(() => { try { return (localStorage.getItem("rp_plan_layout") as any) || null; } catch { return null; } });
  const [isNew, setIsNew] = useState(!props.initialFlat);
  const [armRead, setArmRead] = useState(false);       // "Read again" over designed spaces waits for a second click
  const codeRef = useRef<HTMLInputElement>(null);
  const walls = useRef<WallHandle | null>(null);      // for click-to-fill and doors on gaps; not saved
  const current = useRef<Flat["image"] | null>(null); // the image being read
  current.current = flat?.image ?? null;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Editing a saved flat: read its walls again (no AI, nothing replaced) so the fill tool and gap doors work.
  useEffect(() => {
    const f = props.initialFlat, src = f?.image.dataUrl || props.imageUrl;
    if (!f || !src) return;
    readFromWalls({dataUrl:src, w:f.image.w, h:f.image.h}, {ai:false, t}).then(r => { walls.current = r.walls; redraw(); }).catch(() => {});
  }, [props.imageUrl]);
  const say = (text: string, err = false) => setStatus({text, err});
  // A tracing edit: the scale follows the written sizes, and a real flat that differs follows the edit.
  const change = (f: Flat) => setFlat(prev => prev ? syncTracing(prev, withSizeScale(f)) : withSizeScale(f));

  async function readPlan(f: Flat){
    // Reading again replaces the spaces: designs carry over only to spaces with the same name.
    if (f.spaces.some(s => s.design) && !armRead){ setArmRead(true); say(t("rereadSure"), true); return; }
    setArmRead(false);
    setBusy(true); setNeedCode(false);
    say(t("readingWalls"));
    try {
      const src = f.image.dataUrl || props.imageUrl || "";
      const r = await readFromWalls({dataUrl:src, w:f.image.w, h:f.image.h}, {ai:true, t});
      if (current.current && current.current !== f.image) return;     // another plan was picked meanwhile
      walls.current = r.walls;
      if (r.needCode){ setNeedCode(true); setTimeout(() => codeRef.current?.focus()); }
      const byName = new Map(f.spaces.filter(s => s.design && s.name.trim()).map(s => [s.name.trim().toLowerCase(), s]));
      const spaces = r.flat.spaces.map(s => {
        const old = byName.get(s.name.trim().toLowerCase());
        if (!old || !s.name.trim()) return s;
        byName.delete(s.name.trim().toLowerCase());
        return {...s, id:old.id, design:old.design, status:old.status};
      });
      const next = {...r.flat, spaces, image:f.image, H:f.H};
      setFlat(next); setSel(null); setTool("select");
      const sure = next.spaces.filter(x => !x.suggested).length, sug = next.spaces.length - sure;
      const found = next.spaces.length ? [t("planRead", {s:sure, o:next.openings.length}), sug ? t("planSuggested", {n:sug}) : "", next.scale ? t("planCheck") : t("planNeedScale")].filter(Boolean).join(" ") : "";
      say([r.notice, found || (r.walls.ok ? t("planNone") : "")].filter(Boolean).join(" "), Boolean(r.notice) || !next.spaces.length);
    } catch { say(t("planImageErr"), true); }
    finally { setBusy(false); }
  }

  async function useImage(img: {dataUrl: string, w: number, h: number}){
    const f = newFlat(img);
    walls.current = null;                               // the old plan's walls must not be used on this one
    setFlat(f); setPdf(null); setSel(null); setIsNew(true); setArmRead(false);
    await readPlan(f);
  }

  async function pickFile(file: File | undefined){
    if (!file) return;
    say("");
    if (isCad(file)){ say(t("planCad"), true); return; }
    try {
      if (isPdf(file)){
        setBusy(true); say(t("pdfOpening"));
        const {pdfPageCount, renderPdfPage} = await import("../../plan/pdf.js");
        const pages = await pdfPageCount(file);
        if (pages === 1){ await useImage(await renderPdfPage(file, 1, MAX_EDIT)); return; }
        const first = await renderPdfPage(file, 1, 600);
        setFlat(null); setSel(null);   // the page picker shows instead of the plan
        setPdf({file, pages, page:1, preview:first.dataUrl}); say("");
        return;
      }
      const url = URL.createObjectURL(file);
      try { await useImage(await loadImage(url, MAX_EDIT)); } finally { URL.revokeObjectURL(url); }
    } catch { say(t("planFileErr"), true); }
    finally { setBusy(false); }
  }

  async function showPage(page: number){
    if (!pdf) return;
    const {renderPdfPage} = await import("../../plan/pdf.js");
    setPdf({...pdf, page, preview:null});
    try { const r = await renderPdfPage(pdf.file, page, 600); setPdf(p => p && p.page === page ? {...p, preview:r.dataUrl} : p); } catch { say(t("planFileErr"), true); }
  }

  async function usePage(){
    if (!pdf) return;
    setBusy(true);
    try {
      const {renderPdfPage} = await import("../../plan/pdf.js");
      await useImage(await renderPdfPage(pdf.file, pdf.page, MAX_EDIT));
    } catch { say(t("planFileErr"), true); }
    finally { setBusy(false); }
  }

  const header = (
    <header className="bar">
      <div className="brand"><strong>RoomPitch</strong><span className="tag">{t("planTitleTag")}</span></div>
      <div className="tools"><AccountButton onOpen={props.onAccount}/><button className="btn langbtn" type="button" onClick={props.onLang}>{t("langBtn")}</button></div>
    </header>
  );
  const statusLine = <p className={"dnote" + (status.err ? " err" : "")} role="status">{status.text}</p>;
  const codeRow = needCode && (
    <div className="coderow">
      <label htmlFor="accessCode3">{t("accessLabel")}</label>
      <input id="accessCode3" ref={codeRef} type="password" autoComplete="off" value={code} onChange={e => setCodeText(e.target.value)}/>
      <button className="btn" type="button" onClick={() => { setCode(code.trim()); if (flat) readPlan(flat); }}>{t("send")}</button>
    </div>
  );
  const fileButton = (label: string, primary = false) => (
    <label className={"btn filebtn" + (primary ? " primary" : "")}><span>{label}</span>
      <input type="file" accept="image/*,.pdf,application/pdf,.dwg,.dxf" disabled={busy} onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }}/>
    </label>
  );

  // ---- 1. upload, 2. PDF page ----
  if (!flat){
    return (
      <section className="setup wrap">
        {header}
        <div className="choose planup">
          <h1>{t("planUpTitle")}</h1>
          <p className="dnote">{t("planUpSub")}</p>
          {!pdf && <div className="acts2">{fileButton(t("planPick"), true)}</div>}
          {pdf && (
            <div className="pdfpick">
              <label><span>{t("pdfPage")}</span>
                <select value={pdf.page} disabled={busy} onChange={e => showPage(Number(e.target.value))}>
                  {Array.from({length:pdf.pages}, (_, i) => <option key={i} value={i + 1}>{t("pdfPageN", {n:i + 1, of:pdf.pages})}</option>)}
                </select></label>
              <div className="pdfprev">{pdf.preview ? <img src={pdf.preview} alt=""/> : <span className="dnote">{t("pdfOpening")}</span>}</div>
              <div className="acts2">
                <button className="btn primary" type="button" disabled={busy} onClick={usePage}>{t("pdfUse")}</button>
                {fileButton(t("planOther"))}
              </div>
            </div>
          )}
          {statusLine}
          <div className="setup-actions"><button className="btn" type="button" onClick={props.onCancel}>{t("backChoice")}</button></div>
        </div>
      </section>
    );
  }

  // ---- 3. check and correct ----
  const imageUrl = flat.image.dataUrl || props.imageUrl || "";
  const {flagged} = flat.scaleFrom === "sizes" ? scaleFromSizes(flat) : {flagged:[] as string[]};
  const bad: Record<string, string> = {};
  for (const s of flat.spaces){
    const p = outlineProblem(s.outline);
    if (p) bad[s.id] = t("outline_" + p);
    else if (flagged.includes(s.id)) bad[s.id] = t("sizeDisagrees");
  }
  const sugCount = flat.spaces.filter(s => s.suggested).length;
  const blockers = !flat.spaces.length ? t("needSpace") : !flat.scale ? t("needScale")
    : sugCount ? t("needConfirm", {n:sugCount})
    : flat.spaces.some(s => outlineProblem(s.outline)) ? t("needFixOutline") : "";
  const stray = strayOpenings(flat);
  const selSpace = sel?.kind === "space" ? flat.spaces.find(s => s.id === sel.id) || null : null;
  const selOpen = sel?.kind === "opening" ? flat.openings.find(o => o.id === sel.id) || null : null;
  const selReal = selSpace && flat.scale ? realSpace(flat, selSpace.id) : null;
  const lens = selReal ? selReal.poly.map((p, i) => { const q = selReal.poly[(i + 1) % selReal.poly.length]; return Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) * 1000) / 10; }) : null;
  const box = selSpace && flat.scale ? roomBox(flat, selSpace.id) : null;
  const overlaps = flat.scale ? realOverlaps(flat) : [];
  const shownLayout = layout || planLayout(flat.image);
  const setSpace = (id: string, patch: object) => change({...flat, spaces:flat.spaces.map(s => s.id === id ? {...s, ...patch} : s)});
  const setOpen = (id: string, patch: object) => change({...flat, openings:flat.openings.map(o => o.id === id ? {...o, ...patch, fromAI:false} : o)});

  // A typed size. No scale yet: it sets the scale. The first time: ask whether the whole plan is off (rescale,
  // nothing moves) or only this room or wall (a correction of the real flat).
  const shownCm = (c: Correction) => c.kind === "room" ? (c.axis === "width" ? box!.width : box!.length) : lens![c.i];
  function onNumber(c: Correction){
    const f = flat!;
    if (!(c.cm > 0) || !selSpace) return;
    if (!f.scale){
      const o = orientCW(selSpace.outline), i = c.kind === "room" ? (c.axis === "width" ? 0 : 1) : c.i, a = o[i % o.length], b = o[(i + 1) % o.length];
      const scale = scaleFromWall(Math.hypot(b[0] - a[0], b[1] - a[1]), c.cm);
      if (scale) setFlat({...f, scale, scaleFrom:"wall", scaleAsked:true});
      return;
    }
    if (armRescale){ setArmRescale(false); whole(f, c); return; }
    if (!f.scaleAsked){ setAsk({kind:"scale", f, c}); return; }
    correct(f, c);
  }
  function whole(f: Flat, c: Correction){
    const shown = shownCm(c);
    if (shown > 0) setFlat({...rescale(f, c.cm / shown), scaleAsked:true, scaleFrom:"wall"});
  }
  function correct(f: Flat, c: Correction, side?: number){
    const plan = planCorrection(f, c, {side});
    if (!plan.ok){ if (plan.reason !== "noChange") say(t(plan.reason === "noScale" ? "needScale" : plan.reason), true); return; }
    if (plan.runsPast || plan.affected.slice(1).some(a => a.confirmed)){ setAsk({kind:"line", f, c, plan, side}); return; }
    finish(f, c, plan, true, side);
  }
  function finish(f: Flat, c: Correction, plan: CorrectionPlan, isWhole: boolean, side?: number){
    if (!plan.ok) return;
    setFlat(applyCorrection(f, c, {whole:isWhole, side:side ?? plan.side}));
    setLast(plan.otherSide != null ? {before:f, c, otherSide:plan.otherSide} : null);
    say(plan.outsideMoved ? t("outsideMoved") : "");
  }
  // the last correction again from before it, on the room's other side
  function otherSide(){
    if (!last) return;
    const {before, c, otherSide: side} = last;
    setLast(null);
    correct(before, c, side);
  }
  const pickLayout = (v: "stacked" | "side") => { setLayout(v); try { localStorage.setItem("rp_plan_layout", v); } catch { /* private window */ } };

  return (
    <section className="setup wrap">
      {header}
      <div className="setup-form">
        <div className="setup-grid plan-grid">
          <div className="panel col-form">
            <section className="sblock">
              <h2>{t("planTitle2")}</h2>
              {statusLine}{codeRow}
              {(flat.unplaced || []).length > 0 && <p className="dnote">{t("unplacedN", {n:(flat.unplaced || []).length})}: {(flat.unplaced || []).map(u => u.name).join(", ")}</p>}
              <div className="acts2">
                <button className={"btn" + (armRead ? " danger" : "")} type="button" disabled={busy} onClick={() => readPlan(flat)}>{t(armRead ? "rereadConfirm" : "planReread")}</button>
                {fileButton(t("planOther"))}
              </div>
            </section>

            <section className="sblock">
              <h2>{t("scaleTitle")}</h2>
              <p className={"dnote" + (flat.scale ? "" : " err")}>
                {flat.scaleFrom === "sizes" ? t("scaleSizes") : flat.scaleFrom === "wall" ? t("scaleWall") : t("scaleNone")}
              </p>
              {flat.scale && (
                <button className={"btn small" + (armRescale ? " primary" : "")} type="button" aria-pressed={armRescale} onClick={() => setArmRescale(v => !v)}>
                  {t(armRescale ? "rescaleArmed" : "rescaleWhole")}</button>
              )}
              <div className="fgrid">
                <label><span>{t("heightCm")}</span>
                  <NumField min="200" step="1" inputMode="numeric" value={Math.round(flat.H * 100)}
                    onCommit={v => { const cm = Math.round(Number(v)); if (cm >= 200 && cm <= 600) setFlat({...flat, H:cm / 100}); }}/>
                  <small>{t("cm")}</small></label>
              </div>
            </section>

            <section className="sblock">
              <h2>{t("spacesTitle")}</h2>
              {!flat.spaces.length && <p className="dnote">{t("noSpaces")}</p>}
              {sugCount > 0 && (
                <div className="acts2">
                  <p className="dnote">{t("planSuggested", {n:sugCount})}</p>
                  <button className="btn small" type="button" onClick={() => change({...flat, spaces:flat.spaces.map(x => ({...x, suggested:false}))})}>{t("confirmAll")}</button>
                </div>
              )}
              {flat.spaces.map((s, idx) => {
                const on = selSpace?.id === s.id;
                const area = flat.scale && !outlineProblem(s.outline) ? polyArea(s.outline) * flat.scale * flat.scale : null;
                return (
                  <div key={s.id} className={"orow" + (on ? " on" : "") + (s.fromAI ? " ai" : "") + (bad[s.id] ? " bad" : "")} onClick={() => { if (!on) setSel({kind:"space", id:s.id}); }}>
                    <div className="ohead">
                      <input className="sname" value={s.name} placeholder={t("spaceN", {n:idx + 1})} aria-label={t("spaceName")}
                        onChange={e => setSpace(s.id, {name:e.target.value, unnamed:!e.target.value.trim()})}/>
                      {s.suggested ? <span className="aitag sugtag">{t("suggestedTag")}</span>
                        : s.unnamed ? <span className="aitag">{t("foundNoName")}</span> : s.fromAI && <span className="aitag">{t("foundByAI")}</span>}
                      {s.suggested && <button className="btn small primary" type="button" onClick={e => { e.stopPropagation(); setSpace(s.id, {suggested:false}); }}>{t("confirm")}</button>}
                      {area != null && <bdi dir="ltr" className="sarea">{area.toFixed(1)} {t("m2")}</bdi>}
                      <button className="btn small" type="button" onClick={e => {
                        e.stopPropagation();
                        change({...flat, spaces:flat.spaces.filter(x => x.id !== s.id)}); setSel(null);
                      }}>{t("remove")}</button>
                    </div>
                    {on && (
                      <div className="sdetail">
                        {(flat.unplaced || []).length > 0 && (
                          <label className="ssize"><span>{t("pickName")}</span>
                            <select value="" onChange={e => {
                              const u = (flat.unplaced || [])[Number(e.target.value)]; if (!u) return;
                              change({...flat, unplaced:(flat.unplaced || []).filter(x => x !== u),
                                spaces:flat.spaces.map(x => x.id === s.id ? {...x, name:u.name, sizeText:u.sizeText ?? x.sizeText, areaText:u.areaText ?? x.areaText ?? null, unnamed:false} : x)});
                            }}>
                              <option value="">…</option>
                              {(flat.unplaced || []).map((u, i) => <option key={i} value={i}>{u.name}</option>)}
                            </select></label>
                        )}
                        <label className="ssize"><span>{t("sizeText")}</span>
                          <input value={s.sizeText || ""} placeholder="12'-0&quot; x 14'-6&quot;" dir="ltr"
                            onChange={e => setSpace(s.id, {sizeText:e.target.value || null})}/></label>
                        {box?.rect && (
                          <div className="ofields roombox">
                            <label><span>{t("roomWidth")}</span>
                              <NumField min="30" step="1" inputMode="numeric" value={Math.round(box.width)} onCommit={v => onNumber({kind:"room", spaceId:s.id, axis:"width", cm:Math.round(Number(v))})}/>
                              <small>{t("cm")}</small></label>
                            <label><span>{t("roomLength")}</span>
                              <NumField min="30" step="1" inputMode="numeric" value={Math.round(box.length)} onCommit={v => onNumber({kind:"room", spaceId:s.id, axis:"length", cm:Math.round(Number(v))})}/>
                              <small>{t("cm")}</small></label>
                          </div>
                        )}
                        {last && last.c.spaceId === s.id && <button className="btn small" type="button" onClick={otherSide}>{t("otherSide")}</button>}
                        <details className="wallsone" open={!box?.rect || !flat.scale}>
                          <summary>{t("wallsOneByOne", {n:(selReal?.poly.length ?? s.outline.length)})}</summary>
                          <div className="ofields walls">
                            {(selReal ? selReal.poly : s.outline).map((_, i) => (
                              <label key={i}><span>{t("wallN", {n:i + 1})}</span>
                                <NumField min="1" step="1" inputMode="numeric" value={lens ? lens[i] : ""} placeholder={t("cm")}
                                  onCommit={v => onNumber({kind:"wall", spaceId:s.id, i, cm:Math.round(Number(v))})}/>
                                <small>{t("cm")}</small></label>
                            ))}
                          </div>
                        </details>
                        <button className="btn small" type="button" onClick={() => {
                          // A corner in the middle of the wall after the selected corner (wall 1 when none is selected), to drag into place.
                          const i = sel?.kind === "space" && sel.corner != null ? sel.corner : 0, o = s.outline, q = o[(i + 1) % o.length];
                          setSpace(s.id, {outline:[...o.slice(0, i + 1), [(o[i][0] + q[0]) / 2, (o[i][1] + q[1]) / 2], ...o.slice(i + 1)], fromAI:false});
                          setSel({kind:"space", id:s.id, corner:i + 1});
                        }}>{t("addCorner")}</button>
                        {sel?.kind === "space" && sel.corner != null && s.outline.length > 3 && (
                          <button className="btn small" type="button" onClick={() => {
                            setSpace(s.id, {outline:s.outline.filter((_, i) => i !== sel.corner), fromAI:false}); setSel({kind:"space", id:s.id});
                          }}>{t("removeCorner")}</button>
                        )}
                      </div>
                    )}
                    {bad[s.id] && <p className="oerr">{bad[s.id]}</p>}
                  </div>
                );
              })}
            </section>

            <section className="sblock">
              <h2>{t("openingsTitle")}</h2>
              {!flat.openings.length && <p className="dnote">{t("noOpenings")}</p>}
              {stray.length > 0 && <p className="oerr">{t("strayOpenings", {n:stray.length})}</p>}
              <div className="olist">
                {flat.openings.map((o, i) => (
                  <button key={o.id} type="button" className={"ochip " + o.type + (selOpen?.id === o.id ? " on" : "")} onClick={() => setSel({kind:"opening", id:o.id})}>
                    {t(o.type === "door" ? "door1" : "window1")} {i + 1}{o.fromAI ? " · AI" : ""}
                  </button>
                ))}
              </div>
              {selOpen && (
                <div className="orow">
                  <div className="ohead">
                    <strong>{t(selOpen.type === "door" ? "door1" : "window1")}</strong>
                    {selOpen.fromAI && <span className="aitag">{t("foundByAI")}</span>}
                    {flat.scale && <bdi dir="ltr" className="sarea">{Math.round(Math.hypot(selOpen.b[0] - selOpen.a[0], selOpen.b[1] - selOpen.a[1]) * flat.scale * 100)} {t("cm")}</bdi>}
                    <button className="btn small" type="button" onClick={() => { change({...flat, openings:flat.openings.filter(o => o.id !== selOpen.id)}); setSel(null); }}>{t("remove")}</button>
                  </div>
                  <div className="ofields">
                    <label><span>{t("oHeight")}</span>
                      <NumField min="30" step="1" inputMode="numeric" value={selOpen.heightCm} onCommit={v => setOpen(selOpen.id, {heightCm:Math.round(Number(v)) || selOpen.heightCm})}/>
                      <small>{t("cm")}</small></label>
                    {selOpen.type === "window" && (
                      <label><span>{t("oSill")}</span>
                        <NumField min="0" step="1" inputMode="numeric" value={selOpen.sillCm} onCommit={v => setOpen(selOpen.id, {sillCm:Math.max(0, Math.round(Number(v)) || 0)})}/>
                        <small>{t("cm")}</small></label>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
          <div className={"panel col-preview " + shownLayout}>
            <div className="pv">
              <div className="pvhead"><strong>{t("tracing")}</strong><span className="dnote">{t("tracingSub")}</span>
                <button className="btn small" type="button" onClick={() => pickLayout(shownLayout === "stacked" ? "side" : "stacked")}>{t(shownLayout === "stacked" ? "layoutSide" : "layoutStacked")}</button></div>
              <PlanEditor flat={flat} imageUrl={imageUrl} onChange={change} sel={sel} onSelect={setSel} tool={tool} onTool={setTool} bad={bad}
                walls={walls.current} onNotice={text => say(text, true)}/>
            </div>
            {flat.scale && (
              <div className="pv">
                <div className="pvhead"><strong>{t("realFlat")}</strong><span className="dnote">{t("realFlatSub")}</span></div>
                {overlaps.length > 0 && (
                  <p className="oerr">{t("overlapNotice")} <button className="btn small" type="button" onClick={() => setFlat(resetReal(flat))}>{t("resetReal")}</button></p>
                )}
                <RealFlatView flat={flat} diff highlight={selSpace?.id ?? null} onPick={id => setSel({kind:"space", id})}/>
              </div>
            )}
          </div>
        </div>
        {ask && (
          <CorrectDialog kind={ask.kind} plan={ask.plan}
            onCancel={() => setAsk(null)}
            onWhole={() => {
              const a = ask; setAsk(null);
              if (a.kind === "scale") whole(a.f, a.c);
              else if (a.plan) finish(a.f, a.c, a.plan, true, a.side);
            }}
            onPart={() => {
              const a = ask; setAsk(null);
              if (a.kind === "scale") correct({...a.f, scaleAsked:true, scaleFrom:"wall"}, a.c);
              else if (a.plan) finish(a.f, a.c, a.plan, false, a.side);
            }}/>
        )}
        <div className="setup-actions">
          <button className="btn" type="button" onClick={props.onCancel}>{t("backChoice")}</button>
          <span className="dnote">{blockers}</span>
          <button className="btn primary" type="button" disabled={Boolean(blockers) || busy} onClick={() => props.onDone({...flat, spaces:flat.spaces.map((x, i) => x.name.trim() ? x : {...x, name:t("spaceN", {n:i + 1})})}, isNew)}>
            {flat.spaces.length > 1 ? t("planNextFlat") : t("startDesign")}
          </button>
        </div>
      </div>
    </section>
  );
}
