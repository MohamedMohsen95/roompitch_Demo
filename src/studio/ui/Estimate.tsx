// Live estimate panel. It folds to a slim strip with just the total, giving the views more room;
// the choice is remembered in this browser.
import { computeEstimate, qtyText } from "../estimate.js";
import { fmt } from "../utils.js";
import { t } from "../i18n.js";
import { settings, money } from "../settings.js";

const Line = ({label, v}: {label: string, v: number}) => <tr><td>{label}</td><td className="n">{fmt(v)}</td></tr>;

export default function Estimate({closed, onToggle}: {closed: boolean, onToggle: (closed: boolean) => void}){
  const e = computeEstimate();
  const label = t(closed ? "estShow" : "estHide");
  return (
    <aside className="panel budget">
      <h2>
        <span className="est-title"><span>{t("estTitle")}</span> <small>{t("estHint")}</small></span>
        <button className="est-mini" type="button" tabIndex={-1} onClick={() => onToggle(false)}>{money(e.total)}</button>
        <button className="btn est-toggle" type="button" aria-controls="est" aria-expanded={!closed} aria-label={label} title={label} onClick={() => onToggle(!closed)}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </h2>
      <div className="est" id="est">
        <table><tbody>
          {e.rows.map((r, i) => r.grp
            ? <tr className="grp" key={i}><td colSpan={2}>{r.grp}</td></tr>
            : <tr key={i}><td>{r.name}<span className="sub"><bdi>{qtyText(r)}</bdi> {r.unit} × <bdi>{fmt(r.unitPrice)}</bdi></span></td><td className="n">{fmt(r.amt)}</td></tr>)}
          {(settings.feePct || settings.vatPct) ? <>
            <Line label={t("subtotal")} v={e.subtotal}/>
            {settings.feePct ? <Line label={t("fee", {p:settings.feePct})} v={e.fee}/> : null}
            {settings.vatPct ? <Line label={t("vat", {p:settings.vatPct})} v={e.vat}/> : null}
          </> : null}
        </tbody></table>
        <div className="total"><span>{t("total")}</span><span className="n">{money(e.total)}</span></div>
        <p className="note">{t("estNote")}</p>
      </div>
    </aside>
  );
}
