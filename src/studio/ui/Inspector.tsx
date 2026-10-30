// The selection toolbar, a full-width row above the library, the views and the estimate: what's selected,
// its price and size, and the actions for it (replace, rotate, duplicate, delete...).
import { useEffect, type ReactNode } from "react";
import { S, clampItem, findItem, wallArea, itemClearances, isLocked } from "../state.js";
import { FU, WM, FM } from "../catalog.js";
import { OP, findOpening, refit, openingKind, duplicateOpening, centerOpening } from "../openings.js";
import { isAuto, supportUnder } from "../stacking.js";
import { update } from "../app.js";
import { notify, ui } from "../store.js";
import { rotateSel, deleteSel, clearSelection, alignSelected, canAlign, focusSel, toggleLock } from "../actions.js";
import { multiCount, multiOpIds, multiItems } from "../selection.js";
import { t, nameOf, getLang } from "../i18n.js";
import { settings, priceOf } from "../settings.js";
import { fmt } from "../utils.js";
import { polyArea, toCm, toM } from "../geometry.js";
import NumField from "./NumField";
import type { Item } from "../types";
import { IconSwap, IconRotate, IconRotateCcw, IconFocus, IconLock, IconUnlock, IconCopy, IconTrash, IconCenter, IconSelect, IconChevron,
  IconAlignLeft, IconAlignHCenter, IconAlignRight, IconAlignTop, IconAlignVCenter, IconAlignBottom } from "./Icons";

// The price of a finish or piece, shown for reference; it is changed in the Price list.
function PriceTag({id, perKey}: {id: string, perKey: string}){
  return (
    <span className="pricetag">
      <span>{t("price")}</span><b dir="ltr">{fmt(priceOf(id))}</b><span>{settings.currency} {t(perKey)}</span>
    </span>
  );
}

// A centimetre field (value given in metres), with up/down buttons that step it by 5 cm.
const STEP_CM = 5;
function CmField({label, m, title, onCommit, disabled}: {label: string, m: number, title?: string, onCommit: (metres: number) => void, disabled?: boolean}){
  const step = (dir: 1 | -1) => onCommit(toM(Math.max(0, toCm(m) + dir * STEP_CM)));
  return (
    <div className={"num" + (disabled ? " disabled" : "")} title={title}>
      <label>
        <span>{label}</span>
        <NumField fit inputMode="numeric" step={STEP_CM} min="0" value={toCm(m)} disabled={disabled} onCommit={v => onCommit(toM(v || 0))}/>
        <em>{t("cm")}</em>
      </label>
      <span className="stepper">
        <button type="button" tabIndex={-1} disabled={disabled} aria-label={`${label} +${STEP_CM} ${t("cm")}`} onClick={() => step(1)}><IconChevron/></button>
        <button type="button" tabIndex={-1} disabled={disabled} aria-label={`${label} −${STEP_CM} ${t("cm")}`} onClick={() => step(-1)}><IconChevron/></button>
      </span>
    </div>
  );
}

// The selected piece's distance to the walls it faces (also drawn on the plan): an arrow toward the wall,
// the wall's number (as on the plan), and the distance in cm.
const ARROW: Record<string, string> = {n:"↑", e:"→", s:"↓", w:"←"};
function WallGaps({it}: {it: Item}){
  const gaps = itemClearances(it);
  if (!gaps.length) return null;
  return (
    <div className="gaps" role="group" aria-label={t("toWalls")}>
      <span className="gaps-label">{t("toWalls")}</span>
      {gaps.map(c => {
        const wall = t("wallN", {n:c.wall + 1});
        return (
          <span key={c.side} className="gap" title={wall} aria-label={t("toWallAria", {wall, n:toCm(c.dist)})}>
            <span className="gap-arrow" aria-hidden="true">{ARROW[c.side]}</span>
            <span className="gap-wall" aria-hidden="true">{c.wall + 1}</span>
            <b dir="ltr" aria-hidden="true">{toCm(c.dist)}</b>
          </span>
        );
      })}
      <span className="gaps-unit">{t("cm")}</span>
    </div>
  );
}

