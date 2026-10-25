// "Your projects" on screen 1: the rooms this user saved in the cloud (cloud-store.js), on any browser
// signed in to the same account. Open one, rename it, or delete it (two clicks, like resetting prices).
import { $ } from "../utils.js";
import { t, getLang } from "../i18n.js";
import { listProjects, renameProject, deleteProject } from "../cloud-store.js";
import { esc } from "./screen.js";

let projects = [];
let hooks = {open:() => {}, onCurrentDeleted:() => {}};
let renaming = null;          // id of the project whose name is being edited
let armed = null;             // {id, timer} of a Delete waiting for its second click
let loading = 0;              // ignores an older list that arrives after a newer one

// "3 hours ago", "yesterday", or the date when older than a week.
function when(iso){
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(getLang(), {numeric:"auto"});
  if (s > -60) return rtf.format(0, "minute");
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  if (s > -7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString(getLang(), {day:"numeric", month:"short", year:"numeric"});
}

// Rows get the database's default name until renamed; show it in the page's language.
const nameOf = (p) => p.name === "Untitled room" ? t("projUntitled") : p.name;

function size(form){
  if (!form?.lengthCm || !form?.widthCm) return "";
  return `<bdi dir="ltr">${form.lengthCm} × ${form.widthCm} ${t("cm")}</bdi>`;
}

function render(){
  const box = $("#projList");
  box.hidden = !projects.length;
  // A listed current project replaces the plain "Continue" button.
  if (projects.some(p => p.current)) $("#continueLast").hidden = true;
  $("#projCount").textContent = projects.length;
  $("#projItems").innerHTML = projects.map(p => {
    const meta = [size(p.form), t("projPieces", {n:p.pieces}), esc(when(p.updatedAt))].filter(Boolean).join(" · ");
    const name = renaming === p.id
      ? `<input class="projname" id="projRename" value="${esc(nameOf(p))}" maxlength="80" aria-label="${esc(t("projRename"))}">`
      : `<b class="projtitle">${esc(nameOf(p))}</b>`;
    return `<li class="proj${p.current ? " current" : ""}" data-id="${p.id}">
      <button class="projopen" type="button" data-act="open" aria-label="${esc(t(p.current ? "continueLast" : "projOpen"))}: ${esc(nameOf(p))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4h16v16z M4 15h5v5 M15 4v4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
      </button>
      <div class="projtext">
        <div class="projline">${name}${p.current ? `<span class="badge">${esc(t("projCurrent"))}</span>` : ""}</div>
        <span class="projmeta">${meta}</span>
      </div>
      <div class="projacts">
        <button class="btn ${p.current ? "primary" : ""}" type="button" data-act="open">${esc(t(p.current ? "projContinue" : "projOpen"))}</button>
        <button class="btn" type="button" data-act="rename">${esc(t(renaming === p.id ? "projSave" : "projRename"))}</button>
        <button class="btn danger" type="button" data-act="delete">${esc(t(armed?.id === p.id ? "projDeleteSure" : "delete"))}</button>
      </div>
    </li>`;
  }).join("");
  const input = $("#projRename");
  if (input){ input.focus(); input.select(); }
}

// Ask the cloud again (on showing screen 1, after signing in, after a change).
export async function refreshProjects(){
  const n = ++loading;
  const list = await listProjects();
  if (n !== loading || !list) return;
  projects = list;
  render();
}

async function saveName(id){
  const input = $("#projRename");
  const p = projects.find(x => x.id === id);
  renaming = null;
  const name = input?.value.trim();
  if (p && name && name !== nameOf(p) && await renameProject(id, name)) p.name = name;
  render();
}

async function remove(b, id){
  if (armed?.id !== id){
    clearTimeout(armed?.timer);
    armed = {id, timer:setTimeout(() => { armed = null; render(); }, 4000)};
    render();
    return;
  }
  clearTimeout(armed.timer); armed = null;
  b.disabled = true;
  const r = await deleteProject(id);
  if (!r.ok){ b.disabled = false; render(); return; }
  projects = projects.filter(p => p.id !== id);
  render();
  if (r.current) hooks.onCurrentDeleted();
}

// open(project): open that room (main.js). onCurrentDeleted(): the room on screen 1's Continue is gone.
export function initProjects(h){
  hooks = {...hooks, ...h};
  const list = $("#projItems");
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"), li = e.target.closest(".proj");
    if (!b || !li) return;
    const id = li.dataset.id, p = projects.find(x => x.id === id);
    if (!p) return;
    if (b.dataset.act === "open"){ if (renaming !== id) hooks.open(p); }
    else if (b.dataset.act === "rename"){ if (renaming === id) saveName(id); else { renaming = id; render(); } }
    else if (b.dataset.act === "delete") remove(b, id);
  });
  list.addEventListener("keydown", (e) => {
    if (e.target.id !== "projRename") return;
    if (e.key === "Enter"){ e.preventDefault(); saveName(renaming); }
    else if (e.key === "Escape"){ e.preventDefault(); renaming = null; render(); }
  });
  // Clicking elsewhere keeps the typed name.
  list.addEventListener("focusout", (e) => {
    if (e.target.id === "projRename" && renaming && e.target.isConnected && !e.relatedTarget?.closest?.(`[data-id="${renaming}"]`)) saveName(renaming);
  });
}

export const relabelProjects = () => { if (projects.length) render(); };
