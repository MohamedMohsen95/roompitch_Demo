// "Walk inside": the 3D header's button for walk mode, and the intro that shows before walking
// (a looping clip of a walk with the main controls over it) until the designer ticks "Don't show this again".
// Starting a walk expands the 3D view; leaving it puts the views back as they were.
import { useCallback, useEffect, useRef, useState } from "react";
import { startWalk, stopWalk, isWalking } from "../three/walk.js";
import { t } from "../i18n.js";
import { useStudio } from "./hooks";
import Modal from "./Modal";
import { IconWalk, IconHand, IconSelect, IconClose, IconArrowRight } from "./Icons";
import type { MaxProps, ViewId } from "./ViewMax";

const SKIP_KEY = "rp_walk_intro_off";
const skipped = () => { try { return localStorage.getItem(SKIP_KEY) === "1"; } catch { return false; } };
const CLIP = "/media/walk-intro";   // .mp4 (H.264: plays in every browser) and .jpg (the still while it loads)

export default function WalkButton({max, onMax}: MaxProps){
  useStudio();
  const walking = isWalking();
  const [intro, setIntro] = useState(false);
  const expanded = useRef<{prev: ViewId | null} | null>(null);   // set while a walk we started has the 3D view expanded

  const begin = () => {
    setIntro(false);
    if (max !== "3d"){ expanded.current = {prev:max}; onMax("3d"); }
    startWalk();
  };
  // However the walk ends (this button, a camera view), the views go back as they were.
  useEffect(() => {
    if (walking || !expanded.current) return;
    const {prev} = expanded.current; expanded.current = null;
    if (max === "3d") onMax(prev);
  }, [walking]);

  const click = () => walking ? stopWalk() : skipped() ? begin() : setIntro(true);
  return <>
    <button type="button" className="walkbtn" aria-pressed={walking} title={t("walkTitle")} onClick={click}>
      <IconWalk/><span>{t(walking ? "walkExit" : "walkInside")}</span>
    </button>
    <WalkIntro open={intro} onClose={() => setIntro(false)} onStart={begin}/>
  </>;
}

// React sets "muted" after the video is in the page, too late for the browser's autoplay check: mark it muted
// and autoplay here and load it again. (Autoplay rather than play(), so the browser resumes it by itself after
// pausing it while it was out of sight.)
const playMuted = (still: boolean) => (v: HTMLVideoElement | null) => {
  if (!v || still) return;
  v.muted = true; v.setAttribute("muted", ""); v.autoplay = true; v.load();
};

function WalkIntro({open, onClose, onStart}: {open: boolean, onClose: () => void, onStart: () => void}){
  const [skip, setSkip] = useState(false);
  useEffect(() => { if (open) setSkip(false); }, [open]);
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const video = useCallback(playMuted(still), [still]);
  const start = () => {
    if (skip){ try { localStorage.setItem(SKIP_KEY, "1"); } catch { /* private window: shows again next time */ } }
    onStart();
  };
  return (
    <Modal open={open} onClose={onClose} labelledBy="walk-intro-title" className="walkintro">
      <div className="wi-clip">
        <video ref={video} controls={still} muted loop playsInline poster={CLIP + ".jpg"} aria-label={t("walkClip")}>
          <source src={CLIP + ".mp4"} type="video/mp4"/>
        </video>
        <ul className="wi-pills" aria-label={t("walkControls")}>
          <li><kbd>W A S D</kbd>{t("walkPillWalk")}</li>
          <li><IconHand/>{t("walkPillLook")}</li>
          <li><kbd>Shift</kbd>{t("walkPillRun")}</li>
          <li><IconSelect/>{t("walkPillMove")}</li>
        </ul>
      </div>
      <div className="wi-body">
        <h3 id="walk-intro-title"><IconWalk/>{t("walkIntroTitle")}</h3>
        <p>{t("walkIntroLead")}</p>
        <div className="wi-foot">
          <label><input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)}/>{t("dontShowAgain")}</label>
          <button type="button" className="btn" onClick={onClose}>{t("cancel")}</button>
          <button type="button" className="btn primary" data-autofocus onClick={start}>{t("walkStart")}<IconArrowRight/></button>
        </div>
      </div>
      <button type="button" className="wi-x" aria-label={t("close")} onClick={onClose}><IconClose/></button>
    </Modal>
  );
}
