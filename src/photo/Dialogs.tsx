// The "Price list" and "Studio" dialogs. Both save to this device as you type.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CURRENCIES, DEFAULT_PRICES } from "./data";
import { settings, saveSettings, t, nameOf, unitLabel, priceOf } from "./settings";
import { fileToResizedDataUrl } from "./images";
import NumField from "../studio/ui/NumField";

type DialogProps = {open: boolean, onClose: () => void, onChange: () => void};

// A native <dialog>, opened as a modal while `open` is true. Its content mounts fresh on every open.
function Dlg({open, onClose, children}: {open: boolean, onClose: () => void, children: ReactNode}){
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} className="dlg" onClose={onClose}>{open && <form method="dialog" className="dlg-inner">{children}</form>}</dialog>;
}

const Head = ({title}: {title: string}) => (
  <header className="dlg-head">
    <h3>{title}</h3>
    <button className="ghost" value="close" aria-label="Close">✕</button>
  </header>
);

export function PricesDialog({open, onClose, onChange}: DialogProps){
  const [, redraw] = useState(0);
  const changed = () => { saveSettings(); redraw(n => n + 1); onChange(); };
  const pct = (key: "feePct" | "vatPct") => (
    <label className="field"><span>{t(key)}</span>
      <input type="number" min="0" step="0.5" defaultValue={settings[key]}
        onChange={e => { settings[key] = Math.max(0, parseFloat(e.target.value) || 0); changed(); }}/>
    </label>
  );
  return (
    <Dlg open={open} onClose={onClose}>
      <Head title={t("priceListTitle")}/>
      <p className="small muted">{t("priceListHelp")}</p>
      <div className="grid3">
        <label className="field"><span>{t("currency")}</span>
          <select value={settings.currency} onChange={e => { settings.currency = e.target.value; changed(); }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {pct("feePct")}
        {pct("vatPct")}
      </div>
      <div className="table-wrap tall">
        <table className="lines" id="priceTable">
          <thead><tr><th>{t("item")}</th><th>{t("unit")}</th><th className="num-col">{t("price")}</th></tr></thead>
          <tbody>
            {DEFAULT_PRICES.map(item => (
              <tr key={item.id}>
                <td>{nameOf(item)}</td>
                <td className="unit">{unitLabel(item.unit)}</td>
                <td className="num-col">
                  <NumField min="0" step="1" inputMode="decimal" aria-label={nameOf(item)} value={priceOf(item.id)} onCommit={v => {
                    const price = Math.max(0, parseFloat(v) || 0);
                    const p = settings.prices.find(x => x.id === item.id);
                    if (p) p.price = price; else settings.prices.push({id: item.id, price});
                    settings.pricesEdited = true;
                    changed();
                  }}/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="dlg-foot">
        <button className="ghost" type="button" onClick={() => {
          settings.prices = DEFAULT_PRICES.map(p => ({id: p.id, price: p.price}));
          settings.pricesEdited = false;
          changed();
        }}>{t("resetPrices")}</button>
        <button className="primary" value="close">{t("done")}</button>
      </footer>
    </Dlg>
  );
}

export function StudioDialog({open, onClose, onChange}: DialogProps){
  const [, redraw] = useState(0);
  const changed = () => { saveSettings(); redraw(n => n + 1); onChange(); };
  const s = settings.studio;
  const field = (key: "name" | "designer" | "phone" | "email", label: string, type = "text") => (
    <label className="field"><span>{t(label)}</span>
      <input type={type} value={s[key]} onChange={e => { s[key] = e.target.value; changed(); }}/>
    </label>
  );
  return (
    <Dlg open={open} onClose={onClose}>
      <Head title={t("studioTitle")}/>
      <p className="small muted">{t("studioHelp")}</p>
      <div className="logo-row">
        <div className="logo-preview" id="logoPreview">{s.logo ? <img src={s.logo} alt=""/> : <span>{t("noLogo")}</span>}</div>
        <label className="secondary file-btn">
          <input type="file" accept="image/*" hidden onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            s.logo = (await fileToResizedDataUrl(f, 360, "image/png")).src; changed();
          }}/>
          <span>{t("uploadLogo")}</span>
        </label>
        <button className="ghost" type="button" onClick={() => { s.logo = ""; changed(); }}>{t("remove")}</button>
      </div>
      {field("name", "studioName")}
      <div className="grid2">
        {field("designer", "designer")}
        {field("phone", "phone", "tel")}
      </div>
      {field("email", "email")}
      <label className="field"><span>{t("accessCode")}</span>
        <input type="password" autoComplete="off" value={settings.accessCode} onChange={e => { settings.accessCode = e.target.value; changed(); }}/>
      </label>
      <footer className="dlg-foot">
        <span/>
        <button className="primary" value="close">{t("done")}</button>
      </footer>
    </Dlg>
  );
}