// Several pieces selected: line them up against their combined outline (left/centre/right, top/middle/bottom).
const ALIGN = [
  [["left", "alignLeft", IconAlignLeft], ["hcenter", "alignHCenter", IconAlignHCenter], ["right", "alignRight", IconAlignRight]],
  [["top", "alignTop", IconAlignTop], ["vcenter", "alignVCenter", IconAlignVCenter], ["bottom", "alignBottom", IconAlignBottom]]
] as const;
function AlignBar(){
  return (
    <div className="aligns" role="group" aria-label={t("align")}>
      <span className="aligns-label">{t("align")}</span>
      {ALIGN.map((group, g) => (
        <span key={g} className="segbar">
          {group.map(([mode, key, Icon]) => (
            <button key={mode} type="button" title={t(key)} aria-label={t(key)} disabled={!canAlign(mode)} onClick={() => alignSelected(mode)}><Icon/></button>
          ))}
        </span>
      ))}
    </div>
  );
}

const Btn = ({label, onClick, danger, title, icon, disabled, pressed}:
  {label: string, onClick: () => void, danger?: boolean, title?: string, icon?: ReactNode, disabled?: boolean, pressed?: boolean}) =>
  <button className={"btn" + (danger ? " danger" : "")} type="button" title={title || (icon ? label : undefined)} aria-label={icon ? label : undefined}
    disabled={disabled} aria-pressed={pressed} onClick={onClick}>{icon}<span>{label}</span></button>;

// Lock / unlock: pressed while locked.
const LockBtn = ({locked}: {locked: boolean}) =>
  <Btn icon={locked ? <IconLock/> : <IconUnlock/>} label={t(locked ? "unlock" : "lock")} title={t(locked ? "unlockHint" : "lockHint")} pressed={locked} onClick={toggleLock}/>;

function What({name, sub}: {name: string, sub: string}){
  return <div className="what"><h2>{name}</h2><p className={ui.inspectMsg ? "warn" : undefined}>{ui.inspectMsg || sub}</p></div>;
}

