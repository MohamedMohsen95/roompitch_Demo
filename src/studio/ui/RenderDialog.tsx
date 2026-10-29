// "Photoreal render": the snapshot of the 3D view next to the AI's render (render-ai.js does the work).
import { useEffect, useRef, useState } from "react";
import { getCfg, newJob, sendJob, setCode, providerName } from "../render-ai.js";
import { t } from "../i18n.js";
import Modal from "./Modal";

type View = {spin: string | null, image: string | null, status: string, err: boolean, needCode: boolean};
const START: View = {spin:null, image:null, status:"", err:false, needCode:false};

export default function RenderDialog({open, onClose}: {open: boolean, onClose: () => void}){
  const job = useRef<any>(null);
  const [shot, setShot] = useState<{src: string, prompt: string} | null>(null);
  const [v, setV] = useState<View>(START);
  const [code, setCodeText] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  async function run(){
    setV({...START, spin:t("rendering")});
    const c = await getCfg();
    if (!job.current) job.current = await newJob();
    setShot({src:job.current.shot.full, prompt:job.current.prompt});
    if (!c.aiEnabled) return setV({...START, spin:c.offline ? t("offline") : t("noKeys"), status:t("renderOff"), err:true});
    setV(x => ({...x, status:t("sending", {p:providerName(c.provider)})}));
    try {
      const r = await sendJob(job.current);
      if (r.needCode){ setV({...START, spin:t("codeNeeded"), status:t("enterCode"), err:true, needCode:true}); setTimeout(() => codeRef.current?.focus()); return; }
      if (!r.image) return setV({...START, spin:r.error || t("wentWrong", {s:r.status}), status:t("failed"), err:true});
      setV({...START, image:r.image, status:t("done", {s:r.secs, p:providerName(c.provider)})});
    } catch {
      setV({...START, spin:t("noServer"), status:t("failed"), err:true});
    }
  }

  // A new scene each time the dialog opens; "Render again" keeps it.
  useEffect(() => { if (open){ job.current = null; setShot(null); run(); } }, [open]);

  return (
    <Modal open={open} onClose={onClose} labelledBy="mTitle" className="sheet2">
      <div className="mhead"><h3 id="mTitle">{t("mTitle")}</h3><span className={"mstatus" + (v.err ? " err" : "")}>{v.status}</span></div>
      <div className="pair">
        <figure>{shot && <img src={shot.src} alt={t("shotAlt")}/>}<figcaption>{t("sceneCap")}</figcaption></figure>
        <figure>
          <div className="out">{v.image ? <img src={v.image} alt={t("outAlt")}/> : <div className="spin">{v.spin}</div>}</div>
          <figcaption>{t("aiCap")}</figcaption>
        </figure>
      </div>
      {v.needCode && (
        <div className="coderow">
          <label htmlFor="accessCode">{t("accessLabel")}</label>
          <input id="accessCode" ref={codeRef} type="password" autoComplete="off" value={code} onChange={e => setCodeText(e.target.value)}/>
          <button className="btn" type="button" onClick={() => { setCode(code.trim()); run(); }}>{t("send")}</button>
        </div>
      )}
      <details><summary>{t("promptSum")}</summary><p dir="ltr">{shot?.prompt}</p></details>
      <div className="acts2">
        <button className="btn primary" type="button" onClick={run}>{t("again")}</button>
        {v.image && <a className="btn" href={v.image} download="roompitch-render.jpg">{t("saveImg")}</a>}
        <button className="btn" type="button" onClick={onClose}>{t("back")}</button>
      </div>
    </Modal>
  );
}
