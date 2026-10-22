// The designer's own settings and prices, kept in this browser (localStorage).
import { WM, FM, FU } from "./catalog.js";
import { fmt } from "./utils.js";

const KEY = "rp_studio_settings";
export const CURRENCIES = ["EGP", "USD", "EUR", "SAR", "AED", "QAR", "KWD", "BHD", "OMR", "GBP"];

const defaults = () => ({
  studio: {name:"", designer:"", phone:"", email:"", logo:""},
  currency: "EGP",
  feePct: 0,
  vatPct: 0,
  prices: {}          // id -> the designer's price; missing ids use the catalog's example price
});

export const settings = (() => {
  const d = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {...d, ...saved, studio:{...d.studio, ...(saved.studio || {})}, prices:{...(saved.prices || {})}};
  } catch { return d; }
})();

export function saveSettings(){
  try { localStorage.setItem(KEY, JSON.stringify(settings)); return true; }
  catch { return false; }   // storage full (large logo) or blocked: settings last until reload
}

const entry = (id) => FU[id] || WM[id] || FM[id];

// Price of a finish (per m²) or a piece (each): the designer's own if set, else the example price.
export function priceOf(id){
  const p = settings.prices[id];
  if (typeof p === "number" && isFinite(p)) return p;
  const e = entry(id);
  return e ? e.price : 0;
}

export function setPrice(id, value){
  const v = Math.max(0, Number(value));
  if (!isFinite(v)) return;
  settings.prices[id] = v; saveSettings();
}

export function resetPrices(){ settings.prices = {}; saveSettings(); }

export const money = (n) => `${settings.currency} ${fmt(n)}`;
