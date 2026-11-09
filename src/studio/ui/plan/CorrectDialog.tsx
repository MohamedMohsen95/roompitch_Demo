// The questions a size correction can raise: the first time, is the whole plan's size off or only this
// room or wall; and when the wall to move runs on past the room, or a room that would change was confirmed,
// which rooms change.
import { t } from "../../i18n.js";
import Modal from "../Modal";
import type { CorrectionPlan } from "../../plan/correct";

type Props = {
  kind: "scale" | "line";
  plan?: CorrectionPlan | null;
  onWhole: () => void;                 // scale: the whole plan; line: move the whole wall (or Apply)
  onPart: () => void;                  // scale: only this; line: only this room's part
  onCancel: () => void;
};

export default function CorrectDialog({kind, plan, onWhole, onPart, onCancel}: Props){
  const ok = plan && plan.ok ? plan : null;
  return (
    <Modal open onClose={onCancel} labelledBy="correctTitle">
      {kind === "scale" ? (
        <>
          <h2 id="correctTitle">{t("scaleQ")}</h2>
          <p className="dnote">{t("scaleQSub")}</p>
          <div className="acts2">
            <button className="btn primary" type="button" onClick={onWhole}>{t("scaleQWhole")}</button>
            <button className="btn" type="button" onClick={onPart}>{t("scaleQThis")}</button>
            <button className="btn" type="button" onClick={onCancel}>{t("cancel")}</button>
          </div>
        </>
      ) : (
        <>
          <h2 id="correctTitle">{ok?.runsPast ? t("lineQ") : t("confirmedQ")}</h2>
          {ok && (
            <ul className="affected">
              {ok.affected.map(a => (
                <li key={a.id}>
                  <strong>{a.name}</strong>{" "}
                  <bdi dir="ltr">{a.before[0]} × {a.before[1]} → {a.after[0]} × {a.after[1]} {t("cm")}</bdi>
                  {a.confirmed && <span className="aitag sugtag">{t("confirmedWillChange")}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="acts2">
            {ok?.runsPast ? (
              <>
                <button className="btn primary" type="button" onClick={onWhole}>{t("lineWhole")}</button>
                <button className="btn" type="button" onClick={onPart}>{t("linePart")}</button>
              </>
            ) : <button className="btn primary" type="button" onClick={onWhole}>{t("apply")}</button>}
            <button className="btn" type="button" onClick={onCancel}>{t("cancel")}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
