// Photo path of the "New room" screen: add photos, tag each with a wall, ask the AI for doors and windows.
import { useRef, useState } from "react";
import { t } from "../../i18n.js";
import { addPhotos, applyAnalysis } from "../../setup/draft.js";

// The access code is shared with the photo page's studio settings.
const getCode = () => { try { return JSON.parse(localStorage.getItem("rp_settings") || "{}").accessCode || ""; } catch { return ""; } };
const setCode = (v: string) => { try { const s = JSON.parse(localStorage.getItem("rp_settings") || "{}"); s.accessCode = v; localStorage.setItem("rp_settings", JSON.stringify(s)); } catch { /* ignore */ } };

// Downscale to at most 1024 px on the long side, as JPEG.
function readPhoto(file: File): Promise<string>{
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", .88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}

type Props = {
  draft: any;
  walls: {i: number, lenCm: number}[];
  active: string | null;
  setActive: (id: string | null) => void;
  redraw: () => void;
};

export default function PhotosSection({draft, walls, active, setActive, redraw}: Props){
  const [status, setStatus] = useState<{text: string, err: boolean}>({text:"", err:false});
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCodeText] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const say = (text: string, err = false) => setStatus({text, err});

  async function addFiles(list: FileList | null){
    const files = [...(list || [])].filter(f => f.type.startsWith("image/"));
    const read: {id: string, dataUrl: string}[] = [];
    for (const f of files){ try { read.push({id:"p" + Date.now().toString(36) + read.length, dataUrl:await readPhoto(f)}); } catch { /* skip non-images */ } }
    const r = addPhotos(draft, read);
    if (r.added) setActive(draft.photos[draft.photos.length - r.added].id);
    say(r.skipped ? t("tooMany", {n:r.skipped}) : "", Boolean(r.skipped));
    redraw();
  }

  async function analyze(){
    const tagged = draft.photos.filter((p: any) => p.wall != null);
    if (!tagged.length){ say(t("needTag"), true); return; }
    setBusy(true); setNeedCode(false);
    let found = 0;
    try {
      for (let i = 0; i < tagged.length; i++){
        say(t("analyzing", {i:i + 1, n:tagged.length}));
        let r;
        try {
          r = await fetch("/api/analyze", {method:"POST", headers:{"Content-Type":"application/json", "x-access-code":getCode()}, body:JSON.stringify({image:tagged[i].dataUrl})});
        } catch { say(t("noServer"), true); return; }
        if (r.status === 401){ setNeedCode(true); say(t("enterCode"), true); setTimeout(() => codeRef.current?.focus()); return; }
        const data = await r.json().catch(() => ({}));
        if (r.status === 503){ say(t("analysisOff"), true); return; }
        if (!r.ok){ say(data.error || t("wentWrong", {s:r.status}), true); return; }
        found += applyAnalysis(draft, tagged[i].wall, data.openings || []);
        redraw();
      }
      const skipped = draft.photos.length - tagged.length;
      say((found ? t("analyzeDone", {n:found}) : t("analyzeNone")) + (skipped ? " " + t("untagged", {n:skipped}) : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sblock">
      <h2>{t("photosTitle")}</h2>
      <p className="dnote">{t("photosHint")}</p>
      <div className="acts2">
        <label className="btn filebtn"><span>{t("addPhotos")}</span>
          <input type="file" accept="image/*" multiple onChange={e => { addFiles(e.target.files); e.target.value = ""; }}/>
        </label>
      </div>
      <div className="photos">
        {draft.photos.map((p: any) => (
          <figure key={p.id} className={"ph" + (p.id === active ? " on" : "")}>
            <img src={p.dataUrl} alt="" onClick={() => setActive(p.id)}/>
            <figcaption>
              <select aria-label={t("onWall")} value={p.wall ?? ""}
                onChange={e => { p.wall = e.target.value === "" ? null : Number(e.target.value); setActive(p.id); redraw(); }}>
                <option value="">{t("whichWall")}</option>
                {walls.map(w => <option key={w.i} value={w.i}>{t("wallN", {n:w.i + 1})}</option>)}
              </select>
              <button className="btn small" type="button" onClick={() => {
                draft.photos = draft.photos.filter((x: any) => x.id !== p.id);
                if (active === p.id) setActive(null);
                redraw();
              }}>{t("removePhoto")}</button>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="acts2"><button className="btn primary" id="analyzeBtn" type="button" disabled={busy || !draft.photos.length} onClick={analyze}>{t("analyze")}</button></div>
      <p className={"dnote" + (status.err ? " err" : "")} role="status">{status.text}</p>
      {needCode && (
        <div className="coderow">
          <label htmlFor="accessCode2">{t("accessLabel")}</label>
          <input id="accessCode2" ref={codeRef} type="password" autoComplete="off" value={code} onChange={e => setCodeText(e.target.value)}/>
          <button className="btn" type="button" onClick={() => { setCode(code.trim()); analyze(); }}>{t("send")}</button>
        </div>
      )}
    </section>
  );
}
