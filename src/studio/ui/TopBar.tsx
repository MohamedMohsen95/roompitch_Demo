// The studio's top bar, in three parts the way most editors have it:
//   where you are   the mark (home: the projects), Projects / the room's name (its menu: rename, room setup...),
//                   whether it's saved, undo and redo
//   what you make   Export PDF and Photoreal render
//   you and the app the account menu: studio details, price list, language, account, sign out
// Narrower windows drop the "Projects /" crumb, the "Saved" text and Export PDF (it moves into the room menu).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { S } from "../state.js";
import { t, getLang } from "../i18n.js";
import { toCm } from "../geometry.js";
import { listProjects, renameProject, saveStatus, onSaveStatus } from "../cloud-store.js";
import { canUndo, canRedo, undo, redo, onHistory } from "../history.js";
import { signOut } from "../auth.js";
import { useMedia } from "./hooks";
import Menu, { MenuItem } from "./Menu";
import type { Account } from "./account";
import { Mark, IconChevron, IconEdit, IconRoom, IconFile, IconFolder, IconSettings, IconTag, IconUser, IconLogout,
  IconUndo, IconRedo, IconSparkle, IconCloudCheck, IconCloudOff } from "./Icons";

export type BarDialog = "render" | "settings" | "prices" | "pdf";
type Props = {
  account: Account,
  onProjects: () => void, onRoomSetup: () => void, onLang: () => void,
  onDialog: (d: BarDialog) => void, onAccount: () => void
};

const WIDE = "(min-width:1100px)";
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const KEY = MAC ? "⌘" : "Ctrl+";

