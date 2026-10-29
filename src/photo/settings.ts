// The photo page's settings (language, currency, rates, studio details), saved on this device,
// plus the text, money and budget helpers that read them.
import { I18N } from "./i18n";
import { DEFAULT_PRICES, FINISH_MULT, ROOM_ITEMS, type Named, type PriceItem, type RoomDims } from "./data";

export type Lang = "en" | "ar";
export type Line = {id: string, qty: number, on: boolean, auto: boolean};

const KEY = "rp_settings";

const defaultSettings = () => ({
  lang: ((navigator.language || "").startsWith("ar") ? "ar" : "en") as Lang,
  currency: "USD", feePct: 15, vatPct: 0,
  prices: DEFAULT_PRICES.map(p => ({id: p.id, price: p.price})),
  pricesEdited: false,
  studio: {name: "", designer: "", phone: "", email: "", logo: ""},
  accessCode: ""
});

function load(){
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
}

export const settings: ReturnType<typeof defaultSettings> = Object.assign(defaultSettings(), load());

// Returns false when the browser would not store it (storage full or blocked).
export function saveSettings(){
  try { localStorage.setItem(KEY, JSON.stringify(settings)); return true; }
  catch { return false; }
}

export const t = (key: string, vars: Record<string, string | number> = {}, lang: Lang = settings.lang) => {
  let s = I18N[lang]?.[key] || I18N.en[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
};
export const nameOf = (obj: Named, lang: Lang = settings.lang) => obj[lang] || obj.en;

export const money = (n: number, lang: Lang = settings.lang) => {
  try {
    return new Intl.NumberFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
      style: "currency", currency: settings.currency, maximumFractionDigits: 0
    }).format(n);
  } catch { return `${Math.round(n).toLocaleString()} ${settings.currency}`; }
};
export const unitLabel = (u: string, lang?: Lang) => t("u_" + u, {}, lang);

/* ───── Budget ───── */

export const priceOf = (id: string) => settings.prices.find(p => p.id === id)?.price || 0;
export const itemOf = (id: string) => DEFAULT_PRICES.find(i => i.id === id) as PriceItem;
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function autoQty(unit: string, d: RoomDims){
  if (unit === "m2floor" || unit === "m2ceiling") return round1(d.L * d.W);
  // Wall area minus ~15% for doors and windows
  if (unit === "m2wall") return round1(2 * (d.L + d.W) * d.H * 0.85);
  return null;
}

// The line items for a room type (rebuilt when the room type changes).
export function buildLines(roomType: string, d: RoomDims): Line[]{
  const preset = ROOM_ITEMS[roomType] || {};
  return DEFAULT_PRICES.map(item => {
    const auto = autoQty(item.unit, d);
    if (auto !== null) return {id: item.id, qty: auto, on: true, auto: true};
    const p = preset[item.id];
    const qty = typeof p === "function" ? p(d) : (p || 0);
    return {id: item.id, qty, on: qty > 0, auto: false};
  });
}

// Area-based lines follow the room size until the designer types their own quantity.
export const refreshAutoQty = (lines: Line[], d: RoomDims) =>
  lines.map(l => l.auto ? {...l, qty: autoQty(itemOf(l.id).unit, d)!} : l);

export function computeTotals(lines: Line[], finish: string){
  const mult = FINISH_MULT[finish];
  const rows = lines
    .filter(l => l.on && l.qty > 0)
    .map(l => {
      const item = itemOf(l.id);
      const unitPrice = priceOf(l.id) * mult;
      return {item, qty: l.qty, unitPrice, amount: unitPrice * l.qty};
    });
  const subtotal = rows.reduce((s, r) => s + r.amount, 0);
  const fee = subtotal * (settings.feePct || 0) / 100;
  const vat = (subtotal + fee) * (settings.vatPct || 0) / 100;
  return {rows, subtotal, fee, vat, total: subtotal + fee + vat};
}
