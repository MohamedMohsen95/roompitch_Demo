// The sun: where it is for a time of day, season and room orientation, and how it looks.
//
// S.sun = {time, facing, season}
//   time    hours, e.g. 15.5 = 15:30 (solar time)
//   facing  compass direction the back wall (top of the plan) faces outwards: "N", "NE", ... "NW"
//   season  "summer" | "equinox" | "winter"
// Latitude is Cairo's; the lighting mood (lighting.js) tints and scales the sun on top of this.
import * as THREE from "three";
import { S } from "../state.js";
import { sun } from "./scene.js";
import { getLighting } from "./lighting.js";

export const LATITUDE = 30.04;
export const FACINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const FACING_NAMES = {N:"North", NE:"North-east", E:"East", SE:"South-east", S:"South", SW:"South-west", W:"West", NW:"North-west"};
export const SEASONS = {summer:{name:"Summer", decl:23.44}, equinox:{name:"Spring / autumn", decl:0}, winter:{name:"Winter", decl:-23.44}};

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
  const sides = ["back", "back-right", "right", "front-right", "front", "front-left", "left", "back-left"];
  const from = sides[Math.round(rel / 45) % 8];
  // which walls with windows face the sun (back wall faces 0°, right 90°, front 180°, left 270°)
  const wallAngle = {n:0, e:90, s:180, w:270}, wallWord = {n:"back", e:"right-hand", s:"front", w:"left-hand"};
  const lit = [...new Set(S.openings.filter(o => o.type !== "door" && Math.cos(rad(rel - wallAngle[o.wall])) > .15).map(o => o.wall))];
  const enters = lit.length
    ? `, shining in through the window${lit.length > 1 ? "s" : ""} on the ${lit.map(k => wallWord[k]).join(" and ")} wall${lit.length > 1 ? "s" : ""}`
    : ", outside the windows, so no direct sunlight enters";
  return `${when} sun (${formatTime(t)}) coming from the ${from} of the room${alt < 20 ? ", low and warm, casting long shadows" : ""}${enters}`;
}

// The Sun bar under the 3D header. `onChange` lets the plan redraw its compass.
export function initSunControls(onChange){
  const time = document.getElementById("sunTime"), out = document.getElementById("sunTimeOut");
  const facing = document.getElementById("sunFacing"), season = document.getElementById("sunSeason");
  facing.innerHTML = FACINGS.map(f => `<option value="${f}">${FACING_NAMES[f]}</option>`).join("");
  season.innerHTML = Object.entries(SEASONS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  const show = () => {
    time.value = S.sun.time; facing.value = S.sun.facing; season.value = S.sun.season;
    const {alt} = sunAngles(S.sun.time, S.sun.season);
    out.textContent = alt > 0 ? formatTime(S.sun.time) : `${formatTime(S.sun.time)} ☾`;
    out.title = alt > 0 ? `Sun ${Math.round(alt)}° above the horizon` : "The sun has set";
  };
  time.addEventListener("input", () => { S.sun.time = +time.value; show(); updateSun(); });
  facing.addEventListener("change", () => { S.sun.facing = facing.value; show(); updateSun(); onChange?.(); });
  season.addEventListener("change", () => { S.sun.season = season.value; show(); updateSun(); });
  show();
}

export const formatTime = (t) => `${String(Math.floor(t)).padStart(2, "0")}:${String(Math.round((t % 1) * 60)).padStart(2, "0")}`;
