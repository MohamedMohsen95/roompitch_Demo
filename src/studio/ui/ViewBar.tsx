// View settings, shared by the plan and the 3D view: lighting mood, the sun (time, orientation, season)
// and the camera. Sun changes are saved with the room; the plan's north arrow follows them.
import { S } from "../state.js";
import { notify } from "../store.js";
import { saveRoom } from "../room-store.js";
import { t } from "../i18n.js";
import { LIGHTING, getLighting, setLighting } from "../three/lighting.js";
import { FACINGS, SEASONS, sunAngles, updateSun, formatTime } from "../three/sun.js";
import { setCam } from "../three/scene.js";

export default function ViewBar(){
  const sunChanged = () => { updateSun(); notify(); saveRoom(); };
  const {alt} = sunAngles(S.sun.time, S.sun.season);
  return (
    <div className="viewbar" role="toolbar" aria-label={t("viewSettings")}>
      <label><span>{t("lighting")}</span>
        <select aria-label={t("lighting")} value={getLighting().id} onChange={e => { setLighting(e.target.value); notify(); }}>
          {LIGHTING.map(l => <option key={l.id} value={l.id}>{t("light_" + l.id)}</option>)}
        </select>
      </label>
      <span className="sep" aria-hidden="true"/>
      <label className="sun-time"><span>{t("sun")}</span>
        <input type="range" min="5" max="20" step="0.25" aria-label={t("sunTimeAria")} value={S.sun.time}
          onChange={e => { S.sun.time = Number(e.target.value); sunChanged(); }}/>
        <output title={alt > 0 ? t("sunUp", {n:Math.round(alt)}) : t("sunSet")}>{formatTime(S.sun.time)}{alt > 0 ? "" : " ☾"}</output>
      </label>
      <label><span>{t("facing")}</span>
        <select aria-label={t("facing")} value={S.sun.facing} onChange={e => { S.sun.facing = e.target.value; sunChanged(); }}>
          {FACINGS.map(f => <option key={f} value={f}>{t("dir" + f)}</option>)}
        </select>
      </label>
      <label><span>{t("season")}</span>
        <select aria-label={t("season")} value={S.sun.season} onChange={e => { S.sun.season = e.target.value; sunChanged(); }}>
          {Object.keys(SEASONS).map(k => <option key={k} value={k}>{t("season_" + k)}</option>)}
        </select>
      </label>
      <span className="sep" aria-hidden="true"/>
      <span className="cams"><span>{t("camView")}</span><span className="seg">
        <button className="btn" type="button" onClick={() => setCam("corner")}>{t("camCorner")}</button>
        <button className="btn" type="button" onClick={() => setCam("door")}>{t("camDoor")}</button>
        <button className="btn" type="button" onClick={() => setCam("top")}>{t("camTop")}</button>
      </span></span>
    </div>
  );
}
