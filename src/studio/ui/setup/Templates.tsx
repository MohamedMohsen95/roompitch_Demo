// "Start from a template" on the New room screen: the published templates (templates.js) as cards, for
// anyone. A card opens a larger look with "Use this template", which copies it into a new project and opens
// the studio. Admins also see the hidden ones, and can hide, show or delete each (two clicks, like projects).
import { useEffect, useRef, useState } from "react";
import { t, getLang } from "../../i18n.js";
import { FU, FM } from "../../catalog.js";
import { toCm } from "../../geometry.js";
import { listTemplates, setPublished, deleteTemplate } from "../../templates.js";
import type { TemplateCard } from "../../templates.js";
import { useAccount } from "../account";
import { useLang } from "../hooks";
import Modal from "../Modal";
import Menu, { MenuItem } from "../Menu";
import { IconMore, IconEye, IconEyeOff, IconTrash, IconLayout } from "../Icons";

const nameOf = (c: TemplateCard) => getLang() === "ar" && c.nameAr ? c.nameAr : c.name;
const facts = (c: TemplateCard) => `${toCm(c.L)} × ${toCm(c.W)} ${t("cm")} · ${t("tplPieces", {n:c.pieces})}`;

// The cover, or (none saved) the room seen from above: its floor and the pieces' footprints.
function Cover({c}: {c: TemplateCard}){
  const p = c.plan;
  if (c.cover || !p) return <div className="tplpic">{c.cover ? <img src={c.cover} alt="" loading="lazy" draggable={false}/> : <IconLayout/>}</div>;
  const pad = Math.max(p.poly.reduce((m, q) => Math.max(m, q[0]), 0), p.poly.reduce((m, q) => Math.max(m, q[1]), 0)) * .08;
  const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]);
  const box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
  return (
    <div className="tplpic plan">
      <svg viewBox={box.join(" ")} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <polygon points={p.poly.map(q => q.join(",")).join(" ")} fill={FM[p.floor]?.c || "#d9c3a5"} stroke="currentColor" strokeWidth={pad * .35} strokeLinejoin="round"/>
        {p.items.map((it, i) => { const f = FU[it.type]; return f && (
          <rect key={i} x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d} rx=".04" transform={`translate(${it.x} ${it.y}) rotate(${-it.rot})`}
            fill="currentColor" fillOpacity=".38" stroke="currentColor" strokeOpacity=".5" strokeWidth=".02"/>
        ); })}
      </svg>
    </div>
  );
}

// The admin's ⋯ on a card.
function AdminMenu({c, onChange}: {c: TemplateCard, onChange: () => void}){
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Menu label={t("tplManage")} className="btn ghost icon tplmore" face={<IconMore/>}>
      {done => <>
        <MenuItem icon={c.published ? <IconEyeOff/> : <IconEye/>} label={t(c.published ? "tplHide" : "tplShow")}
          onClick={async () => { done(); if (await setPublished(c.id, !c.published)) onChange(); }}/>
        <MenuItem icon={<IconTrash/>} danger label={t(armed ? "tplDeleteSure" : "tplDelete")} onClick={async () => {
          if (!armed){ setArmed(true); timer.current = setTimeout(() => setArmed(false), 4000); return; }
          clearTimeout(timer.current); setArmed(false); done();
          if (await deleteTemplate(c.id)) onChange();
        }}/>
      </>}
    </Menu>
  );
}

export default function Templates({onUse, show}: {onUse: (c: TemplateCard, name: string) => Promise<boolean>, show?: boolean}){
  useLang();
  const account = useAccount();
  const [list, setList] = useState<TemplateCard[] | null>(null);
  const [open, setOpen] = useState<TemplateCard | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const load = () => listTemplates().then(setList).catch(() => setList(null));
  useEffect(() => { load(); }, [account?.admin]);
  const box = useRef<HTMLElement>(null), shown = useRef(false);
  useEffect(() => {
    if (!show || shown.current || !box.current) return;
    shown.current = true;
    box.current.scrollIntoView({block:"start", behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  }, [show, list]);
  if (!list?.length) return null;

  const use = async () => {
    if (!open || busy) return;
    setBusy(true); setFailed(false);
    const ok = await onUse(open, nameOf(open));
    setBusy(false);
    if (!ok) setFailed(true);
  };
  return (
    <section ref={box} className="templates" aria-labelledby="tplsTitle">
      <h2 id="tplsTitle">{t("templatesTitle")}</h2>
      <p className="dnote">{t("templatesSub")}</p>
      <ul className="tplgrid">
        {list.map(c => (
          <li key={c.id} className={"tplcard" + (c.published ? "" : " hidden")}>
            <button type="button" className="tplopen" onClick={() => { setOpen(c); setFailed(false); }}>
              <Cover c={c}/>
              <span className="tpltext"><b>{nameOf(c)}</b><small>{facts(c)}</small></span>
            </button>
            {!c.published && <span className="tplbadge">{t("tplHidden")}</span>}
            {account?.admin && <AdminMenu c={c} onChange={load}/>}
          </li>
        ))}
      </ul>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} labelledBy="tplLook" className="sheet3 tpllook">
        {open && <>
          <Cover c={open}/>
          <div className="mhead"><h3 id="tplLook">{nameOf(open)}</h3><small className="dnote">{facts(open)}</small></div>
          {open.description && <p className="tplabout" dir="auto">{open.description}</p>}
          <p className="dnote">{t("tplUseNote")}</p>
          {failed && <p className="projerr" role="alert">{t("tplOpenFailed")}</p>}
          <div className="acts2">
            <button className="btn primary" type="button" data-autofocus disabled={busy} onClick={use}>{t("useTemplate")}</button>
            <button className="btn" type="button" onClick={() => setOpen(null)}>{t("cancel")}</button>
          </div>
        </>}
      </Modal>
    </section>
  );
}
