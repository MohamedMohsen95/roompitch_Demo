// The printable proposal. Hidden on screen; the print styles in photo.css show only this.
import { FURNITURE, ROOMS, STYLES } from "./data";
import { settings, t, nameOf, money, unitLabel, computeTotals, round1, type Lang, type Line } from "./settings";
import type { Img } from "./images";
import type { Render, FurnItem } from "./Viewer";

export type ProposalData = {
  lang: Lang; original: Img; active: Render | null; renders: Render[];
  styleId: string; roomType: string; finish: string; L: number; W: number;
  lines: Line[]; furniture: FurnItem[];
  client: string; project: string; notes: string; validity: string;
};

export default function Proposal(d: ProposalData){
  const {lang} = d;
  const T = (k: string, v?: Record<string, string | number>) => t(k, v, lang);
  const m = (n: number) => money(n, lang);
  const studio = settings.studio;
  const alternatives = d.renders.filter(r => r !== d.active).slice(-3);
  const style = STYLES.find(s => s.id === (d.active ? d.active.styleId : d.styleId));
  const room = ROOMS.find(r => r.id === d.roomType)!;
  const tot = computeTotals(d.lines, d.finish);
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {dateStyle: "long"}).format(new Date());
  const finishName = T(({economy: "fEconomy", standard: "fStandard", premium: "fPremium"} as Record<string, string>)[d.finish]);
  const furn = d.furniture.map(it => ({uid: it.uid, cat: FURNITURE.find(f => f.id === it.catId)})).filter(x => x.cat);
  const notes = d.notes.trim();

  return (
    <div id="proposal" className="proposal" aria-hidden="true" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="pp-head">
        <div className="pp-studio">
          {studio.logo && <img className="pp-logo" src={studio.logo} alt=""/>}
          <div>
            <div className="pp-studio-name">{studio.name || "Your Studio"}</div>
            <div className="pp-contact">{[studio.designer, studio.phone, studio.email].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div className="pp-date">{T("pDate")}: {date}</div>
      </header>

      <h1 className="pp-title">{T("pTitle")}</h1>
      <div className="pp-meta">
        <div><span>{T("pPreparedFor")}</span><strong>{d.client || "—"}</strong></div>
        <div><span>{T("pProject")}</span><strong>{d.project || "—"}</strong></div>
        <div><span>{T("pRoom")}</span><strong>{nameOf(room, lang)} · {round1(d.L * d.W)} m²</strong></div>
        <div><span>{T("pStyle")}</span><strong>{style ? nameOf(style, lang) : "—"} · {finishName}</strong></div>
      </div>

      <section className="pp-visuals">
        {d.active && <figure className="pp-hero"><img src={d.active.src} alt=""/><figcaption>{T("pProposed")}</figcaption></figure>}
        <figure className="pp-before"><img src={d.original.src} alt=""/><figcaption>{T("pBefore")}</figcaption></figure>
      </section>
      {alternatives.length > 0 && (
        <section className="pp-alts">
          <h2>{T("pAlternatives")}</h2>
          <div className="pp-alt-grid">{alternatives.map(r => {
            const s = STYLES.find(x => x.id === r.styleId);
            return <figure key={r.id}><img src={r.src} alt=""/><figcaption>{s ? nameOf(s, lang) : ""}</figcaption></figure>;
          })}</div>
        </section>
      )}

      <section className="pp-costs">
        <h2>{T("pBreakdown")}</h2>
        <table>
          <thead><tr><th>{T("item")}</th><th className="c">{T("qty")}</th><th className="n">{T("price")}</th><th className="n">{T("amount")}</th></tr></thead>
          <tbody>{tot.rows.map(r => (
            <tr key={r.item.id}><td>{nameOf(r.item, lang)}</td>
              <td className="c">{r.qty} {unitLabel(r.item.unit, lang)}</td>
              <td className="n">{m(r.unitPrice)}</td><td className="n">{m(r.amount)}</td></tr>
          ))}</tbody>
          <tfoot>
            <tr><td colSpan={3}>{T("subtotal")}</td><td className="n">{m(tot.subtotal)}</td></tr>
            <tr><td colSpan={3}>{T("fee")} ({settings.feePct || 0}%)</td><td className="n">{m(tot.fee)}</td></tr>
            {settings.vatPct ? <tr><td colSpan={3}>{T("vat")} ({settings.vatPct}%)</td><td className="n">{m(tot.vat)}</td></tr> : null}
            <tr className="grand"><td colSpan={3}>{T("total")}</td><td className="n">{m(tot.total)}</td></tr>
          </tfoot>
        </table>
      </section>

      {furn.length > 0 && (
        <section className="pp-furniture">
          <h2>{T("pFurniture")}</h2>
          <p className="pp-furniture-hint">{T("pFurnitureHint")}</p>
          <table>
            <thead><tr><th>{T("item")}</th><th className="n">{T("price")}</th></tr></thead>
            <tbody>{furn.map(({uid, cat}) => <tr key={uid}><td>{nameOf(cat!, lang)}</td><td className="n">{m(cat!.price)}</td></tr>)}</tbody>
            <tfoot><tr className="grand"><td>{T("subtotal")}</td><td className="n">{m(furn.reduce((s, x) => s + x.cat!.price, 0))}</td></tr></tfoot>
          </table>
        </section>
      )}

      {notes && <section className="pp-notes"><h2>{T("pNotes")}</h2><p>{notes}</p></section>}

      <footer className="pp-foot">
        <p>{T("pValid", {d: Math.max(1, parseInt(d.validity, 10) || 14)})}</p>
        <p>{T("pVisual")}</p>
        <div className="pp-sign">
          <div><span/>{T("pSignClient")}</div>
          <div><span/>{T("pSignDesigner")}</div>
        </div>
      </footer>
    </div>
  );
}
