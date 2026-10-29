// "New room": choose how to start (and the saved projects), then set the shape and size in cm,
// place doors and windows (by hand or found by the AI in photos), and hand the room to the studio.
import { useReducer, useState } from "react";
import { t } from "../../i18n.js";
import { newDraft, newOpening, draftWalls, draftToRoom, fitDraftToWalls } from "../../setup/draft.js";
import NumField from "../NumField";
import SetupPreview from "./SetupPreview";
import PhotosSection from "./PhotosSection";
import ProjectsList from "./ProjectsList";
import { AccountButton } from "../AccountDialog";
import { useLang } from "../hooks";

const ERR_KEY: Record<string, string> = {beyondWall:"errBeyondWall", tooTall:"errTooTall", overlap:"errOverlap", tooSmall:"errTooSmall"};

type Props = {
  initialDraft: any | null;          // coming back from the studio ("Room setup"): its room, with furniture kept
  canContinue: boolean;
  onStart: (room: any, opts: {keepDesign: boolean, draft: any}) => void;
  onContinue: () => void;
  onOpenProject: (p: any) => void;
  onCurrentDeleted: (kind: "studio" | "flat") => void;
  canContinueFlat: boolean;
  onContinueFlat: () => void;
  projectError: string | null;
  onAccount: () => void;
  onLang: () => void;
  onPlan: () => void;                // "I have a floor plan"
};

