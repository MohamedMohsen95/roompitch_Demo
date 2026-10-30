// Library panel: furniture, windows & doors, wall and floor tiles that can be clicked or dragged into the room.
import { S } from "../state.js";
import { FURN, WALL_MATS, FLOOR_MATS, texMaps } from "../catalog.js";
import { OPENING_PRESETS } from "../openings.js";
import { swatchURL } from "../textures.js";
import { fmt } from "../utils.js";
import { notify, ui } from "../store.js";
import { applyPayload } from "../actions.js";
import { t, nameOf } from "../i18n.js";
import { priceOf } from "../settings.js";
import { toCm } from "../geometry.js";
import { IconUpload } from "./Icons";

const TABS = [["furn", "tabFurn"], ["open", "tabOpen"], ["wall", "tabWall"], ["floor", "tabFloor"]] as const;
const HINT_KEYS: Record<string, string> = {furn:"hintFurn", open:"hintOpen", wall:"hintWall", floor:"hintFloor"};
const LISTS: Record<string, () => any[]> = {furn:() => FURN, open:() => OPENING_PRESETS, wall:() => WALL_MATS, floor:() => FLOOR_MATS};

// Front view of a window or door, to scale, for the library tile.
function OpeningIcon({p}: {p: any}){
  const k = 34 / Math.max(p.width, 2.4), w = p.width * k, h = p.height * k, y = 40 - 4 - (p.sill * k) - h;
  const glass = p.type === "window";
  return (
    <svg width="54" height="40" viewBox="0 0 54 40" aria-hidden="true">
      <line x1="2" y1="36" x2="52" y2="36" stroke="currentColor" strokeOpacity=".35"/>
      <g transform={`translate(${(54 - w) / 2} ${y})`}>
        <rect width={w} height={h} fill={glass ? "#cfe4f2" : "#8a6a52"} stroke="currentColor" strokeWidth="1.2"/>
        {glass ? <line x1={w / 2} y1="0" x2={w / 2} y2={h} stroke="currentColor" strokeWidth="1"/> : <circle cx={w - 4} cy={h * .52} r="1.4" fill="currentColor"/>}
      </g>
    </svg>
  );
}

function Tile({tab, o}: {tab: string, o: any}){
  const payload = `${tab}:${o.id}`;
  let body;
  if (tab === "furn"){
    const k = 38 / Math.max(o.w, o.d), maps = texMaps(o);
    const fill = maps ? {background:`url(${maps.base}) center/${38 * o.tile / Math.max(o.w, o.d)}px`} : {background:o.c};
    body = <>
      <div className="sw" style={{background:"var(--stage)"}}><div className="fp" style={{width:o.w * k, height:o.d * k, ...fill}}/></div>
      <b>{nameOf(o)}</b><span className="meta"><bdi>{Math.round(o.w * 100)}×{Math.round(o.d * 100)} {t("cm")}</bdi><bdi>{fmt(priceOf(o.id))}</bdi></span>
    </>;
  } else if (tab === "open"){
    body = <>
      <div className="sw" style={{background:"var(--stage)", color:"var(--muted)"}}><OpeningIcon p={o}/></div>
      <b>{nameOf(o)}</b><span className="meta"><bdi>{toCm(o.width)}×{toCm(o.height)} {t("cm")}</bdi></span>
    </>;
  } else {
    body = <>
      <div className="sw" style={{backgroundImage:`url(${swatchURL(o)})`}}/>
      <b>{nameOf(o)}</b><span className="meta"><bdi>{fmt(priceOf(o.id))} / {t("m2")}</bdi></span>
    </>;
  }
  return (
    <button type="button" className="tile" draggable title={nameOf(o)}
      onDragStart={e => { e.dataTransfer.setData("text/plain", payload); e.dataTransfer.effectAllowed = "copy"; }}
      onClick={() => applyPayload(payload, null)}>
      {body}
    </button>
  );
}

export default function Library({onUpload}: {onUpload: () => void}){
  const replacing = Boolean(S.replacing) && S.tab === "furn";
  const hint = ui.flash || (replacing ? t("hintReplace") : t(HINT_KEYS[S.tab]));
  return (
    <aside className="panel library">
      <div className="phead"><h2>{t("library")}</h2><small>{t("dragDrop")}</small></div>
      <div className="tabs" role="tablist">
        {TABS.map(([id, key]) => (
          <button key={id} role="tab" aria-selected={S.tab === id} onClick={() => { S.tab = id; notify(); }}>{t(key)}</button>
        ))}
      </div>
      <div className={"lib" + (replacing ? " replacing" : "")}>
        {LISTS[S.tab]().map(o => <Tile key={o.id} tab={S.tab} o={o}/>)}
      </div>
      {ui.canUpload && S.tab === "furn" && <button className="btn uploadbtn" type="button" onClick={onUpload}><IconUpload/><span>{t("uploadModel")}</span></button>}
      <p className={"hint" + (ui.flash ? " flash" : "")} role="status">{hint}</p>
    </aside>
  );
}
