// "Your rooms" on the New room screen: the rooms this user saved in the cloud (cloud-store.js), on any browser
// signed in to the same account. The picked room fills a drawing sheet (its plan with dimension strings, its facts,
// Continue or Open); below, every room is a small sheet in a strip that scrolls sideways, "New room" first.
// Rename and delete (two clicks, like resetting prices) are in the sheet's ⋯ menu.
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { t, getLang } from "../../i18n.js";
import { FU } from "../../catalog.js";
import { toCm } from "../../geometry.js";
import { listProjects, renameProject, deleteProject } from "../../cloud-store.js";
import type { ProjectCard } from "../../cloud-store.js";
import { useLang } from "../hooks";
import { useAccount } from "../account";
import Menu, { MenuItem } from "../Menu";
import { IconEdit, IconMore, IconTrash } from "../Icons";

// "3 hours ago", "yesterday", or the date when older than a week.
function when(iso: string){
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(getLang(), {numeric:"auto"});
  if (s > -60) return rtf.format(0, "minute");
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  if (s > -7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString(getLang(), {day:"numeric", month:"short"});
}

// Rows get the database's default name until renamed; show it in the page's language.
const nameOf = (p: ProjectCard) => p.name === "Untitled room" ? t("projUntitled") : p.name;
const num = (n: number) => n.toLocaleString("en");   // Latin digits, like the measurements everywhere else

// The room's length, width and height in cm: from its outline, else from the setup form.
function dims(p: ProjectCard){
  const poly = p.plan?.poly;
  const L = poly ? toCm(Math.max(...poly.map(q => q[0])) - Math.min(...poly.map(q => q[0]))) : Number(p.form?.lengthCm) || 0;
  const W = poly ? toCm(Math.max(...poly.map(q => q[1])) - Math.min(...poly.map(q => q[1]))) : Number(p.form?.widthCm) || 0;
  const H = Number(p.form?.heightCm) || toCm(p.H);
  return {L, W, H};
}

// The room from above as a drawing: its outline and the pieces' footprints, in navy line on the sheet.
// `big` adds the dimension strings along the top and the start side.
function Plan({p, big}: {p: ProjectCard, big?: boolean}){
  const plan = p.plan;
  if (!plan) return <svg className="plan none" viewBox="0 0 10 10" aria-hidden="true"/>;
  const xs = plan.poly.map(q => q[0]), ys = plan.poly.map(q => q[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), L = Math.max(...xs) - x0, W = Math.max(...ys) - y0, m = Math.max(L, W);
  const pad = m * (big ? .16 : .1), tick = m * .028, o = pad * .5;
  const line = (w: number) => ({strokeWidth:w, vectorEffect:"non-scaling-stroke" as const});
  return (
    <svg className="plan" viewBox={`${x0 - pad} ${y0 - pad} ${L + pad * 2} ${W + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <polygon points={plan.poly.map(q => q.join(",")).join(" ")} fill="none" stroke="currentColor" strokeLinejoin="round" {...line(big ? 2.6 : 1.5)}/>
      {plan.items.map((it, i) => { const f = FU[it.type]; return f && (
        <rect key={i} x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d} transform={`translate(${it.x} ${it.y}) rotate(${-it.rot})`}
          className={f.rug ? "rug" : undefined} fill={f.rug ? "none" : "var(--drawing-fill)"} stroke="currentColor" {...line(big ? 1.2 : .8)}/>
      ); })}
      {big && <>
        <g stroke="currentColor" {...line(.8)}>
          <path d={`M${x0} ${y0 - o}h${L}M${x0} ${y0 - o - tick / 2}v${tick}M${x0 + L} ${y0 - o - tick / 2}v${tick}`}/>
          <path d={`M${x0 - o} ${y0}v${W}M${x0 - o - tick / 2} ${y0}h${tick}M${x0 - o - tick / 2} ${y0 + W}h${tick}`}/>
        </g>
        <g className="dimtext" fontSize={tick * 1.1} fill="currentColor" textAnchor="middle">
          <text x={x0 + L / 2} y={y0 - o - tick * .7}>{num(toCm(L))}</text>
          <text transform={`translate(${x0 - o - tick * .7} ${y0 + W / 2}) rotate(-90)`}>{num(toCm(W))}</text>
        </g>
      </>}
    </svg>
  );
}

const IconPlus = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>;
const Chevron = ({back}: {back?: boolean}) => <svg className="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={back ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"}/></svg>;

// No rooms yet: a room drawing itself on the sheet, as the first one will. The walls are drawn, the width is
// marked, then the sofa, rug, table and chairs settle in (studio.css .firstroom; still with reduced motion).
function FirstRoomDrawing(){
  return (
    <svg className="firstroom" viewBox="0 0 320 200" aria-hidden="true">
      <path className="fr-walls" pathLength={1} d="M236 42H40v120h240V42H268"/>
      <path className="fr-door" d="M236 42v32a32 32 0 0 0 32-32" pathLength={1}/>
      <g className="fr-dim"><path d="M40 26h240M40 21v10M280 21v10"/><text x="160" y="20" textAnchor="middle">900 cm</text></g>
      <g className="fr-pieces">
        <rect className="fr-p" style={{"--d": 0} as React.CSSProperties} x="52" y="54" width="76" height="24" rx="3"/>
        <rect className="fr-p rug" style={{"--d": 1} as React.CSSProperties} x="58" y="92" width="64" height="44"/>
        <circle className="fr-p" style={{"--d": 2} as React.CSSProperties} cx="214" cy="104" r="20"/>
        {[[214, 76], [214, 132], [186, 104], [242, 104]].map(([x, y], i) =>
          <rect key={i} className="fr-p" style={{"--d": 2.5 + i * .25} as React.CSSProperties} x={x - 6} y={y - 6} width="12" height="12" rx="2"/>)}
      </g>
    </svg>
  );
}

type Props = {
  onOpen: (p: ProjectCard) => void;
  onNew: () => void;
  onCurrentDeleted: () => void;
  canContinue: boolean;        // a room kept only in this browser
  onContinue: () => void;
  onAccount?: () => void;      // sign in, offered to a guest with no rooms
  error: string | null;
};

export default function RoomsPanel({onOpen, onNew, onCurrentDeleted, canContinue, onContinue, onAccount, error}: Props){
  const account = useAccount();
  useLang();
  const [rooms, setRooms] = useState<ProjectCard[] | null>(null);   // null while asking the cloud
  const [pick, setPick] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [armed, setArmed] = useState(false);       // Delete waiting for its second click
  const [deleting, setDeleting] = useState(false);
  const [ends, setEnds] = useState({back:false, on:false});
  const armTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nameInput = useRef<HTMLInputElement>(null), strip = useRef<HTMLDivElement>(null);

  // Ask the cloud each time the screen shows (after signing in, on another browser, ...).
  useEffect(() => {
    let live = true;
    listProjects().then(list => { if (!live) return; setRooms(list || []); setPick((list?.find(p => p.current) || list?.[0])?.id ?? null); });
    return () => { live = false; clearTimeout(armTimer.current); };
  }, []);
  useEffect(() => { if (renaming){ nameInput.current?.focus(); nameInput.current?.select(); } }, [renaming]);
  useEffect(() => { setRenaming(false); setArmed(false); clearTimeout(armTimer.current); }, [pick]);

  // The arrows dim at either end of the strip (scrollLeft runs negative in right-to-left pages).
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const check = () => {
      const at = Math.abs(el.scrollLeft);
      setEnds({back:at > 4, on:at + el.clientWidth < el.scrollWidth - 4});
    };
    check();
    el.addEventListener("scroll", check, {passive:true});
    const ro = new ResizeObserver(check); ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [rooms]);

  const rtl = () => document.documentElement.dir === "rtl";
  const scroll = (dir: 1 | -1) => {
    const el = strip.current;
    if (el) el.scrollBy({left:dir * (rtl() ? -1 : 1) * el.clientWidth * .8, behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  };

  const list = rooms || [];
  const i = list.findIndex(p => p.id === pick), room = list[i];

  async function saveName(){
    const name = nameInput.current?.value.trim();
    setRenaming(false);
    if (room && name && name !== nameOf(room) && await renameProject(room.id, name)) setRooms(l => l && l.map(x => x.id === room.id ? {...x, name} : x));
  }
  async function remove(){
    if (!room) return;
    if (!armed){ setArmed(true); armTimer.current = setTimeout(() => setArmed(false), 4000); return; }
    clearTimeout(armTimer.current); setArmed(false);
    setDeleting(true);
    const r = await deleteProject(room.id);
    setDeleting(false);
    if (!r.ok) return;
    const rest = list.filter(x => x.id !== room.id);
    setRooms(rest); setPick((rest[i] || rest[i - 1])?.id ?? null);
    if (r.current) onCurrentDeleted();
  }
  const onNameKey = (e: KeyboardEvent) => {
    if (e.key === "Enter"){ e.preventDefault(); saveName(); }
    else if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); setRenaming(false); }
  };
  // Clicking elsewhere keeps the typed name (but not a click on the sheet's own buttons).
  const onNameBlur = (e: FocusEvent) => { if (!(e.relatedTarget as Element | null)?.closest?.(".lead")) saveName(); };

  // Left and right arrow keys move the pick along the strip, in reading order.
  const onStripKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" || !list.length) return;
    const step = (e.key === "ArrowRight") !== rtl() ? 1 : -1;
    const n = Math.max(0, Math.min(list.length - 1, i + step));
    setPick(list[n].id);
    strip.current?.querySelector<HTMLElement>(`[data-id="${list[n].id}"]`)?.focus();
    e.preventDefault();
  };
  useEffect(() => {
    strip.current?.querySelector(`[data-id="${pick}"]`)?.scrollIntoView({block:"nearest", inline:"nearest"});
  }, [pick]);

  const d = room && dims(room);
  return (
    <section className="rooms" aria-labelledby="roomsHead" aria-busy={rooms === null}>
      <h2 id="roomsHead" className="colhead">{t("yourRooms")}{list.length > 0 && <span className="count">{num(list.length)}</span>}</h2>
      {error && <p className="projerr" role="alert">{error}</p>}

      {room && d ? (
        <article className="lead" aria-live="polite">
          <div className="sheet">
            <span className="no">D-{String(i + 1).padStart(2, "0")}</span>
            <Plan p={room} big/>
          </div>
          <div className="block">
            {room.current && <span className="tag">{t("projCurrent")}</span>}
            {renaming
              ? <input className="leadname" ref={nameInput} defaultValue={nameOf(room)} maxLength={80} aria-label={t("projRename")} onKeyDown={onNameKey} onBlur={onNameBlur}/>
              : <h3>{nameOf(room)}</h3>}
            <span className="meta">{t("roomEdited", {when:when(room.updatedAt)})}</span>
            <dl className="facts">
              <dt>{t("factSize")}</dt><dd className="num"><bdi dir="ltr">{num(d.L)} × {num(d.W)} × {num(d.H)} {t("cm")}</bdi></dd>
              <dt>{t("roomPieces")}</dt><dd className="num">{num(room.pieces)}</dd>
              <dt>{t("roomWindows")}</dt><dd className="num">{num(room.windows)}</dd>
              <dt>{t("roomDoors")}</dt><dd className="num">{num(room.doors)}</dd>
            </dl>
            <div className="cta">
              {renaming
                ? <button className="btn primary" type="button" onClick={saveName}>{t("projSave")}</button>
                : <button className="btn primary" type="button" onClick={() => onOpen(room)}>{t(room.current ? "projContinue" : "roomOpen")}</button>}
              <Menu label={`${t("more")}: ${nameOf(room)}`} className="btn icon" face={<IconMore/>} align="end">
                {done => <>
                  <MenuItem icon={<IconEdit/>} label={t("projRename")} onClick={() => { done(); setRenaming(true); }}/>
                  {/* The first click arms Delete and keeps the menu open; the second deletes. */}
                  <MenuItem icon={<IconTrash/>} danger disabled={deleting} label={t(armed ? "projDeleteSure" : "delete")}
                    onClick={() => { if (armed) done(); remove(); }}/>
                </>}
              </Menu>
            </div>
          </div>
        </article>
      ) : (
        <article className="lead empty">
          <div className="sheet">{rooms !== null && <FirstRoomDrawing/>}</div>
          <div className="block">
            {rooms !== null && <>
              <h3>{t("roomsEmpty")}</h3>
              <p className="meta">{t("roomsEmptySub")}</p>
              <ol className="firststeps">
                <li><span className="num">1</span>{t("firstStep1")}</li>
                <li><span className="num">2</span>{t("firstStep2")}</li>
                <li><span className="num">3</span>{t("firstStep3")}</li>
              </ol>
              <div className="cta"><button className="btn primary" type="button" onClick={onNew}>{t("firstRoomGo")}</button></div>
              {account?.anonymous && onAccount &&
                <p className="signhint">{t("firstSignHint")} <button className="linkbtn" type="button" onClick={onAccount}>{t("signIn")}</button></p>}
            </>}
          </div>
        </article>
      )}

      {/* A room kept only in this browser, beside the saved ones. */}
      {room && canContinue && !list.some(p => p.current) &&
        <button className="btn continue-local" type="button" onClick={onContinue}>{t("continueLast")}</button>}

      {list.length > 0 && <>
        <div className="strip-head">
          <h2>{t("allRooms")}</h2>
          <button className="nav" type="button" aria-label={t("stripBack")} disabled={!ends.back} onClick={() => scroll(-1)}><Chevron back/></button>
          <button className="nav" type="button" aria-label={t("stripOn")} disabled={!ends.on} onClick={() => scroll(1)}><Chevron/></button>
        </div>
        <div className="strip" ref={strip} role="group" aria-label={t("allRooms")} onKeyDown={onStripKey}>
          <button className="mini blank" type="button" onClick={onNew}><IconPlus/><span>{t("roomNew")}</span></button>
          {list.map(p => {
            const s = dims(p);
            return (
              <button key={p.id} className="mini" type="button" data-id={p.id} aria-pressed={p.id === pick} onClick={() => setPick(p.id)}>
                <span className="sheet"><Plan p={p}/></span>
                <span className="cap"><b>{nameOf(p)}</b><small><bdi dir="ltr" className="num">{num(s.L)} × {num(s.W)}</bdi>, {when(p.updatedAt)}</small></span>
              </button>
            );
          })}
        </div>
      </>}
    </section>
  );
}
