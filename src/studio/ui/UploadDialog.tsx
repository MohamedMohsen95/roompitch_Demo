// Upload a 3D model: pick a .glb, check its size (measured from the file), name and price it.
// Or start from a photo of the piece, in two steps: the photo becomes a model (photo-3d.js, Tripo on fal.ai), then
// it's named and priced the same way.
// It's saved to the account (model-upload.js) and joins the furniture library.
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { photo3dInfo, photoTo3D } from "../photo-3d.js";
import { applyCatalog, FU } from "../catalog.js";
import { requestThumb } from "../thumbs.js";
import { MAX_BYTES, measureModel, uploadModel } from "../model-upload.js";
import { flashHint } from "../actions.js";
import { notify } from "../store.js";
import { t } from "../i18n.js";
import { settings } from "../settings.js";
import Modal from "./Modal";
import { IconUpload } from "./Icons";
import { useAccount } from "./account";

type Status = {text: string, err: boolean};

// A file input in the app's look: a box to click or drop a file on, showing what's chosen (or a picture of it).
function FilePick({id, accept, file, image, prompt, hint, disabled, large, onPick}: {
  id: string, accept: string, file: File | null, image?: string, prompt: string, hint: string,
  disabled?: boolean, large?: boolean, onPick: (f: File | undefined) => void
}){
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (!disabled) onPick(e.dataTransfer.files?.[0]); };
  return (
    <label htmlFor={id} className={"filepick" + (large ? " large" : "") + (over ? " over" : "") + (disabled ? " off" : "") + (image ? " has-img" : "")}
      onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <input id={id} type="file" accept={accept} disabled={disabled} onChange={e => { onPick(e.target.files?.[0]); e.target.value = ""; }}/>
      {image ? <img src={image} alt=""/> : <span className="fp-icon"><IconUpload/></span>}
      <span className="fp-text">
        <b>{file ? file.name : prompt}</b>
        <small>{file ? t("umChange") : hint}</small>
      </span>
    </label>
  );
}
const EMPTY = {name:"", nameAr:"", price:"", w:"", d:"", h:""};

