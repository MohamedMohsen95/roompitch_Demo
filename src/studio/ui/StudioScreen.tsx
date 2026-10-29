// The studio: header, view bar, selection bar, library, plan + 3D side by side, live estimate, and the dialogs.
import { useCallback, useState } from "react";
import { S } from "../state.js";
import { studioKey } from "../actions.js";
import { t } from "../i18n.js";
import { toCm } from "../geometry.js";
import { useStudio, useKeydown } from "./hooks";
import ViewBar from "./ViewBar";
import Inspector from "./Inspector";
import Library from "./Library";
import PlanView from "./PlanView";
import ThreeView from "./ThreeView";
import Estimate from "./Estimate";
import RenderDialog from "./RenderDialog";
import PdfDialog from "./Proposal";
import UploadDialog from "./UploadDialog";
import AccountDialog, { AccountButton } from "./AccountDialog";
import { SettingsDialog, PricesDialog } from "./SettingsDialogs";
import { useAccount } from "./account";

type DialogId = "render" | "settings" | "prices" | "pdf" | "upload" | "account" | null;

const EST_KEY = "rp_est_closed";
const loadEstClosed = () => { try { return localStorage.getItem(EST_KEY) === "1"; } catch { return false; } };

type Props = {onProjects: () => void, onRoomSetup: () => void, onLang: () => void, onFlat?: (() => void) | null};

export default function StudioScreen({onProjects, onRoomSetup, onLang, onFlat}: Props){
  useStudio();
  const account = useAccount();
  const [dialog, setDialog] = useState<DialogId>(null);
  const [accountWhy, setAccountWhy] = useState<string | undefined>();
  const [estClosed, setEstClosed] = useState(loadEstClosed);
  const close = useCallback(() => setDialog(null), []);

  // Shortcuts act on the room, never while a dialog is open (the dialog takes Escape itself).
  useKeydown(useCallback((e: KeyboardEvent) => { if (!dialog) studioKey(e); }, [dialog]));

  const toggleEst = (v: boolean) => {
    setEstClosed(v);
    try { localStorage.setItem(EST_KEY, v ? "1" : "0"); } catch { /* private window: lasts until reload */ }
  };
  const openAccount = (why?: string) => { setAccountWhy(why); setDialog("account"); };
  const openUpload = () => account?.email ? setDialog("upload") : openAccount(t("accNeedForUpload"));

  return (
    <div className="wrap">
      <header className="bar">
        <button className="btn backbtn" type="button" onClick={onProjects}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>{t("myProjects")}</span>
        </button>
        <div className="brand"><strong>RoomPitch</strong><span className="tag">{t("tag")}</span></div>
        <div className="dims">
          <span className="roomsize" dir="ltr">{toCm(S.L)} × {toCm(S.W)} × {toCm(S.H)} {t("cm")}</span>
          {onFlat
            ? <button className="btn" type="button" onClick={onFlat}>{t("flatBtn")}</button>
            : <button className="btn" type="button" onClick={onRoomSetup}>{t("roomSetup")}</button>}
        </div>
        <div className="tools">
          <button className="btn langbtn" type="button" onClick={onLang}>{t("langBtn")}</button>
          <button className="btn" type="button" onClick={() => setDialog("settings")}>{t("settings")}</button>
          <button className="btn" type="button" onClick={() => setDialog("prices")}>{t("priceList")}</button>
          <button className="btn" type="button" onClick={() => setDialog("pdf")}>{t("exportPdf")}</button>
          <AccountButton onOpen={() => openAccount()}/>
        </div>
        <button className="btn primary" type="button" onClick={() => setDialog("render")}>{t("render")}</button>
      </header>

      <ViewBar/>
      <Inspector/>

      <main className={"app" + (estClosed ? " est-closed" : "")}>
        <Library onUpload={openUpload}/>
        <section className="work">
          <PlanView/>
          <ThreeView/>
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
