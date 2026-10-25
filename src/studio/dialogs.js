// Studio settings (office details, logo, currency, fee, VAT), the full price list, uploading a 3D model,
// and the account (sign in / create account / sign out).
import { WALL_MATS, FLOOR_MATS, FURN, applyCatalog } from "./catalog.js";
import { MAX_BYTES, measureModel, uploadModel } from "./model-upload.js";
import { getAccount, signIn, signUp, signOut } from "./auth.js";
import { $ } from "./utils.js";
import { t, nameOf } from "./i18n.js";
import { settings, saveSettings, CURRENCIES, priceOf, setPrice, resetPrices } from "./settings.js";
import { swatchURL } from "./textures.js";
import { renderEst } from "./estimate.js";
import { renderLib, flashHint } from "./library.js";
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

/* ───────── Upload a 3D model ───────── */

let measured = null;   // {w, d, h, scaled} of the chosen file, or null
const umStatus = (msg, err = false) => { const s = $("#umStatus"); s.textContent = msg; s.classList.toggle("err", err); };
const cm = (id) => parseFloat($(id).value) / 100;

function openUpload(){
  if (!account?.email){ openAccount(t("accNeedForUpload")); return; }
  measured = null;
  for (const id of ["#umFile", "#umName", "#umNameAr", "#umPrice", "#umW", "#umD", "#umH"]) $(id).value = "";
  $("#umPriceLabel").textContent = t("umPrice", {cur:settings.currency});
  // Admins choose: the built-in catalog everyone sees, or only themselves.
  for (const el of [$("#umWho"), $("label[for=umWho]")]) el.hidden = !account.admin;
  $("#umWho").value = "everyone";
  umStatus(""); $("#umGo").disabled = false;
  openDialog("#uploadModal");
}

async function chooseModel(file){
  measured = null;
  if (!file) return;
  if (file.size > MAX_BYTES) return umStatus(t("umErrBig"), true);
  if (!$("#umName").value.trim()) $("#umName").value = file.name.replace(/\.(glb|gltf)$/i, "").replace(/[_-]+/g, " ").trim();
  umStatus(t("umReading"));
  try {
    measured = await measureModel(file);
    for (const [id, v] of [["#umW", measured.w], ["#umD", measured.d], ["#umH", measured.h]]) $(id).value = Math.round(v * 100);
    umStatus(t(measured.scaled ? "umScaled" : "umMeasured"));
  } catch { umStatus(t("umErrFile"), true); }
}

async function submitUpload(){
  const file = $("#umFile").files[0], name = $("#umName").value.trim(), price = parseFloat($("#umPrice").value);
  const w = cm("#umW"), d = cm("#umD"), h = cm("#umH");
  if (!file || !measured) return umStatus(t(file ? "umErrFile" : "umErrPick"), true);
  if (!name) return umStatus(t("umErrName"), true);
  if (!(price >= 0)) return umStatus(t("umErrPrice"), true);
  if (!(w > 0 && d > 0 && h > 0)) return umStatus(t("umErrSize"), true);
  $("#umGo").disabled = true; umStatus(t("umUploading"));
  try {
    const row = await uploadModel({file, name, nameAr:$("#umNameAr").value.trim(), price, currency:settings.currency, w, d, h,
      shared:account.admin && $("#umWho").value === "everyone"});
    applyCatalog([row]); renderLib(); renderPrices();
    closeDialog("#uploadModal");
    flashHint(t("umDone", {name}), 5000);
  } catch (e) {
    umStatus(e.message === "offline" ? t("umErrCloud") : t("umErrUpload", {msg:e.message}), true);
    $("#umGo").disabled = false;
  }
}

function initUpload(){
  $("#uploadModelBtn").onclick = openUpload;
  $("#umFile").addEventListener("change", e => chooseModel(e.target.files[0]));
  $("#umGo").onclick = submitUpload;
  $("#umCancel").onclick = () => closeDialog("#uploadModal");
}

/* ───────── Account ───────── */

let account = null;   // {email, anonymous, admin} once known (see auth.js)
let creating = false; // which tab the signed-out form shows: sign in or create account
const accStatus = (msg, err = false) => {
  const s = $("#accStatus"); s.textContent = msg; s.hidden = !msg; s.classList.toggle("err", err);
};
// Supabase's error codes, in words a designer understands.
const AUTH_ERRORS = {invalid_credentials:"accErrLogin", user_already_exists:"accErrExists", email_exists:"accErrExists",
  email_not_confirmed:"accErrConfirm", weak_password:"accErrPass", email_address_invalid:"accErrEmail", validation_failed:"accErrEmail"};
const authError = (e) => AUTH_ERRORS[e.code] ? t(AUTH_ERRORS[e.code]) : t("accErr", {msg:e.message});