export default function UploadDialog({open, onClose}: {open: boolean, onClose: () => void}){
  const account = useAccount();
  const [f, setF] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [measured, setMeasured] = useState<{w: number, d: number, h: number, scaled: boolean} | null>(null);
  const [who, setWho] = useState("everyone");
  const [status, setStatus] = useState<Status>({text:"", err:false});
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"file" | "photo">("file");
  const [photoOn, setPhotoOn] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [shots, setShots] = useState<{photo: string, model?: string} | null>(null);
  const [making, setMaking] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);   // from a photo: 1 makes the model, 2 names and prices it
  const stop = useRef<AbortController | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => setF(v => ({...v, [k]:e.target.value}));
  const say = (text: string, err = false) => setStatus({text, err});

  useEffect(() => {
    if (!open) return;
    setF(EMPTY); setFile(null); setMeasured(null); setWho("everyone"); say(""); setBusy(false);
    setSource("file"); setPhoto(null); setShots(null); setMaking(false); setStep(1);
    photo3dInfo().then(i => { setPhotoOn(i.enabled); setCost(i.cost); });
    return () => stop.current?.abort();
  }, [open]);
  useEffect(() => () => { if (shots) URL.revokeObjectURL(shots.photo); }, [shots?.photo]);

  function pickSource(v: "file" | "photo"){
    if (making) return;
    setSource(v); setFile(null); setMeasured(null); setPhoto(null); setShots(null); setStep(1); say("");
  }

  function choosePhoto(chosen: File | undefined){
    if (chosen && !/^image\/(jpeg|png|webp)$/.test(chosen.type)) return say(t("umErrPhotoType"), true);
    setFile(null); setMeasured(null); setPhoto(chosen || null); say("");
    setShots(chosen ? {photo:URL.createObjectURL(chosen)} : null);
    if (chosen && !f.name.trim()) setF(v => ({...v, name:chosen.name.replace(/\.\w+$/, "").replace(/[_-]+/g, " ").trim()}));
  }

  async function make(){
    if (!photo) return say(t("umErrPhoto"), true);
    const ctl = new AbortController(); stop.current = ctl;
    setMaking(true); say(t("umSending"));
    try {
      const out = await photoTo3D(photo, {name:f.name.trim() || "model", signal:ctl.signal, onProgress:p => say(t(p.queued ? "umQueued" : "umMaking", {time:`${Math.floor(p.seconds / 60)}:${String(p.seconds % 60).padStart(2, "0")}`}))});
      if (ctl.signal.aborted) return;
      setShots(v => v && {...v, model:out.preview});
      if (await choose(out.file)) setStep(2);
    } catch (e: any) {
      if (e.name !== "AbortError") say(e.message === "timeout" ? t("umErrSlow") : t("umErrMake", {msg:e.message}), true);
    } finally { if (!ctl.signal.aborted) setMaking(false); }
  }

  // Returns whether the model could be read and measured.
  async function choose(chosen: File | undefined){
    setMeasured(null); setFile(chosen || null);
    if (!chosen) return false;
    if (chosen.size > MAX_BYTES){ say(t("umErrBig"), true); return false; }
    if (!f.name.trim()) setF(v => ({...v, name:chosen.name.replace(/\.(glb|gltf)$/i, "").replace(/[_-]+/g, " ").trim()}));
    say(t("umReading"));
    try {
      const m = await measureModel(chosen);
      setMeasured(m);
      setF(v => ({...v, w:String(Math.round(m.w * 100)), d:String(Math.round(m.d * 100)), h:String(Math.round(m.h * 100))}));
      say(t(m.scaled ? "umScaled" : "umMeasured"));
      return true;
    } catch { say(t("umErrFile"), true); return false; }
  }

  function stopMaking(){
    stop.current?.abort(); setMaking(false); say(t("umStopped"));
  }

  async function submit(){
    const name = f.name.trim(), price = parseFloat(f.price);
    const w = parseFloat(f.w) / 100, d = parseFloat(f.d) / 100, h = parseFloat(f.h) / 100;
    if (!file || !measured) return say(t(file ? "umErrFile" : source === "photo" ? "umErrMakeFirst" : "umErrPick"), true);
    if (!name) return say(t("umErrName"), true);
    if (!(price >= 0)) return say(t("umErrPrice"), true);
    if (!(w > 0 && d > 0 && h > 0)) return say(t("umErrSize"), true);
    setBusy(true); say(t("umUploading"));
    try {
      const row = await uploadModel({file, name, nameAr:f.nameAr.trim(), price, currency:settings.currency, w, d, h,
        shared:Boolean(account?.admin) && who === "everyone"});
      applyCatalog([row]); notify();
      requestThumb(FU[row.id]);   // its library picture, saved with it
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
      <div className="seg um-src" role="radiogroup" aria-label={t("umFrom")}>
        {([["file", "umFromFile"], ["photo", "umFromPhoto"]] as const).map(([v, key]) => (
          <label key={v}><input type="radio" name="umSrc" value={v} checked={source === v} disabled={making || (v === "photo" && !photoOn)}
            onChange={() => pickSource(v)}/><span>{t(key)}</span></label>
        ))}
      </div>
      {source === "photo" && <p className="um-step">{t("umStep", {n:step})} · {t(step === 1 ? "umStep1" : "umStep2")}</p>}

      {source === "photo" && step === 1 ? <>
        <p className="dnote">{t(cost == null ? "umPhotoNote" : "umPhotoNoteCost", {cost:cost?.toFixed(2)})}</p>
        <FilePick id="umPhoto" large accept="image/jpeg,image/png,image/webp" file={photo} image={shots?.photo} disabled={making}
          prompt={t("umDropPhoto")} hint={t("umDropPhotoHint")} onPick={choosePhoto}/>
        <p className={"mstatus" + (status.err ? " err" : "")} role="status">{status.text}</p>
        <div className="acts2">
          {file && measured && !making
            ? <><button className="btn primary" type="button" onClick={() => { setStep(2); say(""); }}>{t("umNext")}</button>
                <button className="btn" type="button" onClick={make}>{t("umMakeAgain")}</button></>
            : <button className="btn primary" type="button" disabled={!photo || making} onClick={make}>{t("umMake")}</button>}
          {making
            ? <button className="btn" type="button" onClick={stopMaking}>{t("umStop")}</button>
            : <button className="btn" type="button" onClick={onClose}>{t("cancel")}</button>}
        </div>
      </> : <>
        {source === "photo"
          ? <div className="um-made">
              <div className="um-shots">
                {shots && <img src={shots.photo} alt={t("umPhoto")}/>}
                {shots?.model && <img src={shots.model} alt={t("umModelShot")}/>}
              </div>
              <p className="dnote">{t("umMadeNote")}</p>
            </div>
          : <>
              <p className="dnote">{t(photoOn ? "umNote" : "umNoteNoPhoto")}</p>
              <FilePick id="umFile" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" file={file}
                prompt={t("umDropModel")} hint={t("umDropModelHint")} onPick={choose}/>
            </>}
        <div className="form">
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
          {source === "photo"
            ? <button className="btn" type="button" disabled={busy} onClick={() => { setStep(1); say(""); }}>{t("umBack")}</button>
            : <button className="btn" type="button" onClick={onClose}>{t("cancel")}</button>}
        </div>
      </>}
    </Modal>
  );
}
