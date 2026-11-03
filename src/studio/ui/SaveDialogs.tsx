// The save options beside "Saved" (the room saves itself; these save it as something else):
//   Save a copy        the room becomes a new project, and the one worked on from now on
//   Save as template   admins: a room anyone can start from (templates.js), new or over the one it came from
import { useEffect, useState } from "react";
import { S } from "../state.js";
import { t, nameOf } from "../i18n.js";
import { roomData, saveRoom } from "../room-store.js";
import { saveCopy } from "../cloud-store.js";
import { saveTemplate, privatePieces, templateName } from "../templates.js";
import { snapshot } from "../render-ai.js";
import { flashHint } from "../actions.js";
import Modal from "./Modal";

type Project = {id: string, name: string};

export function SaveCopyDialog({open, project, onClose, onSaved}: {open: boolean, project: Project | null, onClose: () => void, onSaved: (p: Project) => void}){
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => { if (open){ setName(t("copyName", {name:project?.name || t("roomTitle")})); setBusy(false); setFailed(false); } }, [open]);
  const save = async () => {
    const v = name.trim();
    if (!v || busy) return;
    setBusy(true); setFailed(false);
    const id = await saveCopy(v, roomData());
    setBusy(false);
    if (!id) return setFailed(true);
    onSaved({id, name:v}); onClose(); flashHint(t("copySaved"), 4000);
  };
  return (
    <Modal open={open} onClose={onClose} labelledBy="copyTitle">
      <div className="mhead"><h3 id="copyTitle">{t("saveCopy")}</h3></div>
      <p className="dnote">{t("saveCopyNote")}</p>
      <form className="form" onSubmit={e => { e.preventDefault(); save(); }}>
        <label htmlFor="copy-name">{t("projName")}</label>
        <input id="copy-name" data-autofocus value={name} maxLength={80} onChange={e => setName(e.target.value)} onFocus={e => e.currentTarget.select()}/>
      </form>
      {failed && <p className="projerr" role="alert">{t("saveCopyFailed")}</p>}
      <div className="acts2">
        <button className="btn primary" type="button" disabled={busy || !name.trim()} onClick={save}>{busy ? t("saving") : t("saveCopy")}</button>
        <button className="btn" type="button" onClick={onClose}>{t("cancel")}</button>
      </div>
    </Modal>
  );
}

export function TemplateDialog({open, onClose}: {open: boolean, onClose: () => void}){
  const [cover, setCover] = useState<string | null>(null);
  const [name, setName] = useState(""), [nameAr, setNameAr] = useState(""), [about, setAbout] = useState("");
  const [from, setFrom] = useState<string | null>(null);         // the name of the template this room came from
  const [over, setOver] = useState(false);                       // update that one instead of adding a new one
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCover(snapshot(960).small); setBusy(false); setFailed(false); setFrom(null); setOver(false);
    setName(""); setNameAr(""); setAbout("");
    let live = true;
    templateName(S.template).then(n => { if (live && n){ setFrom(n); setOver(true); setName(n); } });
    return () => { live = false; };
  }, [open]);
  const left = open ? privatePieces(S) : [];
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setFailed(false);
    const room = roomData();
    room.items = room.items.filter(it => !left.some(f => f.id === it.type));
    const res = await saveTemplate({id:over ? S.template : null, name:name.trim(), nameAr:nameAr.trim(), description:about.trim(), room, cover});
    setBusy(false);
    if (!res) return setFailed(true);
    S.template = res.id; saveRoom();   // this room can update it from now on
    onClose();
    // Saved without its cover: the gallery draws the plan instead; updating it again tries the cover again.
    flashHint(res.coverOk ? t(over ? "templateUpdated" : "templateSaved") : t("tplNoCover"), res.coverOk ? 5000 : 9000);
  };
  return (
    <Modal open={open} onClose={onClose} labelledBy="tplTitle">
      <div className="mhead"><h3 id="tplTitle">{t("saveTemplate")}</h3></div>
      <p className="dnote">{t("saveTemplateNote")}</p>
      {cover && <img className="tplcover" src={cover} alt={t("tplCoverAlt")}/>}
      {from && <div className="tplmode" role="radiogroup" aria-label={t("saveTemplate")}>
        <label><input type="radio" checked={over} onChange={() => { setOver(true); setName(from); }}/><span>{t("tplUpdate", {name:from})}</span></label>
        <label><input type="radio" checked={!over} onChange={() => { setOver(false); setName(""); }}/><span>{t("tplNew")}</span></label>
      </div>}
      <form className="form" onSubmit={e => { e.preventDefault(); save(); }}>
        <label htmlFor="tpl-name">{t("tplName")}</label>
        <input id="tpl-name" data-autofocus value={name} maxLength={80} dir="auto" onChange={e => setName(e.target.value)}/>
        <label htmlFor="tpl-name-ar">{t("tplNameAr")}</label>
        <input id="tpl-name-ar" value={nameAr} maxLength={80} dir="rtl" lang="ar" onChange={e => setNameAr(e.target.value)}/>
        <label htmlFor="tpl-about">{t("tplAbout")}</label>
        <textarea id="tpl-about" rows={2} value={about} maxLength={300} dir="auto" onChange={e => setAbout(e.target.value)}/>
      </form>
      {left.length > 0 && <p className="tplwarn" role="note">{t("tplPrivate", {names:[...new Set(left.map(f => nameOf(f)))].join(", ")})}</p>}
      {failed && <p className="projerr" role="alert">{t("tplFailed")}</p>}
      <div className="acts2">
        <button className="btn primary" type="button" disabled={busy || !name.trim()} onClick={save}>{busy ? t("saving") : t(over ? "tplUpdateBtn" : "saveTemplate")}</button>
        <button className="btn" type="button" onClick={onClose}>{t("cancel")}</button>
      </div>
    </Modal>
  );
}
