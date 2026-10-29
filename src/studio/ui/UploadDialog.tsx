// Upload a 3D model: pick a .glb, check its size (measured from the file), name and price it.
// It's saved to the account (model-upload.js) and joins the furniture library.
import { useEffect, useState, type ChangeEvent } from "react";
import { applyCatalog } from "../catalog.js";
import { MAX_BYTES, measureModel, uploadModel } from "../model-upload.js";
import { flashHint } from "../actions.js";
import { notify } from "../store.js";
import { t } from "../i18n.js";
import { settings } from "../settings.js";
import Modal from "./Modal";
import { useAccount } from "./account";

type Status = {text: string, err: boolean};
const EMPTY = {name:"", nameAr:"", price:"", w:"", d:"", h:""};

export default function UploadDialog({open, onClose}: {open: boolean, onClose: () => void}){
  const account = useAccount();
  const [f, setF] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [measured, setMeasured] = useState<{w: number, d: number, h: number, scaled: boolean} | null>(null);
  const [who, setWho] = useState("everyone");
  const [status, setStatus] = useState<Status>({text:"", err:false});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => setF(v => ({...v, [k]:e.target.value}));
  const say = (text: string, err = false) => setStatus({text, err});

  useEffect(() => {
    if (!open) return;
    setF(EMPTY); setFile(null); setMeasured(null); setWho("everyone"); say(""); setBusy(false);
  }, [open]);

  async function choose(chosen: File | undefined){
    setMeasured(null); setFile(chosen || null);
    if (!chosen) return;
    if (chosen.size > MAX_BYTES) return say(t("umErrBig"), true);
    if (!f.name.trim()) setF(v => ({...v, name:chosen.name.replace(/\.(glb|gltf)$/i, "").replace(/[_-]+/g, " ").trim()}));
    say(t("umReading"));
    try {
      const m = await measureModel(chosen);
      setMeasured(m);
      setF(v => ({...v, w:String(Math.round(m.w * 100)), d:String(Math.round(m.d * 100)), h:String(Math.round(m.h * 100))}));
      say(t(m.scaled ? "umScaled" : "umMeasured"));
    } catch { say(t("umErrFile"), true); }
  }

  async function submit(){
    const name = f.name.trim(), price = parseFloat(f.price);
    const w = parseFloat(f.w) / 100, d = parseFloat(f.d) / 100, h = parseFloat(f.h) / 100;
    if (!file || !measured) return say(t(file ? "umErrFile" : "umErrPick"), true);
    if (!name) return say(t("umErrName"), true);
    if (!(price >= 0)) return say(t("umErrPrice"), true);
    if (!(w > 0 && d > 0 && h > 0)) return say(t("umErrSize"), true);
    setBusy(true); say(t("umUploading"));
    try {
      const row = await uploadModel({file, name, nameAr:f.nameAr.trim(), price, currency:settings.currency, w, d, h,
        shared:Boolean(account?.admin) && who === "everyone"});
      applyCatalog([row]); notify();
      onClose();
      flashHint(t("umDone", {name}), 5000);
    } catch (e: any) {
      say(e.message === "offline" ? t("umErrCloud") : t("umErrUpload", {msg:e.message}), true);
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="umTitle">
      <div className="mhead"><h3 id="umTitle">{t("umTitle")}</h3></div>
      <p className="dnote">{t("umNote")}</p>
      <div className="form">
        <label htmlFor="umFile">{t("umFile")}</label>
        <input id="umFile" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={e => choose(e.target.files?.[0])}/>
        <label htmlFor="umName">{t("umName")}</label><input id="umName" type="text" maxLength={80} value={f.name} onChange={set("name")}/>
        <label htmlFor="umNameAr">{t("umNameAr")}</label><input id="umNameAr" type="text" maxLength={80} dir="rtl" value={f.nameAr} onChange={set("nameAr")}/>
        <label htmlFor="umPrice">{t("umPrice", {cur:settings.currency})}</label>
        <input id="umPrice" type="number" min="0" step="1" inputMode="decimal" value={f.price} onChange={set("price")}/>
        <span className="flabel">{t("umSize")}</span>
        <div className="sizerow">
          <input type="number" min="1" step="1" inputMode="decimal" aria-label={t("width")} value={f.w} onChange={set("w")}/>
          <input type="number" min="1" step="1" inputMode="decimal" aria-label={t("depth")} value={f.d} onChange={set("d")}/>
          <input type="number" min="1" step="1" inputMode="decimal" aria-label={t("height")} value={f.h} onChange={set("h")}/>
        </div>
        {/* Admins choose: the built-in catalog everyone sees, or only themselves. */}
        {account?.admin && <>
          <label htmlFor="umWho">{t("umWho")}</label>
          <select id="umWho" value={who} onChange={e => setWho(e.target.value)}>
            <option value="everyone">{t("umEveryone")}</option>
            <option value="me">{t("umOnlyMe")}</option>
          </select>
        </>}
      </div>
      <p className={"mstatus" + (status.err ? " err" : "")} role="status">{status.text}</p>
      <div className="acts2">
        <button className="btn primary" type="button" disabled={busy} onClick={submit}>{t("umUpload")}</button>
        <button className="btn" type="button" onClick={onClose}>{t("cancel")}</button>
      </div>
    </Modal>
  );
}
