// The selection bar: what's selected, its price, and the actions for it (replace, rotate, duplicate, delete...).
import { useEffect } from "react";
import { S, clampItem, findItem, wallArea } from "../state.js";
import { FU, WM, FM } from "../catalog.js";
import { OP, findOpening, refit, openingKind, duplicateOpening, centerOpening } from "../openings.js";
import { isAuto, supportUnder } from "../stacking.js";
import { update } from "../app.js";
import { notify, ui } from "../store.js";
import { rotateSel, deleteSel, clearSelection } from "../actions.js";
import { t, nameOf, getLang } from "../i18n.js";
import { settings, priceOf, setPrice } from "../settings.js";
import { polyArea, toCm, toM } from "../geometry.js";
import NumField from "./NumField";

// Editable price for a finish or piece. Saved on change; the estimate and library follow.
function PriceField({id, perKey}: {id: string, perKey: string}){
  return (
    <label className="pricefield">
      <span>{t("price")}</span>
      <NumField min="0" step="1" inputMode="decimal" value={priceOf(id)}
        onCommit={(v, el) => { setPrice(id, v); el.value = String(priceOf(id)); notify(); }}/>
      <span className="unit">{settings.currency} {t(perKey)}</span>
    </label>
  );
}

// A centimetre field (value given in metres).
function CmField({label, m, title, onCommit}: {label: string, m: number, title?: string, onCommit: (metres: number) => void}){
  return (
    <label className="num" title={title}>
      <span>{label}</span>
      <NumField inputMode="numeric" step="5" min="0" value={toCm(m)} onCommit={v => onCommit(toM(v || 0))}/>
      <em>{t("cm")}</em>
    </label>
  );
}

const Btn = ({label, onClick, danger, title}: {label: string, onClick: () => void, danger?: boolean, title?: string}) =>
  <button className={"btn" + (danger ? " danger" : "")} type="button" title={title} onClick={onClick}>{label}</button>;

function What({name, sub}: {name: string, sub: string}){
  return <div className="what">{name}<em style={ui.inspectMsg ? {color:"var(--accent)"} : undefined}>{ui.inspectMsg || sub}</em></div>;
}

export default function Inspector(){
  const s = S.sel;
  // Selecting a door, a wall or the floor opens the matching library tab.
  const tabFor = s?.kind === "opening" ? "open" : s?.kind === "wall" ? "wall" : s?.kind === "floor" ? "floor" : null;
  useEffect(() => { if (tabFor && S.tab !== tabFor){ S.tab = tabFor; notify(); } }, [tabFor, s?.id]);

  const old = S.replacing != null ? findItem(S.replacing) : undefined;
  const it = s?.kind === "item" ? findItem(s.id) : undefined;
  const o = s?.kind === "opening" ? findOpening(s.id) : undefined;
  let body = null;
  if (old){
    body = <>
      <div className="what">{t("replacing", {name:nameOf(FU[old.type])})}<em>{t("pickNew")}</em></div>
      <div className="acts"><Btn label={t("cancel")} onClick={clearSelection}/></div>
    </>;
  } else if (it){
    const f = FU[it.type];
    // where it sits: on the floor / on another piece (automatic), or at a height set by hand
    const under = isAuto(it) ? supportUnder(it) : null;
    const underName = under && (getLang() === "en" ? nameOf(FU[under.type]).toLowerCase() : nameOf(FU[under.type]));
    const rests = !isAuto(it) ? t("fixedHeight") : under ? t("restsOn", {name:underName}) : t("onFloor");
    body = <>
      <What name={nameOf(f)} sub={`${Math.round(f.w * 100)}×${Math.round(f.d * 100)} ${t("cm")}`}/>
      <PriceField id={it.type} perKey="perPiece"/>
      <div className="dims">
        {/* typing a height pins it there (e.g. a wall-mounted TV); "Rest on surface" lets it settle again */}
        <CmField label={t("fromFloor")} m={it.z || 0} title={t("raiseHint")} onCommit={z => { it.z = z; it.zAuto = false; clampItem(it); update(); }}/>
        <span className="rests">{rests}</span>
        {!isAuto(it) && <Btn label={t("restOnSurface")} title={t("restOnSurfaceHint")} onClick={() => { it.zAuto = true; update(); }}/>}
      </div>
      <div className="acts">
        <Btn label={t("replace")} onClick={() => { S.replacing = it.id; S.tab = "furn"; notify(); }}/>
        <Btn label={t("rotate")} onClick={rotateSel}/>
        <Btn label={t("duplicate")} onClick={() => { const c = {...it, id:S.nextId++, x:it.x + .3, y:it.y + .3}; clampItem(c); S.items.push(c); S.sel = {kind:"item", id:c.id}; update(); }}/>
        <Btn label={t("delete")} danger onClick={deleteSel}/>
      </div>
    </>;
  } else if (o){
    const resize = (key: "width" | "height" | "sill") => (m: number) => {
      const before = {...o};
      o[key] = m;
      const ok = refit(o);
      if (!ok) Object.assign(o, before);
      ui.inspectMsg = ok ? null : t("openingNoFit");
      update();
    };
    body = <>
      <What name={nameOf(OP[openingKind(o)])} sub={`${t("wallN", {n:o.wall + 1})} · ${(o.width * o.height).toFixed(1)} ${t("m2")} · ${t("dragToMove")}`}/>
      <div className="sizes">
        <CmField label={t("width")} m={o.width} onCommit={resize("width")}/>
        <CmField label={t("height")} m={o.height} onCommit={resize("height")}/>
        {o.type !== "door" && <CmField label={t("fromFloor")} m={o.sill} onCommit={resize("sill")}/>}
      </div>
      <div className="acts">
        <Btn label={t("duplicate")} onClick={() => {
          const c = duplicateOpening(o);
          if (!c){ ui.inspectMsg = t("hintNoRoomOnWall"); notify(); return; }
          S.sel = {kind:"opening", id:c.id}; ui.inspectMsg = null; update();
        }}/>
        <Btn label={t("centerOnWall")} onClick={() => { if (centerOpening(o)) update(); }}/>
        <Btn label={t("delete")} danger onClick={deleteSel}/>
      </div>
    </>;
  } else if (s?.kind === "wall"){
    const id = S.walls[s.id], m = WM[id];
    body = <>
      <What name={t("wallN", {n:s.id + 1})} sub={`${nameOf(m)} · ${wallArea(s.id).toFixed(1)} ${t("m2")}`}/>
      {(m.price || priceOf(id)) ? <PriceField id={id} perKey="perM2"/> : null}
      <div className="acts">
        <Btn label={t("applyAll")} onClick={() => { S.walls = S.walls.map(() => S.walls[s.id]); update(); }}/>
        <Btn label={t("removeFinish")} onClick={deleteSel}/>
      </div>
    </>;
  } else if (s?.kind === "floor"){
    const id = S.floor, m = FM[id];
    body = <>
      <What name={t("floor")} sub={`${nameOf(m)} · ${polyArea(S.poly).toFixed(1)} ${t("m2")}`}/>
      {(m.price || priceOf(id)) ? <PriceField id={id} perKey="perM2"/> : null}
      <div className="acts"><Btn label={t("removeFloor")} onClick={deleteSel}/></div>
    </>;
  }
  if (!body) return null;
  // the bar only shows while something is selected (or a piece is being replaced)
  return <div className="inspect" role="region" aria-label={t("selection")}>{body}</div>;
}