export default function SetupScreen(props: Props){
  useLang();
  const [draft, setDraft] = useState<any>(props.initialDraft);   // null: the "How do you want to start?" view
  const [keepDesign, setKeepDesign] = useState(Boolean(props.initialDraft));
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [active, setActive] = useState<string | null>(null);     // the selected photo
  const [listed, setListed] = useState(false);                    // the projects list shows the current room

  const start = (mode: string) => { setDraft(newDraft(mode)); setKeepDesign(false); setActive(null); window.scrollTo(0, 0); };

  let body;
  if (!draft){
    body = (
      <div className="choose">
        <h1>{t("newRoom")}</h1>
        <p className="dnote">{t("newRoomSub")}</p>
        <div className="choices">
          <button className="choice" type="button" onClick={() => start("manual")}>
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40V8h32v32z M8 30h10v10 M30 8v8" fill="none" stroke="currentColor" strokeWidth="2.4"/></svg>
            <b>{t("chooseManual")}</b><span>{t("chooseManualSub")}</span>
          </button>
          <button className="choice" type="button" onClick={() => start("photos")}>
            <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="12" width="36" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="2.4"/><circle cx="24" cy="25" r="7" fill="none" stroke="currentColor" strokeWidth="2.4"/><path d="M17 12l3-5h8l3 5" fill="none" stroke="currentColor" strokeWidth="2.4"/></svg>
            <b>{t("choosePhotos")}</b><span>{t("choosePhotosSub")}</span>
          </button>
          <button className="choice" type="button" onClick={props.onPlan}>
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 8h36v32H6z M6 24h14 M26 8v12 M26 28v12 M26 24h16" fill="none" stroke="currentColor" strokeWidth="2.4"/><path d="M20 24a6 6 0 0 1 6-6" fill="none" stroke="currentColor" strokeWidth="1.6"/></svg>
            <b>{t("chooseFloorPlan")}</b><span>{t("chooseFloorPlanSub")}</span>
          </button>
        </div>
        {(props.canContinue && !listed || props.canContinueFlat) && (
          <div className="acts2">
            {props.canContinue && !listed && <button className="btn" type="button" onClick={props.onContinue}>{t("continueLast")}</button>}
            {props.canContinueFlat && <button className="btn" type="button" onClick={props.onContinueFlat}>{t("continueFlat")}</button>}
          </div>
        )}
        <ProjectsList onOpen={props.onOpenProject} onCurrentDeleted={props.onCurrentDeleted} onHasCurrent={setListed} error={props.projectError}/>
      </div>
    );
  } else {
    fitDraftToWalls(draft);
    const last = draftToRoom(draft), walls = draftWalls(draft);
    const activePhoto = draft.photos.find((p: any) => p.id === active);
    const shapeNum = (key: string, label: string, min: number) => (
      <label><span>{t(label)}</span>
        <NumField min={min} step="1" inputMode="numeric" value={draft[key]}
          onInput={e => { draft[key] = Math.round(Number(e.currentTarget.value) || 0); redraw(); }} onCommit={() => redraw()}/>
        <small>{t("cm")}</small></label>
    );
    const openNum = (o: any, label: string, field: string) => (
      <label><span>{t(label)}</span>
        <NumField min="0" step="1" inputMode="numeric" value={o[field]}
          onInput={e => { o[field] = Math.round(Number(e.currentTarget.value) || 0); o.fromAI = false; redraw(); }} onCommit={() => redraw()}/>
        <small>{t("cm")}</small></label>
    );
    body = (
      <div className="setup-form">
        <div className="setup-grid">
          <div className="panel col-form">
            <section className="sblock">
              <h2>{t("shapeTitle")}</h2>
              <div className="seg" role="radiogroup">
                {[["rect", "shapeRect"], ["L", "shapeL"]].map(([v, key]) => (
                  <label key={v}><input type="radio" name="suShape" value={v} checked={draft.shape === v} onChange={() => { draft.shape = v; redraw(); }}/><span>{t(key)}</span></label>
                ))}
              </div>
              <div className="fgrid">
                {shapeNum("lengthCm", "lengthCm", 100)}{shapeNum("widthCm", "widthCm", 100)}{shapeNum("heightCm", "heightCm", 200)}
              </div>
              {draft.shape === "L" && (
                <div className="fgrid">
                  {shapeNum("cutLengthCm", "cutLength", 1)}{shapeNum("cutWidthCm", "cutWidth", 1)}
                  <label><span>{t("cutCorner")}</span>
                    <select value={draft.corner} onChange={e => { draft.corner = e.target.value; redraw(); }}>
                      {["nw", "ne", "se", "sw"].map(c => <option key={c} value={c}>{t("corner_" + c)}</option>)}
                    </select></label>
                </div>
              )}
              <p className="serr" role="alert">{last.shapeError ? t("err_" + last.shapeError) : ""}</p>
              <h3>{t("wallsTitle")}</h3>
              <ol className="wall-list">
                {walls.map((w: any) => <li key={w.i}><span className="wn">{w.i + 1}</span><bdi dir="ltr">{w.lenCm} {t("cm")}</bdi></li>)}
              </ol>
            </section>

            {draft.mode === "photos" && <PhotosSection draft={draft} walls={walls} active={active} setActive={setActive} redraw={redraw}/>}

            <section className="sblock">
              <h2>{t("openingsTitle")}</h2>
              <div>
                {!draft.openings.length && <p className="dnote">{t("noOpenings")}</p>}
                {draft.openings.map((o: any) => {
                  const err = last.openingErrors[o.id];
                  return (
                    <div key={o.id} className={"orow" + (o.fromAI ? " ai" : "") + (err ? " bad" : "")}>
                      <div className="ohead">
                        <strong>{t(o.type === "door" ? "door1" : "window1")}</strong>
                        {o.fromAI && <span className="aitag">{t("foundByAI")}</span>}
                        <label className="owall"><span>{t("onWall")}</span>
                          <select value={o.wall} onChange={e => {
                            // Moving to another wall: centre it there, so it fits whenever the wall is long enough.
                            o.wall = Number(e.target.value); o.fromAI = false;
                            const w = walls[o.wall]; if (w) o.offsetCm = Math.max(0, Math.round((w.lenCm - o.widthCm) / 2));
                            redraw();
                          }}>{walls.map((w: any) => <option key={w.i} value={w.i}>{w.i + 1}</option>)}</select></label>
                        <button className="btn small" type="button" onClick={() => { draft.openings = draft.openings.filter((x: any) => x !== o); redraw(); }}>{t("remove")}</button>
                      </div>
                      <div className="ofields">
                        {openNum(o, "fromCorner", "offsetCm")}{openNum(o, "oWidth", "widthCm")}{openNum(o, "oHeight", "heightCm")}
                        {o.type === "window" && openNum(o, "oSill", "sillCm")}
                      </div>
                      <p className="oerr">{err ? t(ERR_KEY[err]) : ""}</p>
                    </div>
                  );
                })}
              </div>
              <div className="acts2">
                <button className="btn" type="button" onClick={() => { draft.openings.push(newOpening("door", 0, draft)); redraw(); }}>{t("addDoor")}</button>
                <button className="btn" type="button" onClick={() => { draft.openings.push(newOpening("window", 0, draft)); redraw(); }}>{t("addWindow")}</button>
              </div>
            </section>
          </div>
          <div className="panel col-preview">
            <SetupPreview room={last.room} errors={last.openingErrors} activeWall={activePhoto ? activePhoto.wall : null}
              onMove={(id, offsetCm) => { const o = draft.openings.find((x: any) => x.id === id); if (o){ o.offsetCm = offsetCm; o.fromAI = false; } redraw(); }}
              onEnd={redraw}
              onWallClick={i => { if (activePhoto){ activePhoto.wall = i; redraw(); } }}/>
            <p className="dnote">{t("previewHint")}</p>
          </div>
        </div>
        <div className="setup-actions">
          <button className="btn" type="button" onClick={() => setDraft(null)}>{t("backChoice")}</button>
          <button className="btn primary" type="button" disabled={!last.ok} onClick={() => { const r = draftToRoom(draft); if (r.ok) props.onStart(r.room, {keepDesign, draft}); }}>{t("startDesign")}</button>
        </div>
      </div>
    );
  }

  return (
    <section className="setup wrap">
      <header className="bar">
        <div className="brand"><strong>RoomPitch</strong><span className="tag">{t("newRoom")}</span></div>
        <div className="tools"><AccountButton onOpen={props.onAccount}/><button className="btn langbtn" type="button" onClick={props.onLang}>{t("langBtn")}</button></div>
      </header>
      {body}
    </section>
  );
}
