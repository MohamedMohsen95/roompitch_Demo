// Live estimate panel, the column on the inline end. Its handle on the left (inline-start) edge folds it sideways
// into a slim rail that still shows the total, giving the width to the plan and 3D views. The choice is remembered
// in this browser. On one-column layouts (CSS) a folded estimate is just its header.
import { computeEstimate, qtyText } from "../estimate.js";
import { fmt } from "../utils.js";
import { t } from "../i18n.js";
import { settings, money } from "../settings.js";
import { IconChevron } from "./Icons";

const Line = ({label, v}: {label: string, v: number}) => <tr className="sum"><td>{label}</td><td className="n">{fmt(v)}</td></tr>;

export default function Estimate({closed, onToggle}: {closed: boolean, onToggle: (closed: boolean) => void}){
  const e = computeEstimate();
  return (
    <section className={"panel budget" + (closed ? " closed" : "")} aria-label={t("estTitle")}>
      {closed && (
        <button className="est-rail" type="button" aria-controls="est" aria-expanded="false" title={t("estShow")} onClick={() => onToggle(false)}>
          <IconChevron/><span className="est-rail-text"><span>{t("estTitle")}</span><b className="num" dir="ltr">{money(e.total)}</b></span>
        </button>
      )}
      <button className="est-head" type="button" aria-controls="est" aria-expanded={!closed} title={t(closed ? "estShow" : "estHide")}
        onClick={() => onToggle(!closed)}>
        <IconChevron/>
        <span className="est-label"><h2>{t("estTitle")}</h2><small>{t("estHint")}</small></span>
        <span className="est-total num" dir="ltr">{money(e.total)}</span>
      </button>
      {!closed && (
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
          <div className="total"><span>{t("total")}</span><span className="n" dir="ltr">{money(e.total)}</span></div>
          <p className="note">{t("estNote")}</p>
        </div>
      )}
    </section>
  );
}
