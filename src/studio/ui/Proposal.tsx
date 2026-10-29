// PDF proposal: the "Export PDF" dialog and a print-only A4 layout built from the room, the renders and
// the estimate, then the browser's print window ("Save as PDF"). Printing keeps Arabic text shaping exact.
import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { S } from "../state.js";
import { fmt } from "../utils.js";
import { t, getLang } from "../i18n.js";
import { settings } from "../settings.js";
import { computeEstimate, qtyText } from "../estimate.js";
import { renders, snapshot } from "../render-ai.js";
import { toCm, polyArea } from "../geometry.js";
import PlanSvg, { planViewBox } from "./PlanSvg";
import Modal from "./Modal";

type Fields = {client: string, project: string, notes: string, days: string, lang: string};
type Doc = Fields & {hero: string};

function ProposalDoc({doc}: {doc: Doc}){
  const l = doc.lang, T = (k: string, v?: object) => t(k, v, l);
  const st = settings.studio;
  const e = computeEstimate(l);
  const money = (n: number) => `${settings.currency} ${fmt(n)}`;
  const date = new Intl.DateTimeFormat(l === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {dateStyle:"long"}).format(new Date());
  const days = Math.max(1, parseInt(doc.days, 10) || 14);
  // Newest render is the hero; up to three earlier ones become alternatives. No render yet: the 3D view.
  const alts = renders.slice(0, -1).slice(-3);
  return (
    <div className="proposal" dir={l === "ar" ? "rtl" : "ltr"} lang={l}>
      <header className="pp-head">
        <div className="pp-studio">
          {st.logo && <img className="pp-logo" src={st.logo} alt=""/>}
          <div>
            <div className="pp-studio-name">{st.name || T("yourStudio")}</div>
            <div className="pp-contact">{[st.designer, st.phone, st.email].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div className="pp-date">{T("pDate")}: {date}</div>
      </header>

      <h1 className="pp-title">{T("pTitle")}</h1>
      <div className="pp-meta">
        <div><span>{T("preparedFor")}</span><strong>{doc.client.trim() || "—"}</strong></div>
        <div><span>{T("pProject")}</span><strong>{doc.project.trim() || "—"}</strong></div>
        <div><span>{T("pRoom")}</span><strong><bdi dir="ltr">{toCm(S.L)} × {toCm(S.W)} × {toCm(S.H)}</bdi> {T("cm")} · <bdi>{polyArea(S.poly).toFixed(1)}</bdi> {T("m2")}</strong></div>
      </div>

      <figure className="pp-hero"><img src={doc.hero} alt=""/><figcaption>{renders.length ? T("proposed") : T("concept3d")}</figcaption></figure>
      {alts.length > 0 && <section className="pp-alts"><h2>{T("alternatives")}</h2>
        <div className="pp-alt-grid">{alts.map((r: any, i: number) => <figure key={i}><img src={r.src} alt=""/></figure>)}</div></section>}

      <section className="pp-plan">
        <h2>{T("planCap")}</h2>
        <svg viewBox={planViewBox()} xmlns="http://www.w3.org/2000/svg"><PlanSvg lang={l} gridId="pp-grid"/></svg>
      </section>

      <section className="pp-costs">
        <h2>{T("breakdown")}</h2>
        <table>
          <thead><tr><th>{T("item")}</th><th className="c">{T("qty")}</th><th className="n">{T("unitPrice")}</th><th className="n">{T("amount")}</th></tr></thead>
          <tbody>{e.rows.map((r, i) => r.grp
            ? <tr className="pp-grp" key={i}><td colSpan={4}>{r.grp}</td></tr>
            : <tr key={i}><td>{r.name}</td><td className="c">{qtyText(r)} {r.unit}</td><td className="n">{fmt(r.unitPrice)}</td><td className="n">{fmt(r.amt)}</td></tr>)}</tbody>
          <tfoot>
            {(settings.feePct || settings.vatPct) ? <tr><td colSpan={3}>{T("subtotal")}</td><td className="n">{money(e.subtotal)}</td></tr> : null}
            {settings.feePct ? <tr><td colSpan={3}>{T("fee", {p:settings.feePct})}</td><td className="n">{money(e.fee)}</td></tr> : null}
            {settings.vatPct ? <tr><td colSpan={3}>{T("vat", {p:settings.vatPct})}</td><td className="n">{money(e.vat)}</td></tr> : null}
            <tr className="pp-grand"><td colSpan={3}>{T("total")}</td><td className="n">{money(e.total)}</td></tr>
          </tfoot>
        </table>
      </section>

      {doc.notes.trim() && <section className="pp-notes"><h2>{T("pNotes")}</h2><p>{doc.notes.trim()}</p></section>}

      <footer className="pp-foot">
        <p>{T("valid", {d:days})}</p>
        <p>{T("visual")}</p>
        <div className="pp-sign"><div><span/>{T("signClient")}</div><div><span/>{T("signDesigner")}</div></div>
      </footer>
    </div>
  );
}

export default function PdfDialog({open, onClose}: {open: boolean, onClose: () => void}){
  const [f, setF] = useState<Fields>({client:"", project:"", notes:"", days:"14", lang:getLang()});
  const [doc, setDoc] = useState<Doc | null>(null);
  const set = (k: keyof Fields) => (e: {target: {value: string}}) => setF(v => ({...v, [k]:e.target.value}));
  useEffect(() => { if (open) setF(v => ({...v, lang:getLang()})); }, [open]);

  async function exportPdf(){
    const hero = renders.length ? renders[renders.length - 1].src : snapshot().full;
    flushSync(() => setDoc({...f, hero}));
    onClose();
    // Wait for images and fonts so nothing prints half-loaded.
    const p = document.querySelector(".proposal")!;
    await Promise.all([...p.querySelectorAll("img")].map(img => img.decode().catch(() => {})));
    if (document.fonts?.ready) await document.fonts.ready;
    const prev = document.title;
    document.title = [t("pTitle", null, f.lang), f.client.trim(), settings.studio.name].filter(Boolean).join(" - ");
    window.print();
    setTimeout(() => { document.title = prev; }, 800);
  }

  return <>
    <Modal open={open} onClose={onClose} labelledBy="pdfTitle">
      <div className="mhead"><h3 id="pdfTitle">{t("pdfTitle")}</h3></div>
      {renders.length === 0 && <p className="dnote warn">{t("pdfNoRender")}</p>}
      <div className="form">
        <label htmlFor="pdfClient">{t("client")}</label><input id="pdfClient" type="text" value={f.client} onChange={set("client")}/>
        <label htmlFor="pdfProject">{t("project")}</label><input id="pdfProject" type="text" value={f.project} onChange={set("project")}/>
        <label htmlFor="pdfNotes">{t("notes")}</label><textarea id="pdfNotes" rows={3} value={f.notes} onChange={set("notes")}/>
        <label htmlFor="pdfValid">{t("validity")}</label><input id="pdfValid" type="number" min="1" max="365" value={f.days} onChange={set("days")}/>
        <label htmlFor="pdfLang">{t("pdfLang")}</label>
        <select id="pdfLang" value={f.lang} onChange={set("lang")}><option value="en">English</option><option value="ar">العربية</option></select>
      </div>
      <p className="dnote">{t("pdfTip")}</p>
      <div className="acts2">
        <button className="btn primary" type="button" onClick={exportPdf}>{t("createPdf")}</button>
        <button className="btn" type="button" onClick={onClose}>{t("cancel")}</button>
      </div>
    </Modal>
    {doc && createPortal(<ProposalDoc doc={doc}/>, document.body)}
  </>;
}
