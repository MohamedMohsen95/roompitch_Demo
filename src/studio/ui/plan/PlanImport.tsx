// "I have a floor plan": upload an image or PDF, let the AI read the spaces, doors, windows and written
// sizes, correct it on top of the plan, set the scale and ceiling height, then start designing.
import { useRef, useState } from "react";
import { t } from "../../i18n.js";
import { getCode, setCode } from "../../render-ai.js";
import { newFlat, outlineProblem, scaleFromSizes, scaleFromWall, setWallLengthCm, wallLengthsCm, withSizeScale } from "../../plan/flat.js";
import { flatFromReply } from "../../plan/plan-vision.js";
import { polyArea } from "../../geometry.js";
import type { Flat } from "../../plan/flat";
import NumField from "../NumField";
import PlanEditor, { type PlanSel, type Tool } from "./PlanEditor";
import { AccountButton } from "../AccountDialog";
import { useLang } from "../hooks";
import { loadImage } from "./image";

const MAX_EDIT = 2400, MAX_AI = 1600;

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isCad = (f: File) => /\.(dwg|dxf)$/i.test(f.name);

type Props = {
  initialFlat: Flat | null;            // "Edit plan" from the flat screen
  imageUrl?: string | null;            // the plan image when the flat keeps it in the cloud (image.path)
  onDone: (flat: Flat) => void;
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
  const [lengthSets, setLengthSets] = useState<"stretch" | "scale">("stretch");
  const codeRef = useRef<HTMLInputElement>(null);
  const say = (text: string, err = false) => setStatus({text, err});
  const change = (f: Flat) => setFlat(withSizeScale(f));

  async function readPlan(f: Flat){
    setBusy(true); setNeedCode(false);
    say(t("planReading"));
    try {
      const small = await loadImage(f.image.dataUrl || props.imageUrl || "", MAX_AI);
      let r: Response;
      try {
        r = await fetch("/api/plan", {method:"POST", headers:{"Content-Type":"application/json", "x-access-code":getCode()}, body:JSON.stringify({image:small.dataUrl})});
      } catch { say(t("noServer"), true); return; }
      if (r.status === 401){ setNeedCode(true); say(t("enterCode"), true); setTimeout(() => codeRef.current?.focus()); return; }
      const data = await r.json().catch(() => ({}));
      if (r.status === 503){ say(t("planOff"), true); return; }
      if (!r.ok){ say(data.error || t("wentWrong", {s:r.status}), true); return; }
      const read = flatFromReply({spaces:data.spaces || [], openings:data.openings || []}, f.image);
      const next = {...read, image:f.image, H:f.H};
      setFlat(next); setSel(null); setTool("select");
      if (!next.spaces.length) say(t("planNone"), true);
      else say(t("planFound", {s:next.spaces.length, o:next.openings.length}) + " " + (next.scale ? t("planCheck") : t("planNeedScale")));
    } catch { say(t("planImageErr"), true); }
    finally { setBusy(false); }
  }

  async function useImage(img: {dataUrl: string, w: number, h: number}){
    const f = newFlat(img);
    setFlat(f); setPdf(null); setSel(null);
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
  const blockers = !flat.spaces.length ? t("needSpace") : !flat.scale ? t("needScale")
    : flat.spaces.some(s => outlineProblem(s.outline)) ? t("needFixOutline") : "";
  const selSpace = sel?.kind === "space" ? flat.spaces.find(s => s.id === sel.id) || null : null;
  const selOpen = sel?.kind === "opening" ? flat.openings.find(o => o.id === sel.id) || null : null;
  const lens = selSpace && flat.scale ? wallLengthsCm(selSpace.outline, flat.scale) : null;
  const setSpace = (id: string, patch: object) => change({...flat, spaces:flat.spaces.map(s => s.id === id ? {...s, ...patch} : s)});
  const setOpen = (id: string, patch: object) => change({...flat, openings:flat.openings.map(o => o.id === id ? {...o, ...patch, fromAI:false} : o)});

  function typeWall(i: number, cm: number){
    if (!selSpace || !(cm > 0)) return;
    const o = selSpace.outline, a = o[i], b = o[(i + 1) % o.length];
    if (!flat!.scale || lengthSets === "scale"){
      const scale = scaleFromWall(Math.hypot(b[0] - a[0], b[1] - a[1]), cm);
      if (scale) setFlat({...flat!, scale, scaleFrom:"wall"});
      setLengthSets("stretch");
      return;
    }
    // A typed length is the truth: the scale stops following the written sizes from here on.
    setFlat({...flat!, scaleFrom:"wall", spaces:flat!.spaces.map(s => s.id === selSpace.id ? {...s, outline:setWallLengthCm(o, i, cm, flat!.scale!), fromAI:false} : s)});
  }

  return (
    <section className="setup wrap">
      {header}
      <div className="setup-form">
        <div className="setup-grid plan-grid">
          <div className="panel col-form">
            <section className="sblock">
              <h2>{t("planTitle2")}</h2>
              {statusLine}{codeRow}
              <div className="acts2">
                <button className="btn" type="button" disabled={busy} onClick={() => readPlan(flat)}>{t("planReread")}</button>
                {fileButton(t("planOther"))}
              </div>
            </section>

            <section className="sblock">
              <h2>{t("scaleTitle")}</h2>
              <p className={"dnote" + (flat.scale ? "" : " err")}>
                {flat.scaleFrom === "sizes" ? t("scaleSizes") : flat.scaleFrom === "wall" ? t("scaleWall") : t("scaleNone")}
              </p>
              {flat.scale && (
                <label className="chk"><input type="checkbox" checked={lengthSets === "scale"} onChange={e => setLengthSets(e.target.checked ? "scale" : "stretch")}/>
                  <span>{t("scaleNext")}</span></label>
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
              {flat.spaces.map(s => {
                const on = selSpace?.id === s.id;
                const area = flat.scale && !outlineProblem(s.outline) ? polyArea(s.outline) * flat.scale * flat.scale : null;
                return (
                  <div key={s.id} className={"orow" + (on ? " on" : "") + (s.fromAI ? " ai" : "") + (bad[s.id] ? " bad" : "")} onClick={() => { if (!on) setSel({kind:"space", id:s.id}); }}>
                    <div className="ohead">
                      <input className="sname" value={s.name} aria-label={t("spaceName")} onChange={e => setSpace(s.id, {name:e.target.value})}/>
                      {s.fromAI && <span className="aitag">{t("foundByAI")}</span>}
                      {area != null && <bdi dir="ltr" className="sarea">{area.toFixed(1)} {t("m2")}</bdi>}
                      <button className="btn small" type="button" onClick={e => {
                        e.stopPropagation();
                        change({...flat, spaces:flat.spaces.filter(x => x.id !== s.id)}); setSel(null);
                      }}>{t("remove")}</button>
                    </div>
                    {on && (
                      <div className="sdetail">
                        <label className="ssize"><span>{t("sizeText")}</span>
                          <input value={s.sizeText || ""} placeholder="12'-0&quot; x 14'-6&quot;" dir="ltr"
                            onChange={e => setSpace(s.id, {sizeText:e.target.value || null})}/></label>
                        <h3>{t("wallsTitle")}</h3>
                        <div className="ofields walls">
                          {s.outline.map((_, i) => (
                            <label key={i}><span>{t("wallN", {n:i + 1})}</span>
                              <NumField min="1" step="1" inputMode="numeric" value={lens ? lens[i] : ""} placeholder={t("cm")}
                                onCommit={v => typeWall(i, Math.round(Number(v)))}/>
                              <small>{t("cm")}</small></label>
                          ))}
                        </div>
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
          <div className="panel col-preview">
            <PlanEditor flat={flat} imageUrl={imageUrl} onChange={change} sel={sel} onSelect={setSel} tool={tool} onTool={setTool} bad={bad}/>
          </div>
        </div>
        <div className="setup-actions">
          <button className="btn" type="button" onClick={props.onCancel}>{t("backChoice")}</button>
          <span className="dnote">{blockers}</span>
          <button className="btn primary" type="button" disabled={Boolean(blockers) || busy} onClick={() => props.onDone(flat)}>
            {flat.spaces.length > 1 ? t("planNextFlat") : t("startDesign")}
          </button>
        </div>
      </div>
    </section>
  );
}
