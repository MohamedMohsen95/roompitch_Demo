// The studio: a quiet top bar (back to projects, the room, then its actions), and below it
// the selection toolbar across the whole width, and under it the library, the plan and 3D views, and the live
// estimate (which folds sideways into a rail).
import { useCallback, useEffect, useState } from "react";
import { studioKey } from "../actions.js";
import { t } from "../i18n.js";
import { listProjects } from "../cloud-store.js";
import { useStudio, useKeydown } from "./hooks";
import Inspector from "./Inspector";
import Library from "./Library";
import PlanView from "./PlanView";
import ThreeView from "./ThreeView";
import Estimate from "./Estimate";
import RenderDialog from "./RenderDialog";
import PdfDialog from "./Proposal";
import UploadDialog from "./UploadDialog";
import AccountDialog from "./AccountDialog";
import { SettingsDialog, PricesDialog } from "./SettingsDialogs";
import { useAccount, type Account } from "./account";
import Menu, { MenuItem } from "./Menu";
import type { ViewId } from "./ViewMax";
import { IconBack, IconRoom, IconSettings, IconTag, IconGlobe, IconUser, IconFile, IconMore } from "./Icons";

type DialogId = "render" | "settings" | "prices" | "pdf" | "upload" | "account" | null;

const EST_KEY = "rp_est_closed";
const loadEstClosed = () => { try { return localStorage.getItem(EST_KEY) === "1"; } catch { return false; } };
const MAX_KEY = "rp_view_max";
const loadMax = (): ViewId | null => { try { const v = localStorage.getItem(MAX_KEY); return v === "plan" || v === "3d" ? v : null; } catch { return null; } };

// The product's mark: a room in plan with its door swing, in the accent.
export const Mark = () => (
  <svg className="mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <rect x="1" y="1" width="20" height="20" rx="5" fill="var(--accent)"/>
    <path d="M6 16V6h10v10h-4" fill="none" stroke="var(--accent-ink)" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M12 16a4 4 0 0 0-4-4" fill="none" stroke="var(--accent-ink)" strokeWidth="1.2" strokeDasharray="1.5 1.5"/>
  </svg>
);

// Signed in: the first letter of the email in a disc. Visiting anonymously: "Sign in".
export function AccountFace({account}: {account: Account}){
  if (account?.email) return <span className="avatar" aria-hidden="true">{account.email[0]}</span>;
  return <><IconUser/><span>{t("signIn")}</span></>;
}

type Props = {onProjects: () => void, onRoomSetup: () => void, onLang: () => void};

