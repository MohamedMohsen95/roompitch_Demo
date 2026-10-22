// Lighting moods the designer can pick in the 3D panel.
// Each preset sets the HDRI (image-based light and reflections), a tint and strength for the sun
// (whose position and natural colour come from the time of day, see sun.js), the soft fill light
// and the camera exposure, plus how the light is described to the AI renderer.
//
// Add a mood: download a 1K .hdr from https://polyhaven.com/hdris into public/hdri/
// and add an entry below. `hdri: null` uses a neutral environment generated in code.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { renderer, scene, fill } from "./scene.js";
import { updateSun } from "./sun.js";
import { $ } from "../utils.js";

export const LIGHTING = [
  {id:"daylight", name:"Daylight", hdri:"photo_studio_loft_hall_1k", env:.75, exposure:1.1,
   sun:{color:0xffffff, intensity:3}, fill:{sky:0xffffff, ground:0x8a8178, intensity:.85},
   prompt:"Soft natural daylight from the window"},
  {id:"warm", name:"Warm interior", hdri:"lebombo_1k", env:.75, exposure:1.15,
   sun:{color:0xffd2a6, intensity:3}, fill:{sky:0xffe0bd, ground:0x8a6248, intensity:.75},
   prompt:"Warm, cosy late-afternoon light with golden tones"},
  {id:"studio", name:"Studio (even)", hdri:null, env:.8, exposure:1.05,
   sun:{color:0xffffff, intensity:1.2}, fill:{sky:0xffffff, ground:0xb8b8b8, intensity:1.2},
   prompt:"Bright, even, neutral studio lighting with soft shadows"}
];
const DEFAULT_ID = "daylight";
const STORE_KEY = "rp_studio_lighting";

let pmrem, generatedEnv, current = LIGHTING[0], request = 0;
const envCache = new Map();   // hdri name -> Promise<prefiltered texture>

// Download an HDRI once and pre-blur it for rough and shiny surfaces (PMREM).
function loadEnv(name){
  if (!envCache.has(name)) envCache.set(name, new Promise((resolve, reject) => {
    new HDRLoader().load(`hdri/${encodeURIComponent(name)}.hdr`, hdr => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const tex = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      resolve(tex);
    }, undefined, reject);
  }).catch(err => { envCache.delete(name); throw err; }));
  return envCache.get(name);
}

export const getLighting = () => current;

// Lights and exposure change at once; the HDRI swaps in when it has loaded (the first time
// only; after that it's cached). Until then the neutral generated environment is used.
export async function setLighting(id){
  const p = LIGHTING.find(l => l.id === id) || LIGHTING[0];
  const mine = ++request;
  current = p;
  try { localStorage.setItem(STORE_KEY, p.id); } catch {}
  const sel = $("#lighting"); if (sel) sel.value = p.id;

  renderer.toneMappingExposure = p.exposure;
  updateSun();   // sun tint/strength
  fill.color.setHex(p.fill.sky); fill.groundColor.setHex(p.fill.ground); fill.intensity = p.fill.intensity;

  if (!p.hdri){ scene.environment = generatedEnv; scene.environmentIntensity = p.env; return; }
  if (!envCache.has(p.hdri)){ scene.environment = generatedEnv; scene.environmentIntensity = .35; }
  try {
    const tex = await loadEnv(p.hdri);
    if (mine !== request) return;   // the designer picked something else meanwhile
    scene.environment = tex; scene.environmentIntensity = p.env;
  } catch (err){
    console.warn(`Lighting "${p.name}": HDRI not loaded, using the neutral environment`, err);
  }
}

export function initLighting(){
  pmrem = new THREE.PMREMGenerator(renderer);
  generatedEnv = pmrem.fromScene(new RoomEnvironment(), .04).texture;

  const sel = $("#lighting");
  sel.innerHTML = LIGHTING.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
  sel.addEventListener("change", () => setLighting(sel.value));

  // ?lighting=warm in the address wins, then the last choice on this device, then Daylight.
  let saved = null; try { saved = localStorage.getItem(STORE_KEY); } catch {}
  setLighting(new URLSearchParams(location.search).get("lighting") || saved || DEFAULT_ID);
}
