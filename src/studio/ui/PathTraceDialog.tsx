// "Path-traced": a physically lit still of the 3D view, traced on this computer's GPU with WebGPU
// (three/pathtrace.js, loaded when a render starts).
// The dialog opens ready: pick the image size, then Start render. Grainy at first, it clears pass by pass;
// it can be paused and saved at any point, and started again (at the size then ticked).
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n.js";
import Modal from "./Modal";

const MAX = 128;   // passes per pixel before the denoiser runs; "Finish now" denoises earlier
// The saved image: as big as the dialog shows it, or, ticked, a fixed 1920 × 1280 (3 to 4 times the
// pixels, so as many times slower). The choice is remembered on this device.
const HD = {w:1920, h:1280};
const SIZE_KEY = "rp_pt_size";
const savedSize = () => { try { return localStorage.getItem(SIZE_KEY) === "hd"; } catch { return false; } };
const hasGpu = () => "gpu" in navigator;
type Status = {phase: "idle" | "preparing" | "tracing" | "denoising" | "done" | "error" | "nogpu", samples: number};

export default function PathTraceDialog({open, onClose}: {open: boolean, onClose: () => void}){
  const host = useRef<HTMLDivElement>(null);
  const job = useRef<{stops: number, exposure: (stops: number) => void, pause: (on: boolean) => void, finish: () => void, grain: (k: number) => void, save: () => string | null, dispose: () => void} | null>(null);
  const [st, setSt] = useState<Status>({phase:"idle", samples:0});
  const [paused, setPaused] = useState(false);
  const [secs, setSecs] = useState(0);
  const [stops, setStops] = useState(0);
  const [removal, setRemoval] = useState(.75);
  const [hd, setHd] = useState(savedSize);
  const [run, setRun] = useState(0);   // 0: not started since the dialog opened; each Start adds one
  function pickSize(on: boolean){
    setHd(on);
    try { localStorage.setItem(SIZE_KEY, on ? "hd" : "fit"); } catch { /* ignore */ }
  }

  useEffect(() => { if (!open) setRun(0); }, [open]);
  useEffect(() => {
    if (!open || !host.current) return;
    if (!hasGpu()){ setSt({phase:"nogpu", samples:0}); return; }
    if (!run){ setSt({phase:"idle", samples:0}); return; }
    const el = host.current, start = performance.now();
    let gone = false;
    setPaused(false); setSt({phase:"preparing", samples:0});
    import("../three/pathtrace.js").then(({startPathTrace}) => {
      if (gone) return;
      job.current = startPathTrace(el, {maxSamples:MAX, removal, size:hd ? HD : null, onStatus:s => {
        setSt(prev => prev.phase === s.phase && prev.samples === s.samples ? prev : s);
        if (s.phase === "done") setSecs(Math.round((performance.now() - start) / 1000));
      }});
      setStops(job.current.stops);
    }, () => { if (!gone) setSt({phase:"error", samples:0}); });
    return () => { gone = true; job.current?.dispose(); job.current = null; };
  }, [open, run]);   // the size is read when a render starts

  const status = st.phase === "idle" ? t("ptReady")
    : st.phase === "preparing" ? t("ptPreparing")
    : st.phase === "error" ? t("ptFailed")
    : st.phase === "nogpu" ? t("ptNoGpu")
    : st.phase === "done" ? t("ptDone", {n:st.samples, s:secs})
    : st.phase === "denoising" ? t("ptDenoising")
    : t(paused ? "ptPaused" : "ptPasses", {n:st.samples, m:MAX});
  const started = st.phase !== "idle" && st.phase !== "nogpu";

  function save(){
    const url = job.current?.save(); if (!url) return;
    const a = document.createElement("a"); a.href = url; a.download = "roompitch-pathtraced.png"; a.click();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="ptTitle" className="sheet2">
      <div className="mhead"><h3 id="ptTitle">{t("ptTitle")}</h3><span className={"mstatus" + (st.phase === "error" || st.phase === "nogpu" ? " err" : "")} aria-live="polite">{status}</span></div>
      <div className="pt-stage" ref={host}>
        {st.phase !== "tracing" && st.phase !== "done" && <div className="spin">{status}</div>}
        {started && <progress max={MAX} value={st.phase === "done" ? MAX : st.samples} aria-label={t("ptProgress")}/>}
      </div>
      <p className="pt-note">{t("ptNote")}</p>
      <div className="acts2">
        <label className="pt-hd" title={t("ptHdTip")}>
          <input type="checkbox" checked={hd} onChange={e => pickSize(e.target.checked)}/>
          <span>{t("ptHd", {w:HD.w, h:HD.h})}</span>
        </label>
        {started && <label className="pt-bright"><span>{t("ptBright")}</span>
          <input type="range" min="-1" max="3" step="0.25" value={stops} disabled={!job.current}
            onChange={e => { const v = Number(e.target.value); setStops(v); job.current?.exposure(v); }}/>
          <output className="num">{(stops > 0 ? "+" : "") + stops}</output>
        </label>}
        {st.phase === "done" && <label className="pt-bright" title={t("ptGrainTip")}><span>{t("ptGrain")}</span>
          <input type="range" min="0" max="1" step="0.05" value={removal}
            onChange={e => { const v = Number(e.target.value); setRemoval(v); job.current?.grain(v); }}/>
          <output className="num">{Math.round(removal * 100)}%</output>
        </label>}
        {st.phase === "tracing" && <button className="btn" type="button" onClick={() => { job.current?.pause(!paused); setPaused(!paused); }}>{t(paused ? "ptResume" : "ptPause")}</button>}
        {st.phase === "tracing" && st.samples >= 8 && <button className="btn" type="button" title={t("ptFinishTip")} onClick={() => { job.current?.finish(); setPaused(false); }}>{t("ptFinish")}</button>}
        {started
          ? <>
              <button className="btn" type="button" onClick={() => setRun(r => r + 1)}>{t("ptRestart")}</button>
              <button className="btn primary" type="button" disabled={st.phase !== "tracing" && st.phase !== "denoising" && st.phase !== "done"} onClick={save}>{t("saveImg")}</button>
            </>
          : <button className="btn primary" type="button" data-autofocus disabled={st.phase === "nogpu"} onClick={() => setRun(r => r + 1)}>{t("ptStart")}</button>}
        <button className="btn" type="button" onClick={onClose}>{t("back")}</button>
      </div>
    </Modal>
  );
}