export default function StudioScreen({onProjects, onRoomSetup, onLang}: Props){
  useStudio();
  const account = useAccount();
  const [dialog, setDialog] = useState<DialogId>(null);
  const [accountWhy, setAccountWhy] = useState<string | undefined>();
  const [estClosed, setEstClosed] = useState(loadEstClosed);
  const [maxView, setMaxView] = useState(loadMax);
  const [projectName, setProjectName] = useState<string | null>(null);
  const close = useCallback(() => setDialog(null), []);

  // The cloud project's name, when there is one (offline, the room is just "Room").
  useEffect(() => {
    let live = true;
    listProjects().then(ps => { if (live) setProjectName(ps?.find(p => p.current)?.name || null); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Shortcuts act on the room, never while a dialog is open (the dialog takes Escape itself).
  useKeydown(useCallback((e: KeyboardEvent) => { if (!dialog) studioKey(e); }, [dialog]));

  const toggleEst = (v: boolean) => {
    setEstClosed(v);
    try { localStorage.setItem(EST_KEY, v ? "1" : "0"); } catch { /* private window: lasts until reload */ }
  };
  const toggleMax = (v: ViewId | null) => {
    setMaxView(v);
    try { if (v) localStorage.setItem(MAX_KEY, v); else localStorage.removeItem(MAX_KEY); } catch { /* private window */ }
  };
  const openAccount = (why?: string) => { setAccountWhy(why); setDialog("account"); };
  const openUpload = () => account?.email ? setDialog("upload") : openAccount(t("accNeedForUpload"));
  const accountLabel = account?.email || t("signIn");

  return (
    <div className="studio">
      <header className="topbar">
        <div className="tb-start">
          <button className="btn ghost" type="button" onClick={onProjects}><IconBack/><span className="tb-wide">{t("myProjects")}</span></button>
          <span className="tb-div" aria-hidden="true"/>
          <Mark/>
          <h1 className="tb-title"><span className="tb-name">{projectName || t("roomTitle")}</span></h1>
        </div>

        <div className="tb-end">
          <div className="tb-group tb-wide">
            <button className="btn ghost" type="button" onClick={onRoomSetup}><IconRoom/><span>{t("roomSetup")}</span></button>
            <Menu label={t("settings")} className="btn ghost" face={<><IconSettings/><span>{t("settings")}</span></>}>
              {done => <>
                <MenuItem icon={<IconSettings/>} label={t("studioDetails")} onClick={() => { done(); setDialog("settings"); }}/>
                <MenuItem icon={<IconTag/>} label={t("priceList")} onClick={() => { done(); setDialog("prices"); }}/>
              </>}
            </Menu>
            <button className="btn ghost" type="button" onClick={onLang} lang={t("langBtn") === "English" ? "en" : "ar"}><IconGlobe/><span>{t("langBtn")}</span></button>
            {account && <button className="btn ghost acct" type="button" title={accountLabel} aria-label={accountLabel} onClick={() => openAccount()}><AccountFace account={account}/></button>}
          </div>

          {/* Narrow windows: the same actions in one menu. */}
          <Menu label={t("more")} className="btn ghost icon tb-narrow" face={<IconMore/>}>
            {done => <>
              <MenuItem icon={<IconRoom/>} label={t("roomSetup")} onClick={() => { done(); onRoomSetup(); }}/>
              <MenuItem icon={<IconSettings/>} label={t("studioDetails")} onClick={() => { done(); setDialog("settings"); }}/>
              <MenuItem icon={<IconTag/>} label={t("priceList")} onClick={() => { done(); setDialog("prices"); }}/>
              <MenuItem icon={<IconFile/>} label={t("exportPdf")} onClick={() => { done(); setDialog("pdf"); }}/>
              <MenuItem icon={<IconGlobe/>} label={t("langBtn")} onClick={() => { done(); onLang(); }}/>
              {account && <MenuItem icon={<IconUser/>} label={accountLabel} onClick={() => { done(); openAccount(); }}/>}
            </>}
          </Menu>

          <span className="tb-div tb-wide" aria-hidden="true"/>
          <button className="btn tb-wide" type="button" onClick={() => setDialog("pdf")}><IconFile/><span>{t("exportPdf")}</span></button>
          <button className="btn primary" type="button" onClick={() => setDialog("render")}>{t("render")}</button>
        </div>
      </header>

      <main className={"workspace" + (estClosed ? " est-closed" : "")}>
        <Inspector/>
        <Library onUpload={openUpload}/>
        <section className={"views" + (maxView ? " max-" + maxView : "")}>
          <PlanView max={maxView} onMax={toggleMax}/>
          <ThreeView max={maxView} onMax={toggleMax}/>
        </section>
        <Estimate closed={estClosed} onToggle={toggleEst}/>
      </main>

      <RenderDialog open={dialog === "render"} onClose={close}/>
      <SettingsDialog open={dialog === "settings"} onClose={close}/>
      <PricesDialog open={dialog === "prices"} onClose={close}/>
      <PdfDialog open={dialog === "pdf"} onClose={close}/>
      <UploadDialog open={dialog === "upload"} onClose={close}/>
      <AccountDialog open={dialog === "account"} why={accountWhy} onClose={close}/>
    </div>
  );
}