// The same button in the studio header and on screen 1.
const ACCOUNT_BTNS = ["#accountBtn", "#setupAccountBtn"];
function renderAccountBtn(){
  for (const sel of ACCOUNT_BTNS){
    const b = $(sel);
    b.hidden = !account;
    if (!account) continue;
    b.replaceChildren(Object.assign(document.createElement("span"), {className:"acctext", textContent:account.email || t("signIn")}));
    b.title = account.email || "";
    if (account.admin) b.append(Object.assign(document.createElement("span"), {className:"badge", textContent:t("admin")}));
  }
}

// The tab (sign in / create account) decides the heading, the submit label and the password autofill.
function setMode(create){
  creating = create;
  $("#accModeIn").setAttribute("aria-selected", String(!create));
  $("#accModeUp").setAttribute("aria-selected", String(create));
  $("#accGo").textContent = t(create ? "signUp" : "signIn");
  $("#accPass").autocomplete = create ? "new-password" : "current-password";
  $("#accPassHint").hidden = !create;
  if (!$("#accWhy").dataset.why) $("#accTitle").textContent = t(create ? "accTitleUp" : "accTitle");
  accStatus("");
}

function openAccount(why){
  const signedIn = Boolean(account?.email);
  $("#accOut").hidden = signedIn; $("#accIn").hidden = !signedIn;
  if (signedIn){
    $("#accAvatar").textContent = account.email[0];
    $("#accWhoEmail").textContent = account.email;
    $("#accWhoRole").textContent = t(account.admin ? "accRoleAdmin" : "accRoleDesigner");
    $("#accWhoNote").textContent = t(account.admin ? "accNoteAdmin" : "accNoteDesigner");
    $("#accWhoNote").classList.remove("err");
    $("#accTitle").textContent = t("accTitleIn");
  } else {
    // Opened from "Upload 3D model": say why an account is needed.
    $("#accWhy").dataset.why = why ? "1" : "";
    $("#accWhy").textContent = why || t("accNote");
    $("#accTitle").textContent = t("accTitle");
    $("#accPass").value = ""; $("#accPass").type = "password"; $("#accPeek").textContent = t("show");
    for (const id of ["#accEmail", "#accPass"]) $(id).removeAttribute("aria-invalid");
    $("#accGo").disabled = false;
    setMode(creating);
  }
  openDialog("#accountModal");
  if (!signedIn) ($("#accEmail").value ? $("#accPass") : $("#accEmail")).focus();
}

// Sign in or create an account; both reload the page when they succeed.
async function submitAccount(){
  const emailEl = $("#accEmail"), passEl = $("#accPass");
  const email = emailEl.value.trim(), password = passEl.value;
  const badEmail = !/^\S+@\S+\.\S+$/.test(email), badPass = password.length < 6;
  emailEl.toggleAttribute("aria-invalid", badEmail); passEl.toggleAttribute("aria-invalid", !badEmail && badPass);
  if (badEmail){ emailEl.focus(); return accStatus(t("accErrEmail"), true); }
  if (badPass){ passEl.focus(); return accStatus(t("accErrPass"), true); }
  const go = $("#accGo");
  go.disabled = true; go.textContent = t(creating ? "accCreating" : "accSigningIn"); accStatus("");
  try {
    if (!creating) await signIn(email, password);
    else if ((await signUp(email, password)).confirm){ setMode(false); accStatus(t("accConfirm", {email})); }
  } catch (e) { accStatus(authError(e), true); }
  go.disabled = false; go.textContent = t(creating ? "signUp" : "signIn");
}

function initAccount(){
  for (const sel of ACCOUNT_BTNS) $(sel).onclick = () => openAccount();
  $("#accModeIn").onclick = () => setMode(false);
  $("#accModeUp").onclick = () => setMode(true);
  $("#accOut").addEventListener("submit", e => { e.preventDefault(); submitAccount(); });
  for (const id of ["#accEmail", "#accPass"]) $(id).addEventListener("input", e => e.target.removeAttribute("aria-invalid"));
  $("#accPeek").onclick = () => {
    const p = $("#accPass"), show = p.type === "password";
    p.type = show ? "text" : "password";
    $("#accPeek").textContent = t(show ? "hide" : "show"); $("#accPeek").setAttribute("aria-pressed", String(show));
  };
  $("#accSignOut").onclick = () => signOut().catch(e => {
    $("#accWhoNote").textContent = t("accErr", {msg:e.message}); $("#accWhoNote").classList.add("err");
  });
  for (const id of ["#accCancel", "#accClose"]) $(id).onclick = () => closeDialog("#accountModal");
  getAccount().then(a => { account = a; renderAccountBtn(); });
}

export function initDialogs(){
  initSettings(); initPrices(); initUpload(); initAccount();
  // Click on the dimmed backdrop closes a dialog.
  document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.hidden = true; }));
}

// Re-fill open dialogs after a language change.
export function relabelDialogs(){
  if (!$("#settingsModal").hidden) renderLogo();
  if (!$("#pricesModal").hidden) renderPrices();
  renderAccountBtn();
}
