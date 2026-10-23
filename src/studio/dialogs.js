// Studio settings (office details, logo, currency, fee, VAT) and the full price list.
import { WALL_MATS, FLOOR_MATS, FURN } from "./catalog.js";
import { $ } from "./utils.js";
import { t, nameOf } from "./i18n.js";
import { settings, saveSettings, CURRENCIES, priceOf, setPrice, resetPrices } from "./settings.js";
import { swatchURL } from "./textures.js";
import { renderEst } from "./estimate.js";
import { renderLib } from "./library.js";
import { renderInspect } from "./inspector.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const refresh = () => { renderEst(); renderLib(); renderInspect(); };

export const openDialog = (id) => { const m = $(id); m.hidden = false; const f = m.querySelector("input, select, textarea, button"); if (f) f.focus(); };
export const closeDialog = (id) => { $(id).hidden = true; };

/* ───────── Settings ───────── */

function fillSettings(){
  const st = settings.studio;
  $("#setName").value = st.name; $("#setDesigner").value = st.designer;
  $("#setPhone").value = st.phone; $("#setEmail").value = st.email;
  $("#setCurrency").innerHTML = CURRENCIES.map(c => `<option${c === settings.currency ? " selected" : ""}>${c}</option>`).join("");
  $("#setFee").value = settings.feePct; $("#setVat").value = settings.vatPct;
  renderLogo();
}
function renderLogo(){
  const box = $("#logoPreview");
  box.innerHTML = settings.studio.logo ? `<img src="${settings.studio.logo}" alt="">` : `<span>${t("noLogo")}</span>`;
  $("#removeLogo").hidden = !settings.studio.logo;
}

// Shrink the logo so it fits comfortably in localStorage (PNG keeps transparency).
function readLogo(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

function initSettings(){
  $("#settingsBtn").onclick = () => { fillSettings(); openDialog("#settingsModal"); };
  const field = (id, key) => $(id).addEventListener("input", e => { settings.studio[key] = e.target.value; saveSettings(); });
  field("#setName", "name"); field("#setDesigner", "designer"); field("#setPhone", "phone"); field("#setEmail", "email");
  $("#setCurrency").addEventListener("change", e => { settings.currency = e.target.value; saveSettings(); refresh(); });
  const pct = (id, key) => $(id).addEventListener("change", e => {
    const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
    e.target.value = v; settings[key] = v; saveSettings(); renderEst();
  });
  pct("#setFee", "feePct"); pct("#setVat", "vatPct");
  $("#logoInput").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    try { settings.studio.logo = await readLogo(file); saveSettings(); renderLogo(); } catch { /* not an image */ }
  });
  $("#removeLogo").onclick = () => { settings.studio.logo = ""; saveSettings(); renderLogo(); };
  $("#closeSettings").onclick = () => closeDialog("#settingsModal");
}

/* ───────── Price list ───────── */

function renderPrices(){
  const group = (title, list, swatch) => `<h4>${title}</h4><div class="plist">${list.map(o => `
    <label class="prow" for="pr-${o.id}">
      ${swatch ? `<span class="psw" style="background-image:url(${swatchURL(o)})"></span>` : `<span class="psw" style="background:${o.c}"></span>`}
      <span class="pname" title="${esc(nameOf(o))}">${esc(nameOf(o))}</span>
      <input id="pr-${o.id}" type="number" min="0" step="1" inputmode="decimal" value="${priceOf(o.id)}" data-id="${o.id}">
    </label>`).join("")}</div>`;
  $("#priceBody").innerHTML =
    group(t("wallsPerM2"), WALL_MATS.filter(m => m.price), true) +
    group(t("floorsPerM2"), FLOOR_MATS.filter(m => m.price), true) +
    group(t("furnPerPiece"), FURN, false);
  $("#priceCur").textContent = settings.currency;
  $("#priceBody").querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
    setPrice(inp.dataset.id, inp.value); inp.value = priceOf(inp.dataset.id); refresh();
  }));
}

let resetArmed = null;
function initPrices(){
  $("#pricesBtn").onclick = () => { renderPrices(); openDialog("#pricesModal"); };
  $("#closePrices").onclick = () => closeDialog("#pricesModal");
  // Two clicks to reset, since the page can't show a confirm() dialog everywhere.
  $("#resetPrices").onclick = (e) => {
    const b = e.currentTarget;
    if (!resetArmed){ b.textContent = t("resetConfirm"); resetArmed = setTimeout(() => { resetArmed = null; b.textContent = t("resetPrices"); }, 4000); return; }
    clearTimeout(resetArmed); resetArmed = null; b.textContent = t("resetPrices");
    resetPrices(); renderPrices(); refresh();
  };
}

export function initDialogs(){
  initSettings(); initPrices();
  // Click on the dimmed backdrop closes a dialog.
  document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.hidden = true; }));
}

// Re-fill open dialogs after a language change.
export function relabelDialogs(){
  if (!$("#settingsModal").hidden) renderLogo();
  if (!$("#pricesModal").hidden) renderPrices();
}
