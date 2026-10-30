// Maximizing one of the side-by-side views (plan, 3D): it takes the whole width and the other folds into a thin
// rail; clicking the rail (or the restore button) brings both back. Only where the views sit side by side (CSS).
import { t } from "../i18n.js";
import { IconMaximize, IconRestore } from "./Icons";

export type ViewId = "plan" | "3d";
export type MaxProps = {max: ViewId | null, onMax: (v: ViewId | null) => void};

// The panel's class for its state: maximized, folded into a rail, or neither.
export const viewClass = (id: ViewId, max: ViewId | null) => "panel view" + (max === id ? " maxed" : max ? " folded" : "");

export function MaxButton({id, max, onMax}: MaxProps & {id: ViewId}){
  const on = max === id;
  const label = t(on ? "restoreSplit" : "maximize");
  return (
    <button className="btn ghost icon small maxbtn" type="button" aria-label={label} title={label} aria-pressed={on} onClick={() => onMax(on ? null : id)}>
      {on ? <IconRestore/> : <IconMaximize/>}
    </button>
  );
}

export function ViewRail({title, onMax}: {title: string, onMax: MaxProps["onMax"]}){
  return (
    <button className="view-rail" type="button" title={t("restoreSplit")} aria-label={`${title}: ${t("restoreSplit")}`} onClick={() => onMax(null)}>
      <IconRestore/><span>{title}</span>
    </button>
  );
}
