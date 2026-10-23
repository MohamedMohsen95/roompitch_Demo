// The sun: where it is for a time of day, season and room orientation, and how it looks.
//
// S.sun = {time, facing, season}
//   time    hours, e.g. 15.5 = 15:30 (solar time)
//   facing  compass direction the top of the plan faces: "N", "NE", ... "NW"
//   season  "summer" | "equinox" | "winter"
// Latitude is Cairo's; the lighting mood (lighting.js) tints and scales the sun on top of this.
import * as THREE from "three";
import { S } from "../state.js";
import { sun } from "./scene.js";
import { getLighting } from "./lighting.js";
import { wallsOf, wallFrame } from "../geometry.js";
import { t } from "../i18n.js";

export const LATITUDE = 30.04;
export const FACINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const SEASONS = {summer:{decl:23.44}, equinox:{decl:0}, winter:{decl:-23.44}};   // sun declination

const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;

// Sun altitude above the horizon and azimuth (compass bearing, clockwise from north), in degrees.
export function sunAngles(time, season){
  const phi = rad(LATITUDE), dec = rad(SEASONS[season].decl), h = rad((time - 12) * 15);
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h);
  const alt = Math.asin(sinAlt);
  const cosAz = (Math.sin(dec) - sinAlt * Math.sin(phi)) / (Math.cos(alt) * Math.cos(phi));
  let az = deg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (h > 0) az = 360 - az;   // afternoon: west of south
  return {alt:deg(alt), az};
}

// Sun bearing relative to the room, in degrees clockwise from "straight behind the back wall".
export function sunRelative(){
  const {az} = sunAngles(S.sun.time, S.sun.season);
  return ((az - FACINGS.indexOf(S.sun.facing) * 45) % 360 + 360) % 360;
}

const LOW = new THREE.Color(0xffa45c), HIGH = new THREE.Color(0xfff4e6), tmp = new THREE.Color();

// Place the directional light and set its colour/strength. Called after room or lighting changes.
export function updateSun(){
  const {alt} = sunAngles(S.sun.time, S.sun.season), rel = rad(sunRelative());
  const {L, W, H} = S, r = Math.hypot(L, W, H) / 2 + .6;
  // plan "up" (behind the back wall) is -z, clockwise turns towards +x
  const dir = new THREE.Vector3(Math.cos(rad(alt)) * Math.sin(rel), Math.sin(rad(alt)), -Math.cos(rad(alt)) * Math.cos(rel));
  sun.target.position.set(0, H / 2, 0);
  sun.position.copy(dir).multiplyScalar(r * 3).add(sun.target.position);
  Object.assign(sun.shadow.camera, {left:-r, right:r, top:r, bottom:-r, near:.1, far:r * 6});
  sun.shadow.camera.updateProjectionMatrix();

  // warm and weak near the horizon, white and full strength once it's high; off at night
  const p = getLighting();
  tmp.copy(LOW).lerp(HIGH, Math.min(1, Math.max(0, alt / 35)));
  sun.color.copy(tmp).multiply(new THREE.Color(p.sun.color));
  sun.intensity = alt <= 0 ? 0 : p.sun.intensity * Math.min(1, alt / 12);
}

// Words for the AI prompt, e.g. "late-afternoon sun (16:30) from the back-right".
export function sunWords(){
  const {alt} = sunAngles(S.sun.time, S.sun.season);
  if (alt <= 0) return "after sunset, no direct sunlight";
  const t = S.sun.time, when = t < 9 ? "early-morning" : t < 11.5 ? "morning" : t < 14 ? "midday" : t < 16.5 ? "afternoon" : "late-afternoon";
  const rel = sunRelative();
  // Each wall's outward direction as an angle like the sun's (0° = top of the plan, clockwise).
  const ws = wallsOf(S.poly), out = ws.map(w => { const {normal} = wallFrame(w); return deg(Math.atan2(-normal[0], normal[1])); });
  const facingSun = (i) => Math.cos(rad(rel - out[i]));
  const from = ws.reduce((b, w) => facingSun(w.i) > facingSun(b.i) ? w : b, ws[0]).i;
  // walls with windows (or glass doors) that face the sun
  const lit = [...new Set(S.openings.filter(o => o.type !== "door" && facingSun(o.wall) > .15).map(o => o.wall))].sort((a, b) => a - b);
  const enters = lit.length
    ? `, shining in through the window${lit.length > 1 ? "s" : ""} on wall${lit.length > 1 ? "s" : ""} ${lit.map(i => i + 1).join(" and ")}`
    : ", outside the windows, so no direct sunlight enters";
  return `${when} sun (${formatTime(t)}) coming from beyond wall ${from + 1}${alt < 20 ? ", low and warm, casting long shadows" : ""}${enters}`;
}

// The Sun bar under the 3D header. `onChange` runs after every change (plan compass, saving).
// Returns `refresh`, to call after the language changes or a saved room is restored.
export function initSunControls(onChange){
  const time = document.getElementById("sunTime"), out = document.getElementById("sunTimeOut");
  const facing = document.getElementById("sunFacing"), season = document.getElementById("sunSeason");
  const show = () => {
    facing.innerHTML = FACINGS.map(f => `<option value="${f}">${t("dir" + f)}</option>`).join("");
    season.innerHTML = Object.keys(SEASONS).map(k => `<option value="${k}">${t("season_" + k)}</option>`).join("");
    time.value = S.sun.time; facing.value = S.sun.facing; season.value = S.sun.season;
    const {alt} = sunAngles(S.sun.time, S.sun.season);
    out.textContent = alt > 0 ? formatTime(S.sun.time) : `${formatTime(S.sun.time)} ☾`;
    out.title = alt > 0 ? t("sunUp", {n:Math.round(alt)}) : t("sunSet");
  };
  const changed = () => { show(); updateSun(); onChange?.(); };
  time.addEventListener("input", () => { S.sun.time = +time.value; changed(); });
  facing.addEventListener("change", () => { S.sun.facing = facing.value; changed(); });
  season.addEventListener("change", () => { S.sun.season = season.value; changed(); });
  show();
  return show;
}

export const formatTime = (t) => `${String(Math.floor(t)).padStart(2, "0")}:${String(Math.round((t % 1) * 60)).padStart(2, "0")}`;
