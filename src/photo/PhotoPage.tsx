// The photo page (/): restyle a room photo with AI, price it from your own rates and print a proposal.
import { useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { STYLES, PRESERVE, ROOMS, FINISH_MULT, type RoomDims } from "./data";
import { settings, saveSettings, t, nameOf, money, unitLabel, itemOf, priceOf, buildLines, refreshAutoQty, computeTotals, type Lang, type Line } from "./settings";
import { loadImage, fileToResizedDataUrl, downscaleDataUrl, compositeWithMask, demoRender, type Img } from "./images";
import Viewer, { newMask, clearMask, type Render, type FurnItem, type Mode, type Mask } from "./Viewer";
import { PricesDialog, StudioDialog } from "./Dialogs";
import Proposal, { type ProposalData } from "./Proposal";
import NumField from "../studio/ui/NumField";
import css from "./photo.css?inline";
import { IconGlobe, IconSettings, IconTag } from "../studio/ui/Icons";

type Dims = {L: string, W: string, H: string};
const numDims = (d: Dims): RoomDims => ({
  L: Math.max(0, parseFloat(d.L) || 0), W: Math.max(0, parseFloat(d.W) || 0), H: Math.max(0, parseFloat(d.H) || 0)
});

function Segmented({value, options, onChange}: {value: string, options: [string, string][], onChange: (v: string) => void}){
  return (
    <div className="segmented">
      {options.map(([v, key]) => <button key={v} type="button" className={v === value ? "active" : ""} onClick={() => onChange(v)}>{t(key)}</button>)}
    </div>
  );
}

export default function PhotoPage(){
  const [, refresh] = useReducer((n: number) => n + 1, 0);   // after a settings change
  const lang = settings.lang;

  // The room
  const [original, setOriginal] = useState<Img | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const [roomType, setRoomType] = useState("living");
  const [construction, setConstruction] = useState(false);
  const [dims, setDims] = useState<Dims>({L: "5", W: "4", H: "3"});
  // Style
  const [styleId, setStyleId] = useState("modern");
  const [preserve, setPreserve] = useState("strict");
  const [extra, setExtra] = useState("");
  // Renders, editing and furniture
  const [renders, setRenders] = useState<Render[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const maxInputSide = useRef<number | null>(null);
  const [mode, setModeState] = useState<Mode>("none");
  const [mask, setMask] = useState<Mask | null>(null);
  const [maskVersion, setMaskVersion] = useState(0);
  const [editPrompt, setEditPrompt] = useState("");
  const [furniture, setFurniture] = useState<FurnItem[]>([]);
  // Budget
  const [finish, setFinish] = useState("standard");
  const [lines, setLines] = useState<Line[]>(() => buildLines("living", numDims(dims)));
  // Proposal
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [notes, setNotes] = useState("");
  const [pdfLang, setPdfLang] = useState<Lang | null>(null);   // follows the page language until picked
  const [validity, setValidity] = useState("14");
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  // Dialogs and toast
  const [dialog, setDialog] = useState<"prices" | "studio" | null>(null);
  const [toastMsg, setToastMsg] = useState({text: "", show: false});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = (text: string) => {
    setToastMsg({text, show: true});
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(m => ({...m, show: false})), 4200);
  };
  const active = renders.find(r => r.id === activeId) || null;

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang; root.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = "RoomPitch — AI Concept Co-Pilot";
  }, [lang]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Ask the server whether a real AI key is configured.
  useEffect(() => {
    fetch("/api/generate").then(r => r.json()).then(d => {
      maxInputSide.current = d.maxInputSide || null;
      setAiEnabled(!!d.aiEnabled);
    }).catch(() => {});
  }, []);

  const saveOrWarn = () => { if (!saveSettings()) toast("Could not save settings on this device (storage full or blocked)."); };

  const setMode = (m: Mode) => {
    if (m === "edit"){
      if (!active) return;
      setMask(newMask(active.w, active.h)); setMaskVersion(v => v + 1);
    }
    setModeState(m);
  };

  async function handlePhoto(file?: File){
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setOriginal(await fileToResizedDataUrl(file));
      setRenders([]); setActiveId(null); setFurniture([]);
      setModeState(m => m === "edit" ? "none" : m);
    } catch (e: any){
      toast(t("errGeneric", {msg: e.message}));
    }
  }

  /* ───── Rendering ───── */

  function buildRestylePrompt(id: string){
    const style = STYLES.find(s => s.id === id)!;
    const room = ROOMS.find(r => r.id === roomType)!;
    const parts = [
      `Redesign this ${room.en.toLowerCase()} as a photorealistic interior design render.`,
      `Style: ${style.prompt}.`,
      PRESERVE[preserve]
    ];
    if (construction){
      parts.push("The photo shows an unfinished construction site: complete it with finished plastered and painted walls, a finished floor and a finished ceiling, and remove all construction debris, tools and exposed wiring.");
    }
    if (extra.trim()) parts.push(`Client wishes: ${extra.trim()}.`);
    parts.push("Natural daylight, realistic materials and shadows, professional architectural photography, high detail. No people, no text, no watermark.");
    return parts.join(" ");
  }

  async function callApi(payload: {mode: string, image: string, prompt: string, mask?: string, width?: number, height?: number}){
    // Ask for an output with the photo's aspect ratio, longest side ~1024px.
    const img = await loadImage(payload.image);
    const s = 1024 / Math.max(img.naturalWidth, img.naturalHeight);
    payload.width = Math.round(img.naturalWidth * s);
    payload.height = Math.round(img.naturalHeight * s);
    if (maxInputSide.current) payload.image = await downscaleDataUrl(payload.image, maxInputSide.current);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {"Content-Type": "application/json", "x-access-code": settings.accessCode || ""},
      body: JSON.stringify(payload)
    });
    let data: any = {};
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    if (res.status === 401) throw new Error(t("errAccess"));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function makeRender(src: string, kind: Render["kind"], styleId: string, secs: string): Promise<Render>{
    const img = await loadImage(src);
    return {id: "r" + Date.now() + Math.random().toString(36).slice(2, 6), src, w: img.naturalWidth, h: img.naturalHeight, kind, styleId, secs};
  }

  async function generate(styleIds: string[]){
    if (busy) return;
    if (!original) return toast(t("needPhoto"));
    if (mode === "edit") setModeState("none");
    setBusy(styleIds.length > 1 ? t("renderingN", {n: styleIds.length}) : t("rendering"));
    const t0 = performance.now();
    let demo = false;
    try {
      const results = await Promise.allSettled(styleIds.map(async id => {
        const data = await callApi({mode: "restyle", image: original.src, prompt: buildRestylePrompt(id)});
        if (data.demo){ demo = true; return {src: await demoRender(original.src, STYLES.find(s => s.id === id)!.tint), id}; }
        return {src: data.image as string, id};
      }));
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const added: Render[] = [];
      let firstErr: any = null;
      for (const r of results){
        if (r.status === "fulfilled") added.push(await makeRender(r.value.src, "render", r.value.id, secs));
        else if (!firstErr) firstErr = r.reason;
      }
      if (added.length){ setRenders(rs => [...rs, ...added]); setActiveId(added[added.length - 1].id); }
      if (results.some(r => r.status === "fulfilled")) setAiEnabled(!demo);
      if (firstErr) toast(t("errGeneric", {msg: firstErr.message}));
      if (demo) toast(t("demoToast"));
    } finally {
      setBusy(null);
    }
  }

  async function applyEdit(){
    if (busy || !active || !mask) return;
    if (!mask.painted) return toast(t("needMask"));
    const instruction = editPrompt.trim();
    if (!instruction) return toast(t("needEditPrompt"));
    const maskSrc = mask.canvas.toDataURL("image/png");
    const style = STYLES.find(s => s.id === (active.styleId || styleId))!;
    const prompt = `${instruction}. Photorealistic interior, matching the surrounding ${style.en} style, lighting and perspective.`;
    setBusy(t("applying"));
    const t0 = performance.now();
    try {
      const data = await callApi({mode: "edit", image: active.src, mask: maskSrc, prompt});
      const src = data.demo ? await demoRender(active.src, "#6d8f7a", maskSrc)
        : data.maskComposite ? await compositeWithMask(active.src, data.image, maskSrc)
        : data.image;
      setAiEnabled(!data.demo);
      const r = await makeRender(src, "edit", active.styleId, ((performance.now() - t0) / 1000).toFixed(1));
      setRenders(rs => [...rs, r]); setActiveId(r.id);
      setModeState("none"); setEditPrompt("");
    } catch (e: any){
      toast(t("errGeneric", {msg: e.message}));
    } finally {
      setBusy(null);
    }
  }

  /* ───── Budget ───── */

  const changeDim = (k: keyof Dims, v: string) => {
    const next = {...dims, [k]: v};
    setDims(next);
    setLines(ls => refreshAutoQty(ls, numDims(next)));
  };
  const setLine = (id: string, fn: (l: Line) => Line) => setLines(ls => ls.map(l => l.id === id ? fn(l) : l));
  const mult = FINISH_MULT[finish];
  const tot = computeTotals(lines, finish);

  /* ───── PDF ───── */

  async function exportPdf(){
    if (!original) return toast(t("needPhoto"));
    const d = numDims(dims);
    flushSync(() => setProposal({
      lang: pdfLang || lang, original, active, renders, styleId, roomType, finish, L: d.L, W: d.W,
      lines, furniture, client, project, notes, validity
    }));
    // Wait for every image in the proposal to decode before printing.
    await Promise.all([...document.querySelectorAll<HTMLImageElement>("#proposal img")].map(img => img.decode().catch(() => {})));
    const prevTitle = document.title;
    document.title = `Proposal${client.trim() ? " - " + client.trim() : ""} - ${settings.studio.name || "RoomPitch"}`;
    window.print();
    setTimeout(() => { document.title = prevTitle; }, 500);
  }

  return (<>
    <style>{css}</style>
    <div className={"app" + (original ? " has-photo" : "")} id="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28"><path d="M4 28V12L16 4l12 8v16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/><path d="M11 28v-9h10v9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/></svg>
          </span>
          <span className="brand-name">RoomPitch</span>
          {aiEnabled !== null && <span className={"mode-badge" + (aiEnabled ? " live" : "")}>{aiEnabled ? t("liveBadge") : t("demoBadge")}</span>}
        </div>
        <div className="top-actions">
          <button className="ghost" type="button" onClick={() => setDialog("prices")}><IconTag/><span>{t("priceList")}</span></button>
          <button className="ghost" type="button" onClick={() => setDialog("studio")}><IconSettings/><span>{t("studio")}</span></button>
          <button className="ghost lang" type="button" lang={lang === "ar" ? "en" : "ar"} onClick={() => { settings.lang = lang === "ar" ? "en" : "ar"; saveOrWarn(); refresh(); }}>
            <IconGlobe/><span>{lang === "ar" ? "English" : "عربي"}</span>
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="panel controls">
          <div className="step">
            <h2><span className="num">1</span><span>{t("s1")}</span></h2>
            <label className={"drop" + (original ? " has-photo" : "") + (dropOver ? " over" : "")} id="drop"
              style={original ? {"--thumb": `url("${original.src}")`} as CSSProperties : undefined}
              onDragEnter={e => { e.preventDefault(); setDropOver(true); }} onDragOver={e => { e.preventDefault(); setDropOver(true); }}
              onDragLeave={e => { e.preventDefault(); setDropOver(false); }}
              onDrop={e => { e.preventDefault(); setDropOver(false); handlePhoto(e.dataTransfer.files[0]); }}>
              <input type="file" accept="image/*" hidden onChange={e => { handlePhoto(e.target.files?.[0]); e.target.value = ""; }}/>
              <span className="drop-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              <span className="drop-text">{t(original ? "dropChange" : "dropText")}</span>
              <span className="drop-hint">{t("dropHint")}</span>
            </label>

            <div className="grid2">
              <label className="field">
                <span>{t("roomType")}</span>
                <select value={roomType} onChange={e => { setRoomType(e.target.value); setLines(buildLines(e.target.value, numDims(dims))); }}>
                  {ROOMS.map(r => <option key={r.id} value={r.id}>{nameOf(r)}</option>)}
                </select>
              </label>
              <label className="field check">
                <input type="checkbox" checked={construction} onChange={e => setConstruction(e.target.checked)}/>
                <span>{t("construction")}</span>
              </label>
            </div>
            <div className="grid3">
              {([["L", "length", "1"], ["W", "width", "1"], ["H", "height", "2"]] as const).map(([k, key, min]) => (
                <label className="field" key={k}><span>{t(key)}</span>
                  <input type="number" min={min} step="0.1" inputMode="decimal" value={dims[k]} onChange={e => changeDim(k, e.target.value)}/>
                </label>
              ))}
            </div>
          </div>

          <div className="step">
            <h2><span className="num">2</span><span>{t("s2")}</span></h2>
            <div className="chips">
              {STYLES.map(s => (
                <button key={s.id} type="button" className={"chip" + (s.id === styleId ? " active" : "")} onClick={() => setStyleId(s.id)}>
                  <span className="swatch" style={{background: s.tint}}/><span>{nameOf(s)}</span>
                </button>
              ))}
            </div>
            <div className="field">
              <span>{t("preserve")}</span>
              <Segmented value={preserve} onChange={setPreserve} options={[["strict", "pStrict"], ["balanced", "pBalanced"], ["creative", "pCreative"]]}/>
            </div>
            <label className="field">
              <span>{t("extra")}</span>
              <input type="text" placeholder={t("extraPh")} value={extra} onChange={e => setExtra(e.target.value)}/>
            </label>
            <div className="btn-row">
              <button className="primary" type="button" disabled={!!busy} onClick={() => generate([styleId])}>{t("generate")}</button>
              <button className="secondary" type="button" disabled={!!busy} onClick={() => {
                const i = STYLES.findIndex(s => s.id === styleId);
                generate([0, 1, 2].map(k => STYLES[(i + k) % STYLES.length].id));
              }}>{t("three")}</button>
            </div>
          </div>
        </section>

        <Viewer original={original} renders={renders} active={active} busy={busy}
          mode={mode} setMode={setMode} onPick={setActiveId}
          furniture={furniture} setFurniture={setFurniture}
          mask={mask} maskVersion={maskVersion} onClearMask={() => { if (mask){ clearMask(mask); setMaskVersion(v => v + 1); } }}
          editPrompt={editPrompt} setEditPrompt={setEditPrompt} onApplyEdit={applyEdit}/>

        <section className="panel budget">
          <div className="step">
            <h2><span className="num">3</span><span>{t("s3")}</span></h2>
            <div className="field">
              <span>{t("finish")}</span>
              <Segmented value={finish} onChange={setFinish} options={[["economy", "fEconomy"], ["standard", "fStandard"], ["premium", "fPremium"]]}/>
            </div>
            {!settings.pricesEdited && <p className="sample-note">{t("sampleNote")}</p>}
            <div className="table-wrap">
              <table className="lines" id="linesTable">
                <thead><tr><th/><th>{t("item")}</th><th>{t("qty")}</th><th className="num-col">{t("amount")}</th></tr></thead>
                <tbody>
                  {lines.map(line => {
                    const item = itemOf(line.id);
                    return (
                      <tr key={line.id} className={line.on ? "" : "off"}>
                        <td><input type="checkbox" aria-label={nameOf(item)} checked={line.on}
                          onChange={e => { const on = e.target.checked; setLine(line.id, l => ({...l, on, qty: on && !l.qty ? 1 : l.qty})); }}/></td>
                        <td><span className="item-name">{nameOf(item)}</span><span className="unit">{unitLabel(item.unit)}</span></td>
                        <td><NumField className="qty" min="0" step={item.unit === "pc" ? "1" : "0.1"} inputMode="decimal" aria-label={t("qty")} value={line.qty}
                          onCommit={v => { const qty = Math.max(0, parseFloat(v) || 0); setLine(line.id, () => ({id: line.id, qty, auto: false, on: qty > 0})); }}/></td>
                        <td className="num-col">{line.on ? money(priceOf(line.id) * mult * line.qty) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="totals" id="totals">
              <div className="trow"><span>{t("subtotal")}</span><span>{money(tot.subtotal)}</span></div>
              <div className="trow"><span>{t("fee")} ({settings.feePct || 0}%)</span><span>{money(tot.fee)}</span></div>
              {settings.vatPct ? <div className="trow"><span>{t("vat")} ({settings.vatPct}%)</span><span>{money(tot.vat)}</span></div> : null}
              <div className="trow grand"><span>{t("total")}</span><span>{money(tot.total)}</span></div>
            </div>
          </div>

          <div className="step">
            <h2><span className="num">4</span><span>{t("s4")}</span></h2>
            <label className="field"><span>{t("clientName")}</span><input type="text" value={client} onChange={e => setClient(e.target.value)}/></label>
            <label className="field"><span>{t("projectName")}</span><input type="text" value={project} onChange={e => setProject(e.target.value)}/></label>
            <label className="field"><span>{t("notes")}</span><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}/></label>
            <div className="grid2">
              <label className="field"><span>{t("pdfLang")}</span>
                <select value={pdfLang || lang} onChange={e => setPdfLang(e.target.value as Lang)}>
                  <option value="en">English</option><option value="ar">العربية</option>
                </select>
              </label>
              <label className="field"><span>{t("validity")}</span><input type="number" min="1" value={validity} onChange={e => setValidity(e.target.value)}/></label>
            </div>
            <button className="primary wide" type="button" onClick={exportPdf}>{t("exportPdf")}</button>
            <p className="small muted">{t("pdfHint")}</p>
          </div>
        </section>
      </main>
    </div>

    <PricesDialog open={dialog === "prices"} onClose={() => setDialog(d => d === "prices" ? null : d)} onChange={refresh}/>
    <StudioDialog open={dialog === "studio"} onClose={() => setDialog(d => d === "studio" ? null : d)} onChange={refresh}/>
    <div className={"toast" + (toastMsg.show ? " show" : "")} role="status" aria-live="polite">{toastMsg.text}</div>
    {proposal && <Proposal {...proposal}/>}
  </>);
}
