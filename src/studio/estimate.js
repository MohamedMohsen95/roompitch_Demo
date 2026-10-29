// Live estimate: finishes by area, furniture by count, priced from the designer's price list.
// computeEstimate() feeds the estimate panel (ui/Estimate.tsx) and the PDF proposal.
import { S, wallArea } from "./state.js";
import { WM, FM, FU } from "./catalog.js";
import { t, nameOf, getLang } from "./i18n.js";
import { settings, priceOf } from "./settings.js";
import { polyArea } from "./geometry.js";

// rows: {grp} headings and {name, qty, unit, unitPrice, amt} lines, in language `l`.
export function computeEstimate(l = getLang()){
  const rows = [];
  rows.push({grp:t("finishes", null, l)});
  const floorArea = polyArea(S.poly), fp = priceOf(S.floor);
  if (fp) rows.push({name:t("floorLine", {name:nameOf(FM[S.floor], l)}, l), qty:floorArea, unit:t("m2", null, l), unitPrice:fp, amt:floorArea * fp});
  const byMat = {};
  S.walls.forEach((fin, i) => { byMat[fin] = (byMat[fin] || 0) + wallArea(i); });
  for (const [id, a] of Object.entries(byMat)){
    const p = priceOf(id); if (!p) continue;
    rows.push({name:t("wallsLine", {name:nameOf(WM[id], l)}, l), qty:a, unit:t("m2", null, l), unitPrice:p, amt:a * p});
  }
  const counts = {};
  for (const it of S.items) counts[it.type] = (counts[it.type] || 0) + 1;
  if (Object.keys(counts).length) rows.push({grp:t("furniture", null, l)});
  for (const [id, n] of Object.entries(counts)){
    const p = priceOf(id);
    rows.push({name:nameOf(FU[id], l), qty:n, unit:t("pc", null, l), unitPrice:p, amt:n * p});
  }
  const subtotal = rows.reduce((s, r) => s + (r.amt || 0), 0);
  const fee = subtotal * (Number(settings.feePct) || 0) / 100;
  const vat = (subtotal + fee) * (Number(settings.vatPct) || 0) / 100;
  return {rows, subtotal, fee, vat, total:subtotal + fee + vat};
}

export const qtyText = (r) => Number.isInteger(r.qty) ? String(r.qty) : r.qty.toFixed(1);

