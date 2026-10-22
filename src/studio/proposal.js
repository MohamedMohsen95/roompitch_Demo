// PDF proposal: a print-only A4 layout built from the room, the renders and the estimate,
// then the browser's print window ("Save as PDF"). Printing keeps Arabic text shaping exact.
import { S } from "./state.js";
import { $, fmt } from "./utils.js";
import { t, getLang } from "./i18n.js";
import { settings } from "./settings.js";
import { computeEstimate, qtyText } from "./estimate.js";
import { planMarkup, planViewBox } from "./plan.js";
import { renders, snapshot } from "./render-ai.js";
import { openDialog, closeDialog } from "./dialogs.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));

function buildProposal(l){
  const T = (k, v) => t(k, v, l);
  const st = settings.studio;
  const e = computeEstimate(l);
  const money = (n) => `${settings.currency} ${fmt(n)}`;
  const date = new Intl.DateTimeFormat(l === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {dateStyle:"long"}).format(new Date());
  const days = Math.max(1, parseInt($("#pdfValid").value, 10) || 14);
  const notes = $("#pdfNotes").value.trim();

  // Newest render is the hero; up to three earlier ones become alternatives. No render yet: the 3D view.
  const hero = renders.length ? renders[renders.length - 1].src : snapshot().full;
  const alts = renders.slice(0, -1).slice(-3);

  const rows = e.rows.map(r => r.grp
    ? `<tr class="pp-grp"><td colspan="4">${esc(r.grp)}</td></tr>`
    : `<tr><td>${esc(r.name)}</td><td class="c">${qtyText(r)} ${esc(r.unit)}</td><td class="n">${fmt(r.unitPrice)}</td><td class="n">${fmt(r.amt)}</td></tr>`).join("");
  const foot = [
    (settings.feePct || settings.vatPct) ? `<tr><td colspan="3">${esc(T("subtotal"))}</td><td class="n">${money(e.subtotal)}</td></tr>` : "",
    settings.feePct ? `<tr><td colspan="3">${esc(T("fee", {p:settings.feePct}))}</td><td class="n">${money(e.fee)}</td></tr>` : "",
    settings.vatPct ? `<tr><td colspan="3">${esc(T("vat", {p:settings.vatPct}))}</td><td class="n">${money(e.vat)}</td></tr>` : "",
    `<tr class="pp-grand"><td colspan="3">${esc(T("total"))}</td><td class="n">${money(e.total)}</td></tr>`
  ].join("");

  const p = $("#proposal");
  p.dir = l === "ar" ? "rtl" : "ltr"; p.lang = l;
  p.innerHTML = `
    <header class="pp-head">
      <div class="pp-studio">
        ${st.logo ? `<img class="pp-logo" src="${st.logo}" alt="">` : ""}
        <div>
          <div class="pp-studio-name">${esc(st.name || T("yourStudio"))}</div>
          <div class="pp-contact">${[st.designer, st.phone, st.email].filter(Boolean).map(esc).join(" · ")}</div>
        </div>
      </div>
      <div class="pp-date">${esc(T("pDate"))}: ${esc(date)}</div>
    </header>

    <h1 class="pp-title">${esc(T("pTitle"))}</h1>
    <div class="pp-meta">
      <div><span>${esc(T("preparedFor"))}</span><strong>${esc($("#pdfClient").value.trim() || "—")}</strong></div>
      <div><span>${esc(T("pProject"))}</span><strong>${esc($("#pdfProject").value.trim() || "—")}</strong></div>
      <div><span>${esc(T("pRoom"))}</span><strong><bdi dir="ltr">${S.L} × ${S.W} × ${S.H}</bdi> ${esc(T("m"))} · <bdi>${(S.L * S.W).toFixed(1)}</bdi> ${esc(T("m2"))}</strong></div>
    </div>

    <figure class="pp-hero"><img src="${hero}" alt=""><figcaption>${esc(renders.length ? T("proposed") : T("concept3d"))}</figcaption></figure>
    ${alts.length ? `<section class="pp-alts"><h2>${esc(T("alternatives"))}</h2>
      <div class="pp-alt-grid">${alts.map(r => `<figure><img src="${r.src}" alt=""></figure>`).join("")}</div></section>` : ""}

    <section class="pp-plan">
      <h2>${esc(T("planCap"))}</h2>
      <svg viewBox="${planViewBox()}" xmlns="http://www.w3.org/2000/svg">${planMarkup({lang:l, sel:null, gridId:"pp-grid"})}</svg>
    </section>

    <section class="pp-costs">
      <h2>${esc(T("breakdown"))}</h2>
      <table>
        <thead><tr><th>${esc(T("item"))}</th><th class="c">${esc(T("qty"))}</th><th class="n">${esc(T("unitPrice"))}</th><th class="n">${esc(T("amount"))}</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${foot}</tfoot>
      </table>
    </section>

    ${notes ? `<section class="pp-notes"><h2>${esc(T("pNotes"))}</h2><p>${esc(notes)}</p></section>` : ""}

    <footer class="pp-foot">
      <p>${esc(T("valid", {d:days}))}</p>
      <p>${esc(T("visual"))}</p>
      <div class="pp-sign"><div><span></span>${esc(T("signClient"))}</div><div><span></span>${esc(T("signDesigner"))}</div></div>
    </footer>`;
  return p;
}

async function exportPdf(){
  const l = $("#pdfLang").value;
  const p = buildProposal(l);
  closeDialog("#pdfModal");
  // Wait for images and fonts so nothing prints half-loaded.
  await Promise.all([...p.querySelectorAll("img")].map(img => img.decode().catch(() => {})));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const prev = document.title, client = $("#pdfClient").value.trim();
  document.title = [t("pTitle", null, l), client, settings.studio.name].filter(Boolean).join(" - ");
  window.print();
  setTimeout(() => { document.title = prev; }, 800);
}

export function initProposal(){
  $("#pdfBtn").onclick = () => {
    $("#pdfLang").value = getLang();
    $("#pdfNoRender").hidden = renders.length > 0;
    openDialog("#pdfModal");
  };
  $("#pdfGo").onclick = exportPdf;
  $("#pdfCancel").onclick = () => closeDialog("#pdfModal");
}
