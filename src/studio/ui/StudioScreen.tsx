// The studio: the top bar (TopBar.tsx), and below it
// the selection toolbar across the whole width, and under it the library, the plan and 3D views, and the live
// estimate (which folds sideways into a rail).
import { useCallback, useEffect, useState } from "react";
import { studioKey } from "../actions.js";
import { nudgeKeyUp, nudgeStop } from "../nudge.js";
import { walkKeyUp, walkStop } from "../three/walk.js";
import { t } from "../i18n.js";
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
import { useAccount } from "./account";
import TopBar from "./TopBar";
import type { ViewId } from "./ViewMax";

type DialogId = "render" | "settings" | "prices" | "pdf" | "upload" | "account" | null;

const EST_KEY = "rp_est_closed";
const loadEstClosed = () => { try { return localStorage.getItem(EST_KEY) === "1"; } catch { return false; } };
const MAX_KEY = "rp_view_max";
const loadMax = (): ViewId | null => { try { const v = localStorage.getItem(MAX_KEY); return v === "plan" || v === "3d" ? v : null; } catch { return null; } };

type Props = {onProjects: () => void, onTemplates: () => void, onRoomSetup: () => void, onLang: () => void};

export default function StudioScreen({onProjects, onTemplates, onRoomSetup, onLang}: Props){
  useStudio();
  const account = useAccount();
  const [dialog, setDialog] = useState<DialogId>(null);
  const [accountWhy, setAccountWhy] = useState<string | undefined>();
  const [estClosed, setEstClosed] = useState(loadEstClosed);
  const [maxView, setMaxView] = useState(loadMax);
  const close = useCallback(() => setDialog(null), []);

  // Shortcuts act on the room, never while a dialog is open (the dialog takes Escape itself).
  useKeydown(useCallback((e: KeyboardEvent) => { if (!dialog) studioKey(e); }, [dialog]));
  // Arrow-key moves and walking end when the key comes up, or when the window loses focus.
  useEffect(() => {
    const up = (e: KeyboardEvent) => { nudgeKeyUp(e); walkKeyUp(e); }, blur = () => { nudgeStop(); walkStop(); };
    window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

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

  return (
    <div className="studio">
      <TopBar account={account} onProjects={onProjects} onTemplates={onTemplates} onRoomSetup={onRoomSetup} onLang={onLang}
        onDialog={setDialog} onAccount={() => openAccount()}/>

      <main className={"workspace" + (estClosed ? " est-closed" : "")}>
        <Inspector/>
        <Library onUpload={openUpload}/>
        <section className={"views" + (maxView ? " max-" + maxView : "")}>
          <PlanView max={maxView} onMax={toggleMax} onRoomSetup={onRoomSetup}/>
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
