// "Your projects" on the New room screen: the rooms this user saved in the cloud (cloud-store.js), on any
// browser signed in to the same account. Open one, rename it, or delete it (two clicks, like resetting prices).
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { t, getLang } from "../../i18n.js";
import { listProjects, renameProject, deleteProject } from "../../cloud-store.js";
import { useLang } from "../hooks";

type Project = {id: string, name: string, kind: "studio" | "flat", updatedAt: string, form: any, pieces: number, current: boolean};

// "3 hours ago", "yesterday", or the date when older than a week.
function when(iso: string){
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(getLang(), {numeric:"auto"});
  if (s > -60) return rtf.format(0, "minute");
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  if (s > -7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString(getLang(), {day:"numeric", month:"short", year:"numeric"});
}

// Rows get the database's default name until renamed; show it in the page's language.
const nameOf = (p: Project) => p.name === "Untitled room" ? t("projUntitled") : p.name;

type Props = {
  onOpen: (p: Project) => void;
  onCurrentDeleted: (kind: "studio" | "flat") => void;
  onHasCurrent: (has: boolean) => void;   // a listed current project replaces the plain "Continue" button
  error: string | null;
};

export default function ProjectsList({onOpen, onCurrentDeleted, onHasCurrent, error}: Props){
  useLang();
  const [projects, setProjects] = useState<Project[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);   // a Delete waiting for its second click
  const [deleting, setDeleting] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nameInput = useRef<HTMLInputElement>(null);

  // Ask the cloud each time the list shows (after signing in, on another browser, ...).
  useEffect(() => {
    let live = true;
    listProjects().then((list: Project[] | null) => { if (live && list) setProjects(list); });
    return () => { live = false; clearTimeout(armTimer.current); };
  }, []);
  useEffect(() => { onHasCurrent(projects.some(p => p.current)); }, [projects]);
  useEffect(() => { if (renaming){ nameInput.current?.focus(); nameInput.current?.select(); } }, [renaming]);

  async function saveName(p: Project){
    const name = nameInput.current?.value.trim();
    setRenaming(null);
    if (name && name !== nameOf(p) && await renameProject(p.id, name)) setProjects(list => list.map(x => x.id === p.id ? {...x, name} : x));
  }

  async function remove(p: Project){
    if (armed !== p.id){
      clearTimeout(armTimer.current);
      setArmed(p.id); armTimer.current = setTimeout(() => setArmed(null), 4000);
      return;
    }
    clearTimeout(armTimer.current); setArmed(null);
    setDeleting(p.id);
    const r = await deleteProject(p.id);
    setDeleting(null);
    if (!r.ok) return;
    setProjects(list => list.filter(x => x.id !== p.id));
    if (r.current) onCurrentDeleted(r.kind || "studio");
  }

  const onKey = (p: Project) => (e: KeyboardEvent) => {
    if (e.key === "Enter"){ e.preventDefault(); saveName(p); }
    else if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); setRenaming(null); }
  };
  // Clicking elsewhere keeps the typed name (but not when the click is on this row's own buttons).
  const onBlur = (p: Project) => (e: FocusEvent) => {
    if (!(e.relatedTarget as Element | null)?.closest?.(`[data-id="${p.id}"]`)) saveName(p);
  };

  if (!projects.length) return null;
  return (
    <section className="projects" aria-labelledby="projHead">
      <h2 id="projHead"><span>{t("yourProjects")}</span> <span className="projcount">{projects.length}</span></h2>
      {error && <p className="projerr" role="alert">{error}</p>}
      <ul className="projs">
        {projects.map(p => {
          const size = p.form?.lengthCm && p.form?.widthCm ? <bdi dir="ltr">{p.form.lengthCm} × {p.form.widthCm} {t("cm")}</bdi> : null;
          const meta = (p.kind === "flat" ? [t("flatTitle"), when(p.updatedAt)] : [size, t("projPieces", {n:p.pieces}), when(p.updatedAt)]).filter(Boolean);
          const open = () => { if (renaming !== p.id) onOpen(p); };
          return (
            <li key={p.id} className={"proj" + (p.current ? " current" : "")} data-id={p.id}>
              <button className="projopen" type="button" aria-label={`${t(p.current ? "continueLast" : "projOpen")}: ${nameOf(p)}`} onClick={open}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4h16v16z M4 15h5v5 M15 4v4" fill="none" stroke="currentColor" strokeWidth="1.6"/></svg>
              </button>
              <div className="projtext">
                <div className="projline">
                  {renaming === p.id
                    ? <input className="projname" ref={nameInput} defaultValue={nameOf(p)} maxLength={80} aria-label={t("projRename")} onKeyDown={onKey(p)} onBlur={onBlur(p)}/>
                    : <b className="projtitle">{nameOf(p)}</b>}
                  {p.current && <span className="badge">{t("projCurrent")}</span>}
                </div>
                <span className="projmeta">{meta.map((m, i) => <span key={i}>{i ? " · " : ""}{m}</span>)}</span>
              </div>
              <div className="projacts">
                <button className={"btn" + (p.current ? " primary" : "")} type="button" onClick={open}>{t(p.current ? "projContinue" : "projOpen")}</button>
                <button className="btn" type="button" onClick={() => renaming === p.id ? saveName(p) : setRenaming(p.id)}>{t(renaming === p.id ? "projSave" : "projRename")}</button>
                <button className="btn danger" type="button" disabled={deleting === p.id} onClick={() => remove(p)}>{t(armed === p.id ? "projDeleteSure" : "delete")}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
