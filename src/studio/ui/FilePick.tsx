// A file input in the app's look: a box to click or drop a file on, showing what's chosen (or a picture of it),
// with an × to clear the choice when onClear is given (on the picture's corner; the dashed frame goes once there is one).
// `invalid`: red, and each new count shakes it (two names for one animation, so the next count starts it again).
import { useState, type DragEvent, type ReactNode } from "react";
import { t } from "../i18n.js";
import { IconClose, IconUpload } from "./Icons";

export default function FilePick({id, accept, file, image, prompt, hint, disabled, large, children, onPick, onClear, invalid}: {
  id: string, accept: string, file: File | null, image?: string | null, prompt: string, hint: string,
  disabled?: boolean, large?: boolean, children?: ReactNode, onPick: (f: File | undefined) => void, onClear?: () => void, invalid?: number
}){
  const [over, setOver] = useState(false);
  const clear = onClear && !disabled && (
    <button type="button" className="fp-clear" aria-label={t("fpClear")} title={t("fpClear")}
      onClick={e => { e.preventDefault(); e.stopPropagation(); onClear(); }}><IconClose/></button>
  );
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (!disabled) onPick(e.dataTransfer.files?.[0]); };
  return (
    <label htmlFor={id} className={"filepick" + (large ? " large" : "") + (over ? " over" : "") + (disabled ? " off" : "") + (image ? " has-img" : "") + (invalid ? " invalid shake" + (invalid % 2) : "")}
      onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <input id={id} type="file" accept={accept} disabled={disabled} onChange={e => { onPick(e.target.files?.[0]); e.target.value = ""; }}/>
      {image ? <span className="fp-img"><img src={image} alt=""/>{file && clear}</span> : <span className="fp-icon"><IconUpload/></span>}
      <span className="fp-text">
        <b>{file ? file.name : prompt}</b>
        <small>{file ? t("umChange") : hint}</small>
      </span>
      {children}
      {file && !image && clear}
    </label>
  );
}
