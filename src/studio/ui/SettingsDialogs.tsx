// Studio settings (office details, logo, currency, fee, VAT) and the full price list.
// Both are saved in this browser (settings.js) and used by the estimate and the PDF.
import { useEffect, useRef, useState } from "react";
import { WALL_MATS, FLOOR_MATS, FURN } from "../catalog.js";
import { t, nameOf } from "../i18n.js";
import { settings, saveSettings, CURRENCIES, priceOf, setPrice, resetPrices } from "../settings.js";
import { swatchURL } from "../textures.js";
import { notify } from "../store.js";
import Modal from "./Modal";
import NumField from "./NumField";

type DialogProps = {open: boolean, onClose: () => void};

// Shrink the logo so it fits comfortably in localStorage (PNG keeps transparency).
function readLogo(file: File): Promise<string>{
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

export function SettingsDialog({open, onClose}: DialogProps){
  const [, redraw] = useState(0);
  const changed = () => { saveSettings(); redraw(n => n + 1); notify(); };
  const st = settings.studio;
  const text = (key: "name" | "designer" | "phone" | "email", label: string, type = "text", auto = "", dir?: string) => <>
    <label htmlFor={"set-" + key}>{t(label)}</label>
    <input id={"set-" + key} type={type} autoComplete={auto} dir={dir} value={st[key]} onChange={e => { st[key] = e.target.value; changed(); }}/>
  </>;
  const pct = (key: "feePct" | "vatPct", label: string) => <>
    <label htmlFor={"set-" + key}>{t(label)}</label>
    <NumField id={"set-" + key} min="0" max="100" step="0.5" inputMode="decimal" value={settings[key]}
      onCommit={(v, el) => { settings[key] = Math.min(100, Math.max(0, parseFloat(v) || 0)); el.value = String(settings[key]); changed(); }}/>
  </>;
  return (
    <Modal open={open} onClose={onClose} labelledBy="setTitle">
      <div className="mhead"><h3 id="setTitle">{t("setTitle")}</h3></div>
      <p className="dnote">{t("setNote")}</p>
      <div className="form">
        {text("name", "studioName", "text", "organization")}
        {text("designer", "designer", "text", "name")}
        {text("phone", "phone", "tel", "tel", "ltr")}
        {text("email", "email", "email", "email", "ltr")}
        <span className="flabel">{t("logo")}</span>
        <div className="logorow">
          <div className="logobox">{st.logo ? <img src={st.logo} alt=""/> : <span>{t("noLogo")}</span>}</div>
          <label className="btn filebtn"><span>{t("uploadLogo")}</span>
            <input type="file" accept="image/*" onChange={async e => {
              const file = e.target.files?.[0]; e.target.value = "";
              if (!file) return;
              try { st.logo = await readLogo(file); changed(); } catch { /* not an image */ }
            }}/>
          </label>
          {st.logo && <button className="btn" type="button" onClick={() => { st.logo = ""; changed(); }}>{t("removeLogo")}</button>}
        </div>
        <label htmlFor="set-currency">{t("currency")}</label>
        <select id="set-currency" value={settings.currency} onChange={e => { settings.currency = e.target.value; changed(); }}>
          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
        </select>
        {pct("feePct", "feePct")}
        {pct("vatPct", "vatPct")}
      </div>
      <div className="acts2"><button className="btn primary" type="button" onClick={onClose}>{t("close")}</button></div>
    </Modal>
  );
}

function PriceGroup({title, list, swatch}: {title: string, list: any[], swatch: boolean}){
  return <>
    <h4>{title}</h4>
    <div className="plist">
      {list.map(o => (
        <label className="prow" key={o.id}>
          <span className="psw" style={swatch ? {backgroundImage:`url(${swatchURL(o)})`} : {background:o.c}}/>
          <span className="pname" title={nameOf(o)}>{nameOf(o)}</span>
          <NumField min="0" step="1" inputMode="decimal" value={priceOf(o.id)}
            onCommit={(v, el) => { setPrice(o.id, v); el.value = String(priceOf(o.id)); notify(); }}/>
        </label>
      ))}
    </div>
  </>;
}

export function PricesDialog({open, onClose}: DialogProps){
  // Two clicks to reset, since the page can't show a confirm() dialog everywhere.
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const reset = () => {
    if (!armed){ setArmed(true); timer.current = setTimeout(() => setArmed(false), 4000); return; }
    clearTimeout(timer.current); setArmed(false);
    resetPrices(); notify();
  };
  return (
    <Modal open={open} onClose={onClose} labelledBy="pricesTitle" className="sheet3 wide">
      <div className="mhead"><h3 id="pricesTitle">{t("pricesTitle")}</h3><span className="mstatus">{settings.currency}</span></div>
      <p className="dnote">{t("pricesNote")}</p>
      <div id="priceBody">
        <PriceGroup title={t("wallsPerM2")} list={WALL_MATS.filter(m => m.price)} swatch/>
        <PriceGroup title={t("floorsPerM2")} list={FLOOR_MATS.filter(m => m.price)} swatch/>
        <PriceGroup title={t("furnPerPiece")} list={FURN} swatch={false}/>
      </div>
      <div className="acts2">
        <button className="btn primary" type="button" onClick={onClose}>{t("close")}</button>
        <button className="btn" type="button" onClick={reset}>{t(armed ? "resetConfirm" : "resetPrices")}</button>
      </div>
    </Modal>
  );
}