export default function Inspector(){
  const s = S.sel;
  // Selecting a door, a wall or the floor opens the matching library tab.
  const tabFor = s?.kind === "opening" ? "open" : s?.kind === "wall" ? "wall" : s?.kind === "floor" ? "floor" : null;
  useEffect(() => { if (tabFor && S.tab !== tabFor){ S.tab = tabFor; notify(); } }, [tabFor, s?.id]);

  const old = S.replacing != null ? findItem(S.replacing) : undefined;
  const it = s?.kind === "item" ? findItem(s.id) : undefined;
  const o = s?.kind === "opening" ? findOpening(s.id) : undefined;
  const many = multiCount();
  let body = null;
  if (many >= 2){
    body = <>
      <What name={t(multiOpIds().length ? "nSelectedAll" : "nSelected", {n:many})} sub={t(multiOpIds().length ? "multiAnchorHint" : "multiHint")}/>
      <AlignBar/>
      <div className="acts">
        <Btn label={t("deselect")} onClick={clearSelection}/>
        <Btn icon={<IconFocus/>} label={t("focus")} title={t("focusHint")} onClick={focusSel}/>
        {multiItems().length > 0 && <LockBtn locked={multiItems().every(isLocked)}/>}
        <Btn icon={<IconTrash/>} label={t("deleteAll")} danger onClick={deleteSel}/>
      </div>
    </>;
  } else if (old){
    body = <>
      <What name={t("replacing", {name:nameOf(FU[old.type])})} sub={t("pickNew")}/>
      <div className="acts"><Btn label={t("cancel")} onClick={clearSelection}/></div>
    </>;
  } else if (it){
    const f = FU[it.type];
    // where it sits: on the floor / on another piece (automatic), or at a height set by hand
    const under = isAuto(it) ? supportUnder(it) : null;
    const underName = under && (getLang() === "en" ? nameOf(FU[under.type]).toLowerCase() : nameOf(FU[under.type]));
    const rests = !isAuto(it) ? t("fixedHeight") : under ? t("restsOn", {name:underName}) : t("onFloor");
    const locked = isLocked(it);
    body = <>
      <What name={nameOf(f)} sub={`${Math.round(f.w * 100)}×${Math.round(f.d * 100)} ${t("cm")} · ${locked ? t("lockedNote") : rests}`}/>
      <PriceTag id={it.type} perKey="perPiece"/>
      <div className="dims">
        {/* typing a height pins it there (e.g. a wall-mounted TV); "Rest on surface" lets it settle again */}
        <CmField label={t("fromFloor")} m={it.z || 0} title={t("raiseHint")} disabled={locked} onCommit={z => { it.z = z; it.zAuto = false; clampItem(it); update(); }}/>
        {!isAuto(it) && !locked && <Btn label={t("restOnSurface")} title={t("restOnSurfaceHint")} onClick={() => { it.zAuto = true; update(); }}/>}
      </div>
      <WallGaps it={it}/>
      <div className="acts">
        <LockBtn locked={locked}/>
        <Btn icon={<IconSwap/>} label={t("replace")} disabled={locked} onClick={() => { S.replacing = it.id; S.tab = "furn"; notify(); }}/>
        <Btn icon={<IconRotateCcw/>} label={t("rotateLeft")} title={t("rotateLeftHint")} disabled={locked} onClick={() => rotateSel(1)}/>
        <Btn icon={<IconRotate/>} label={t("rotateRight")} title={t("rotateRightHint")} disabled={locked} onClick={() => rotateSel(-1)}/>
        <Btn icon={<IconFocus/>} label={t("focus")} title={t("focusHint")} onClick={focusSel}/>
        <Btn icon={<IconCopy/>} label={t("duplicate")} onClick={() => {
          const c = {...it, id:S.nextId++, x:it.x + .3, y:it.y + .3}; delete c.locked;   // the copy is free to move
          clampItem(c); S.items.push(c); S.sel = {kind:"item", id:c.id}; update();
        }}/>
        <Btn icon={<IconTrash/>} label={t("delete")} danger disabled={locked} onClick={deleteSel}/>
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
        <Btn icon={<IconCopy/>} label={t("duplicate")} onClick={() => {
          const c = duplicateOpening(o);
          if (!c){ ui.inspectMsg = t("hintNoRoomOnWall"); notify(); return; }
          S.sel = {kind:"opening", id:c.id}; ui.inspectMsg = null; update();
        }}/>
        <Btn icon={<IconCenter/>} label={t("centerOnWall")} onClick={() => { if (centerOpening(o)) update(); }}/>
        <Btn icon={<IconTrash/>} label={t("delete")} danger onClick={deleteSel}/>
      </div>
    </>;
  } else if (s?.kind === "wall"){
    const id = S.walls[s.id], m = WM[id];
    body = <>
      <What name={t("wallN", {n:s.id + 1})} sub={`${nameOf(m)} · ${wallArea(s.id).toFixed(1)} ${t("m2")}`}/>
      {(m.price || priceOf(id)) ? <PriceTag id={id} perKey="perM2"/> : null}
      <div className="acts">
        <Btn label={t("applyAll")} onClick={() => { S.walls = S.walls.map(() => S.walls[s.id]); update(); }}/>
        <Btn label={t("removeFinish")} onClick={deleteSel}/>
      </div>
    </>;
  } else if (s?.kind === "floor"){
    const id = S.floor, m = FM[id];
    body = <>
      <What name={t("floor")} sub={`${nameOf(m)} · ${polyArea(S.poly).toFixed(1)} ${t("m2")}`}/>
      {(m.price || priceOf(id)) ? <PriceTag id={id} perKey="perM2"/> : null}
      <div className="acts"><Btn label={t("removeFloor")} onClick={deleteSel}/></div>
    </>;
  }
  // Nothing selected: the panel stays, saying how to fill it.
  if (!body) body = <div className="noselect"><IconSelect/><div><h2>{t("noSel")}</h2><p>{t("noSelHint")}</p></div></div>;
  return <section className={"panel inspect" + (s || old ? "" : " empty")} aria-label={t("selAria")}>{body}</section>;
}