// The room's name; it can be renamed when it's a cloud project.
function RoomName({wide, onProjects, onRoomSetup, onPdf}: {wide: boolean, onProjects: () => void, onRoomSetup: () => void, onPdf: () => void}){
  const [project, setProject] = useState<{id: string, name: string} | null>(null);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null), cancelled = useRef(false);
  useEffect(() => {
    let live = true;
    listProjects().then(ps => { const p = ps?.find(p => p.current); if (live && p) setProject({id:p.id, name:p.name}); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => { if (editing){ cancelled.current = false; input.current?.select(); } }, [editing]);

  const name = project?.name || t("roomTitle");
  const commit = () => {
    const v = input.current?.value.trim() || "";
    setEditing(false);
    if (cancelled.current) return;   // Escape: leaving the field mustn't save it
    if (!project || !v || v === project.name) return;
    const before = project.name;
    setProject({...project, name:v});
    renameProject(project.id, v).then(ok => { if (!ok) setProject(p => p && {...p, name:before}); });
  };

  if (editing) return (
    <input ref={input} className="tb-rename" defaultValue={name} aria-label={t("rename")} maxLength={80}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape"){ e.stopPropagation(); cancelled.current = true; setEditing(false); } }}/>
  );
  return (
    <Menu label={t("roomMenu")} align="start" className="tb-namebtn"
      face={<><span className="tb-name">{name}</span><IconChevron/></>}>
      {done => <>
        {project && <MenuItem icon={<IconEdit/>} label={t("rename")} onClick={() => { done(); setEditing(true); }}/>}
        <MenuItem icon={<IconRoom/>} label={t("roomSetup")} hint={`${toCm(S.L)} × ${toCm(S.W)} ${t("cm")}`} onClick={() => { done(); onRoomSetup(); }}/>
        {!wide && <MenuItem icon={<IconFile/>} label={t("exportPdf")} onClick={() => { done(); onPdf(); }}/>}
        <div className="menusep" role="separator"/>
        <MenuItem icon={<IconFolder/>} label={t("allProjects")} onClick={() => { done(); onProjects(); }}/>
      </>}
    </Menu>
  );
}

// "Saved", "Saving…", only in this browser, or not saved to the cloud. Narrow windows show only a problem.
function SaveState({wide}: {wide: boolean}){
  const s = useSyncExternalStore(onSaveStatus, saveStatus);
  const bad = s === "failed";
  if (!wide && !bad) return null;
  const label = t({saved:"saved", saving:"saving", local:"savedLocal", failed:"saveFailed"}[s] || "saved");
  return (
    <span className={"tb-saved" + (bad ? " bad" : "") + (s === "saving" ? " busy" : "")} role="status" title={bad ? t("saveFailedTip") : undefined}>
      {bad ? <IconCloudOff/> : <IconCloudCheck/>}{wide && <span>{label}</span>}
    </span>
  );
}

function UndoRedo(){
  useSyncExternalStore(onHistory, () => `${canUndo()}${canRedo()}`);
  return <>
    <button type="button" className="btn ghost icon" disabled={!canUndo()} onClick={() => undo()}
      title={`${t("undo")} (${KEY}Z)`} aria-label={t("undo")}><IconUndo/></button>
    <button type="button" className="btn ghost icon" disabled={!canRedo()} onClick={() => redo()}
      title={`${t("redo")} (${KEY}${MAC ? "⇧Z" : "Y"})`} aria-label={t("redo")}><IconRedo/></button>
  </>;
}

function AccountMenu({account, onDialog, onAccount, onLang}: {account: Account, onDialog: Props["onDialog"], onAccount: () => void, onLang: () => void}){
  const email = account?.email;
  const face = email ? <><span className="avatar" aria-hidden="true">{email[0]}</span><IconChevron/></>
    : account ? <><IconUser/><span>{t("signIn")}</span><IconChevron/></>
    : <><IconSettings/><IconChevron/></>;
  const lang = getLang();
  return (
    <Menu label={t("accountMenu")} className={"btn ghost tb-acct" + (email ? " has-avatar" : "")} face={face}>
      {done => <>
        {email && <div className="menuhead"><b>{email}</b><small>{t(account!.admin ? "accRoleAdmin" : "accRoleDesigner")}</small></div>}
        {account && !email && <MenuItem icon={<IconUser/>} label={t("signIn")} onClick={() => { done(); onAccount(); }}/>}
        {account && !email && <div className="menusep" role="separator"/>}
        <MenuItem icon={<IconSettings/>} label={t("studioDetails")} onClick={() => { done(); onDialog("settings"); }}/>
        <MenuItem icon={<IconTag/>} label={t("priceList")} onClick={() => { done(); onDialog("prices"); }}/>
        <div className="menusep" role="separator"/>
        <div className="menulabel">{t("language")}</div>
        <div className="menulangs" role="group" aria-label={t("language")}>
          {(["en", "ar"] as const).map(l => (
            <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => { done(); if (lang !== l) onLang(); }}>
              {l === "en" ? "English" : "عربي"}
            </button>
          ))}
        </div>
        {email && <>
          <div className="menusep" role="separator"/>
          <MenuItem icon={<IconUser/>} label={t("account")} onClick={() => { done(); onAccount(); }}/>
          <MenuItem icon={<IconLogout/>} label={t("signOut")} onClick={() => { done(); signOut().catch(() => onAccount()); }}/>
        </>}
      </>}
    </Menu>
  );
}

export default function TopBar({account, onProjects, onRoomSetup, onLang, onDialog, onAccount}: Props){
  const wide = useMedia(WIDE);
  return (
    <header className="topbar">
      <div className="tb-start">
        <button type="button" className="tb-home" onClick={onProjects} title={t("allProjects")} aria-label={t("allProjects")}><Mark/></button>
        <nav className="tb-crumb" aria-label={t("whereYouAre")}>
          {wide && <><button type="button" className="tb-crumblink" onClick={onProjects}>{t("myProjects")}</button><span className="tb-sep" aria-hidden="true">/</span></>}
          <RoomName wide={wide} onProjects={onProjects} onRoomSetup={onRoomSetup} onPdf={() => onDialog("pdf")}/>
        </nav>
        <SaveState wide={wide}/>
        <span className="tb-div" aria-hidden="true"/>
        <UndoRedo/>
      </div>

      <div className="tb-end">
        {wide && <button className="btn" type="button" onClick={() => onDialog("pdf")}><IconFile/><span>{t("exportPdf")}</span></button>}
        <button className="btn primary tb-render" type="button" onClick={() => onDialog("render")}>
          <IconSparkle/><span className="tb-render-long">{t("render")}</span><span className="tb-render-short">{t("renderShort")}</span>
        </button>
        <span className="tb-div" aria-hidden="true"/>
        <AccountMenu account={account} onDialog={onDialog} onAccount={onAccount} onLang={onLang}/>
      </div>
    </header>
  );
}
