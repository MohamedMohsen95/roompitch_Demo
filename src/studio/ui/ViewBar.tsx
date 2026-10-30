// View settings for the 3D panel's header: the camera views, and a "Light & sun" popover with the
// lighting mood and the sun (time, orientation, season). Sun changes are saved with the room; the plan's north arrow follows them.
import { S } from "../state.js";
import { notify } from "../store.js";
import { saveRoom } from "../room-store.js";
import { t } from "../i18n.js";
import { LIGHTING, getLighting, setLighting } from "../three/lighting.js";
import { FACINGS, SEASONS, sunAngles, updateSun, formatTime } from "../three/sun.js";
import { setCam } from "../three/scene.js";
import { useStudio } from "./hooks";
import Menu from "./Menu";
import { IconSun } from "./Icons";

// The preset views glide there (and end a walk). Walking has its own button (WalkIntro.tsx).
export function CameraViews(){
  useStudio();
  return (
    <div className="segbar" role="group" aria-label={t("camView")}>
      <button type="button" onClick={() => setCam("corner")}>{t("camCorner")}</button>
      <button type="button" onClick={() => setCam("door")}>{t("camDoor")}</button>
      <button type="button" onClick={() => setCam("top")}>{t("camTop")}</button>
    </div>
  );
}

export function LightMenu(){
  const sunChanged = () => { updateSun(); notify(); saveRoom(); };
  const {alt} = sunAngles(S.sun.time, S.sun.season);
  return (
    <Menu label={`${t("lightSun")}: ${t("light_" + getLighting().id)}`} kind="popover" className="btn ghost small"
      face={<><IconSun/><bdi className="num">{formatTime(S.sun.time)}</bdi></>}>
      {() => (
        <div className="lightpanel">
          <label className="lp-row"><span>{t("lighting")}</span>
            <select value={getLighting().id} onChange={e => { setLighting(e.target.value); notify(); }}>
              {LIGHTING.map(l => <option key={l.id} value={l.id}>{t("light_" + l.id)}</option>)}
            </select>
          </label>
          <label className="lp-row lp-time"><span>{t("sun")}</span>
            <output className="num" title={alt > 0 ? t("sunUp", {n:Math.round(alt)}) : t("sunSet")}>{formatTime(S.sun.time)}{alt > 0 ? "" : " ☾"}</output>
            <input type="range" min="5" max="20" step="0.25" aria-label={t("sunTimeAria")} value={S.sun.time}
              onChange={e => { S.sun.time = Number(e.target.value); sunChanged(); }}/>
          </label>
          <label className="lp-row"><span>{t("facing")}</span>
            <select value={S.sun.facing} onChange={e => { S.sun.facing = e.target.value; sunChanged(); }}>
              {FACINGS.map(f => <option key={f} value={f}>{t("dir" + f)}</option>)}
            </select>
          </label>
          <label className="lp-row"><span>{t("season")}</span>
            <select value={S.sun.season} onChange={e => { S.sun.season = e.target.value; sunChanged(); }}>
              {Object.keys(SEASONS).map(k => <option key={k} value={k}>{t("season_" + k)}</option>)}
            </select>
          </label>
        </div>
      )}
    </Menu>
  );
}
