// Library panel: furniture, windows & doors, wall and floor tiles that can be clicked or dragged into the room.
// The categories are a row of icon buttons; every category can be searched (by English or Arabic
// name, in the browser: the whole catalog is already loaded), and furniture narrowed to a group (seating, tables...).
import { S } from "../state.js";
import { FURN, WALL_MATS, FLOOR_MATS, FURN_CATS, EN, furnCat, texMaps } from "../catalog.js";
import { OPENING_PRESETS } from "../openings.js";
import { swatchURL } from "../textures.js";
import { fmt } from "../utils.js";
import { notify, ui } from "../store.js";
import { applyPayload } from "../actions.js";
import { t, nameOf } from "../i18n.js";
import { priceOf } from "../settings.js";
import { toCm } from "../geometry.js";
import { useEffect } from "react";
import { thumbOf, thumbBroken, requestThumb } from "../thumbs.js";
import { IconUpload, IconArmchair, IconDoor, IconWall, IconFloor, IconSearch, IconClose } from "./Icons";

const TABS = [["furn", "tabFurn", IconArmchair], ["open", "tabOpen", IconDoor], ["wall", "tabWall", IconWall], ["floor", "tabFloor", IconFloor]] as const;
const HINT_KEYS: Record<string, string> = {furn:"hintFurn", open:"hintOpen", wall:"hintWall", floor:"hintFloor"};
const COUNT_KEYS: Record<string, string> = {furn:"countFurn", open:"countOpen", wall:"countWall", floor:"countFloor"};
const SEARCH_KEYS: Record<string, string> = {furn:"searchFurn", open:"searchOpen", wall:"searchWall", floor:"searchFloor"};
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
  const thumb = tab === "furn" ? thumbOf(o) : null;
  useEffect(() => { if (tab === "furn" && !thumb) requestThumb(o); }, [tab, o.id, thumb]);
  if (tab === "furn"){
    // The rendered thumbnail; until it's there, the piece's footprint seen from above.
    const k = 38 / Math.max(o.w, o.d), maps = texMaps(o);
    const fill = maps ? {background:`url(${maps.base}) center/${38 * o.tile / Math.max(o.w, o.d)}px`} : {background:o.c};
    body = <>
      <div className="sw thumb" style={{background:"var(--stage)"}}>
        {thumb ? <img src={thumb} alt="" loading="lazy" draggable={false} onError={() => thumbBroken(o)}/>
          : <div className="fp" style={{width:o.w * k, height:o.d * k, ...fill}}/>}
      </div>
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

// Searching: case, Arabic diacritics and the usual letter variants (أ إ آ ا, ة ه, ى ي) don't matter.
const fold = (s: string) => s.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
const matches = (o: any, q: string) => !q || [o.name, o.ar, EN[o.id]].some(s => s && fold(s).includes(q));

function setTab(id: typeof S.tab){ S.tab = id; ui.libQuery = ""; notify(); }

// Search box and (furniture) group chips. Only the groups that have pieces show.
function Filters({tab}: {tab: string}){
  const groups = tab === "furn" ? FURN_CATS.filter(c => FURN.some(f => furnCat(f) === c)) : [];
  if (FURN.some(f => furnCat(f) === "other") && groups.length) groups.push("other");
  return <>
    <div className="libsearch">
      <IconSearch/>
      <input type="search" value={ui.libQuery} placeholder={t(SEARCH_KEYS[tab])} aria-label={t(SEARCH_KEYS[tab])}
        onChange={e => { ui.libQuery = e.target.value; notify(); }}
        onKeyDown={e => { if (e.key === "Escape" && ui.libQuery){ e.stopPropagation(); ui.libQuery = ""; notify(); } }}/>
      {ui.libQuery && <button type="button" aria-label={t("clearSearch")} title={t("clearSearch")} onClick={() => { ui.libQuery = ""; notify(); }}><IconClose/></button>}
    </div>
    {groups.length > 1 && <div className="libchips" role="group" aria-label={t("furnGroups")}>
      {["all", ...groups].map(c => (
        <button key={c} type="button" aria-pressed={ui.libCat === c} onClick={() => { ui.libCat = c; notify(); }}>{t("cat_" + c)}</button>
      ))}
    </div>}
  </>;
}

// Nothing to show. When it's the search, point to where it does find things: the other furniture groups,
// or another tab (switching keeps the search).
function Empty({q, cat}: {q: string, cat: string}){
  const elsewhere: [label: string, n: number, go: () => void][] = [];
  if (cat !== "all"){
    const n = FURN.filter(o => matches(o, q)).length;
    if (n) elsewhere.push([t("allFurn"), n, () => { ui.libCat = "all"; notify(); }]);
  }
  for (const [id, key] of TABS){
    if (id === S.tab) continue;
    const n = q ? LISTS[id]().filter(o => matches(o, q)).length : 0;
    if (n) elsewhere.push([t(key), n, () => { S.tab = id; ui.libCat = "all"; notify(); }]);
  }
  return (
    <div className="libempty">
      <span>{q ? t("noMatches", {q:ui.libQuery.trim()}) : t("noneInGroup")}</span>
      {elsewhere.length > 0 && <div className="libelse">
        <span>{t("foundIn")}</span>
        {elsewhere.map(([label, n, go]) => <button key={label} type="button" className="btn small" onClick={go}>{label}<b>{n}</b></button>)}
      </div>}
      {q && <button type="button" className="btn small ghost" onClick={() => { ui.libQuery = ""; notify(); }}>{t("clearSearch")}</button>}
    </div>
  );
}

export default function Library({onUpload}: {onUpload: () => void}){
  const replacing = Boolean(S.replacing) && S.tab === "furn";
  const hint = ui.flash || (replacing ? t("hintReplace") : t(HINT_KEYS[S.tab]));
  const q = fold(ui.libQuery);
  const cat = S.tab === "furn" ? ui.libCat : "all";
  const shown = LISTS[S.tab]().filter(o => matches(o, q) && (cat === "all" || furnCat(o) === cat));
  return (
    <aside className="panel library">
      <div className="phead"><h2>{t("library")}</h2><small>{t(COUNT_KEYS[S.tab], {n:shown.length})}</small></div>
      <div className="libtabs" role="tablist" aria-label={t("libCategories")}>
        {TABS.map(([id, key, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={S.tab === id} title={t(id === "open" ? "tabOpenTitle" : key)} onClick={() => setTab(id)}>
            <Icon/><span>{t(key)}</span>
          </button>
        ))}
      </div>
      <Filters tab={S.tab}/>
      <div className={"lib" + (replacing ? " replacing" : "")}>
        {shown.map(o => <Tile key={o.id} tab={S.tab} o={o}/>)}
        {!shown.length && <Empty q={q} cat={cat}/>}
      </div>
      {ui.canUpload && S.tab === "furn" && <button className="btn uploadbtn" type="button" onClick={onUpload}><IconUpload/><span>{t("uploadModel")}</span></button>}
      <p className={"hint" + (ui.flash ? " flash" : "")} role="status">{hint}</p>
    </aside>
  );
}
