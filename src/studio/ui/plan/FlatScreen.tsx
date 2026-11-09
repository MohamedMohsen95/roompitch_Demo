// A flat read from a floor plan: its spaces on the plan with their status. Pick one to design it;
// "Edit plan" goes back to correcting the plan.
import { t } from "../../i18n.js";
import { polyArea } from "../../geometry.js";
import { realSpace } from "../../plan/real.js";
import { roomBox } from "../../plan/correct.js";
import RealFlatView from "./RealFlatView";
import type { Flat } from "../../plan/flat";
import { AccountButton } from "../AccountDialog";
import { useLang } from "../hooks";

type Props = {
  flat: Flat;
  imageUrl: string;                    // kept for callers; the flat is drawn from the real flat now
  onOpenSpace: (id: string) => void;
  onEditPlan: () => void;
  onMarkDone: (id: string, done: boolean) => void;
  onBack: () => void;
  onAccount: () => void;
  onLang: () => void;
};


export default function FlatScreen({flat, onOpenSpace, onEditPlan, onMarkDone, onBack, onAccount, onLang}: Props){
  useLang();
  // a room's size in the real flat: width × length for a rectangle, else its area
  const sizeOf = (id: string) => {
    const b = flat.scale ? roomBox(flat, id) : null, r = flat.scale ? realSpace(flat, id) : null;
    if (!b || !r) return null;
    return b.rect ? `${(b.width / 100).toFixed(2)} × ${(b.length / 100).toFixed(2)} m` : `${polyArea(r.poly).toFixed(1)} ${t("m2")}`;
  };
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
            <p className="dnote">{t("flatClickRoom")}</p>
            <RealFlatView flat={flat} status onPick={onOpenSpace}/>
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
                        {sizeOf(s.id) && <bdi dir="ltr">{sizeOf(s.id)}</bdi>}
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
