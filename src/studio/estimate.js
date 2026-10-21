// Live estimate: finishes by area, furniture by count.
import { S, wallArea } from "./state.js";
import { WM, FM, FU } from "./catalog.js";
import { $, fmt } from "./utils.js";

export function renderEst(){
  const rows = [];
  const floorArea = S.L * S.W, fm = FM[S.floor];
  rows.push({grp:"Finishes"});
  if (fm.price) rows.push({name:`Floor: ${fm.name}`, sub:`${floorArea.toFixed(1)} m² × ${fmt(fm.price)}`, amt:floorArea * fm.price});
  const byMat = {};
  for (const k of ["n","e","s","w"]){ byMat[S.walls[k]] = (byMat[S.walls[k]] || 0) + wallArea(k); }
  for (const [id, a] of Object.entries(byMat)){
    const m = WM[id]; if (!m.price) continue;
    rows.push({name:`Walls: ${m.name}`, sub:`${a.toFixed(1)} m² × ${fmt(m.price)}`, amt:a * m.price});
  }
  const counts = {};
  for (const it of S.items) counts[it.type] = (counts[it.type] || 0) + 1;
  if (Object.keys(counts).length) rows.push({grp:"Furniture"});
  for (const [t, n] of Object.entries(counts)){ const f = FU[t]; rows.push({name:f.name, sub:`${n} × ${fmt(f.price)}`, amt:n * f.price}); }
  const total = rows.reduce((s, r) => s + (r.amt || 0), 0);
  $("#est").innerHTML = `<table><tbody>${rows.map(r => r.grp
      ? `<tr class="grp"><td colspan="2">${r.grp}</td></tr>`
      : `<tr><td>${r.name}<span class="sub">${r.sub}</span></td><td class="n">${fmt(r.amt)}</td></tr>`).join("")}</tbody></table>
    <div class="total"><span>Total</span><span class="n">EGP ${fmt(total)}</span></div>
    <p class="note">Example prices. In the real product these come from the designer's own price list, or from the showroom when a piece is from its catalog.</p>`;
}
