// A flat read from a floor plan: its spaces on the plan with their status. Pick one to design it;
// "Edit plan" goes back to correcting the plan.
import { t } from "../../i18n.js";
import { polyArea } from "../../geometry.js";
import type { Flat } from "../../plan/flat";
import { AccountButton } from "../AccountDialog";
import { useLang } from "../hooks";

type Props = {
  flat: Flat;
  imageUrl: string;
  onOpenSpace: (id: string) => void;
  onEditPlan: () => void;
  onMarkDone: (id: string, done: boolean) => void;
  onBack: () => void;
  onAccount: () => void;
  onLang: () => void;
};

const centre = (o: [number, number][]) => {
  const xs = o.map(p => p[0]), ys = o.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

export default function FlatScreen({flat, imageUrl, onOpenSpace, onEditPlan, onMarkDone, onBack, onAccount, onLang}: Props){
  useLang();
  const {w, h} = flat.image, fs = Math.max(w, h) / 55;
  return (
    <section className="setup wrap">
      <header className="bar">
        <button className="btn backbtn" type="button" onClick={onBack}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>{t("myProjects")}</span>
        </button>
        <div className="brand"><strong>RoomPitch</strong><span className="tag">{t("flatTitle")}</span></div>
        <div className="tools"><AccountButton onOpen={onAccount}/><button className="btn langbtn" type="button" onClick={onLang}>{t("langBtn")}</button></div>
      </header>
      <div className="setup-form">
        <p className="dnote">{t("flatSub")}</p>
        <div className="flat-grid">
          <div className="panel col-preview">
            <svg className="flatplan" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t("flatTitle")}>
              <image href={imageUrl} width={w} height={h}/>
              {flat.spaces.map(s => {
                const c = centre(s.outline);
                return (
                  <g key={s.id} className={"st-" + s.status} onClick={() => onOpenSpace(s.id)}>
                    <polygon points={s.outline.map(p => p.join(",")).join(" ")} vectorEffect="non-scaling-stroke"/>
                    <text x={c[0]} y={c[1]} fontSize={fs} textAnchor="middle" dominantBaseline="middle">{s.name || "—"}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="panel col-form">
            <section className="sblock">
              <h2>{t("spacesTitle")}</h2>
              <ul className="fspaces">
                {flat.spaces.map(s => (
                  <li key={s.id} className="fspace">
                    <div className="projtext">
                      <b className="projtitle">{s.name || "—"}</b>
                      <span className="projmeta">
                        {flat.scale && <bdi dir="ltr">{(polyArea(s.outline) * flat.scale * flat.scale).toFixed(1)} {t("m2")}</bdi>}
                        {" "}<span className={"stchip st-" + s.status}>{t("status_" + s.status)}</span>
                      </span>
                    </div>
                    {s.status !== "todo" && (
                      <button className="btn small" type="button" onClick={() => onMarkDone(s.id, s.status !== "done")}>{t(s.status === "done" ? "markTodo" : "markDone")}</button>
                    )}
                    <button className="btn primary" type="button" onClick={() => onOpenSpace(s.id)}>{t("flatOpen")}</button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="sblock">
              <button className="btn" type="button" onClick={onEditPlan}>{t("editPlan")}</button>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
