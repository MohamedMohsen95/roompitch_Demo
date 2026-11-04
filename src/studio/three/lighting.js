// Lighting moods the designer can pick in the view bar (ui/ViewBar.tsx).
// Each preset sets the HDRI (image-based light and reflections), a tint and strength for the sun
// (whose position and natural colour come from the time of day, see sun.js), the soft fill light
// and the camera exposure, plus how the light is described to the AI renderer.
//
// Add a mood: download a 1K .hdr from https://polyhaven.com/hdris into public/hdri/
// and add an entry below. `hdri: null` uses a neutral environment generated in code.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { renderer, scene, fill, shown } from "./scene.js";
import { updateSun } from "./sun.js";
import { S } from "../state.js";
import { wallsOf, wallFrame } from "../geometry.js";

export const LIGHTING = [
  {id:"daylight", name:"Daylight", hdri:"garden_nook_1k", env:.75, live:2.6, exposure:1.1,
   sun:{color:0xffffff, intensity:3}, fill:{sky:0xffffff, ground:0x8a8178, intensity:.85},
   prompt:"Soft natural daylight from the window"},
  {id:"warm", name:"Warm interior", hdri:"lebombo_1k", env:.75, live:.8, exposure:1.15,
   sun:{color:0xffd2a6, intensity:3}, fill:{sky:0xffe0bd, ground:0x8a6248, intensity:.75},
   prompt:"Warm, cosy late-afternoon light with golden tones"},
  {id:"studio", name:"Studio (even)", hdri:null, env:.8, exposure:1.05,
   sun:{color:0xffffff, intensity:1.2}, fill:{sky:0xffffff, ground:0xb8b8b8, intensity:1.2},
   prompt:"Bright, even, neutral studio lighting with soft shadows"}
];
// env: the sky's strength in the path tracer, which sees walls block it. live: its strength in the live view,
// where the sky reaches every surface (sun clipped out, see skyWithoutSun): Daylight's sky without its sun is dim.
const DEFAULT_ID = "daylight";
const STORE_KEY = "rp_studio_lighting";

let pmrem, generatedEnv, current = LIGHTING[0], request = 0;
const envCache = new Map();   // hdri name -> Promise<prefiltered texture>
const rawEnv = new Map();     // hdri name -> the equirect HDR itself (its pixels stay in memory), for the path tracer
const brightSide = new Map(); // hdri name -> bearing of the sky's brightest side (radians, atan2(x, z))

export const SKY_MAX = 12;    // brightest sky allowed: an outdoor HDRI's own sun is clipped to this

// An outdoor HDRI has the sun in it, thousands of times brighter than the sky. The scene already has a sun
// (placed by the time of day), so the HDRI's would be a second one, lighting whichever walls face it in the
// live view (it can't be blocked there): clip it to bright sky. Float RGBA copy; the source is left as it is.
export function skyWithoutSun(tex){
  const {data, width, height} = tex.image, half = data instanceof Uint16Array;
  const read = half ? (v) => THREE.DataUtils.fromHalfFloat(v) : (v) => v;
  const n = width * height, src = data.length / n, out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++){
    const r = read(data[i * src]), g = read(data[i * src + 1]), b = read(data[i * src + 2]);
    const k = Math.min(1, SKY_MAX / Math.max(r, g, b, 1e-6));
    out[i * 4] = r * k; out[i * 4 + 1] = g * k; out[i * 4 + 2] = b * k; out[i * 4 + 3] = 1;
  }
  const t = new THREE.DataTexture(out, width, height, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.magFilter = t.minFilter = THREE.LinearFilter;
  t.flipY = tex.flipY; t.needsUpdate = true;
  return t;
}

// Which way a sky (skyWithoutSun's float RGBA) is brightest: the sum of its light's horizontal directions.
function brightestBearing({data, width:w, height:h}){
  let x = 0, z = 0;
  for (let j = 0; j < h; j += 4){
    const lat = (.5 - (j + .5) / h) * Math.PI, cl = Math.cos(lat);
    for (let i = 0; i < w; i += 4){
      const lon = ((i + .5) / w - .5) * 2 * Math.PI, k = (j * w + i) * 4;
      const lum = (.2126 * data[k] + .7152 * data[k + 1] + .0722 * data[k + 2]) * cl * cl;
      x += lum * Math.cos(lon); z += lum * Math.sin(lon);
    }
  }
  return Math.atan2(x, z);
}

// The live view's sky lights every surface by the way it faces, walls or no walls, so a wall facing its bright
// side looks lit even when it's the wall with the windows. Turn the sky so its bright side is outside the
// windows: light then seems to come in through them, and the window wall is the shaded one, as in a real room.
export function aimSky(){
  const side = brightSide.get(current.hdri);
  if (side === undefined) return;
  const walls = wallsOf(S.poly);
  let x = 0, z = 0;
  for (const o of S.openings){
    const w = walls[o.wall];
    if (o.type === "door" || !w) continue;
    const {normal} = wallFrame(w);   // into the room
    x -= normal[0] * o.width; z -= normal[1] * o.width;
  }
  scene.environmentRotation.set(0, Math.hypot(x, z) < 1e-3 ? 0 : Math.atan2(x, z) - side, 0);
}

// Download an HDRI once and pre-blur it for rough and shiny surfaces (PMREM).
function loadEnv(name){
  if (!envCache.has(name)) envCache.set(name, new Promise((resolve, reject) => {
    new HDRLoader().load(`/hdri/${encodeURIComponent(name)}.hdr`, hdr => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const sky = skyWithoutSun(hdr);
      brightSide.set(name, brightestBearing(sky.image));
      const tex = pmrem.fromEquirectangular(sky).texture;
      sky.dispose(); hdr.dispose();   // frees it on the GPU only; the path tracer (pathtrace.js) uploads it again to its own canvas
      rawEnv.set(name, hdr);
      resolve(tex);
    }, undefined, reject);
  }).catch(err => { envCache.delete(name); throw err; }));
  return envCache.get(name);
}

export const getLighting = () => current;

// The current mood's HDRI as a plain equirect texture, for the path tracer (it can't use the pre-blurred one).
// null for a mood without an HDRI (Studio).
export async function equirectEnv(){
  const p = current;
  if (!p.hdri) return null;
  await envReady;
  await loadEnv(p.hdri);
  return rawEnv.get(p.hdri) || null;
}

// Lights and exposure change at once; the HDRI swaps in when it has loaded (the first time
// only; after that it's cached). Until then the neutral generated environment is used.
export async function setLighting(id){
  const p = LIGHTING.find(l => l.id === id) || LIGHTING[0];
  const mine = ++request;
  current = p;
  try { localStorage.setItem(STORE_KEY, p.id); } catch {}
  await envReady;
  if (mine !== request) return;

  renderer.toneMappingExposure = p.exposure;
  updateSun();   // sun tint/strength
  fill.color.setHex(p.fill.sky); fill.groundColor.setHex(p.fill.ground); fill.intensity = p.fill.intensity;

  if (!p.hdri){ scene.environment = generatedEnv; scene.environmentIntensity = p.env; scene.environmentRotation.set(0, 0, 0); return; }
  if (!envCache.has(p.hdri)){ scene.environment = generatedEnv; scene.environmentIntensity = .35; }
  try {
    const tex = await loadEnv(p.hdri);
    if (mine !== request) return;   // the designer picked something else meanwhile
    scene.environment = tex; scene.environmentIntensity = p.live; aimSky();
  } catch (err){
    console.warn(`Lighting "${p.name}": HDRI not loaded, using the neutral environment`, err);
  }
}

// Pre-blurring an environment compiles its shaders on the spot, freezing the page for most of a second, so it
// waits until the 3D view first shows (not on the New room screen, where nothing is drawn).
let envReady = null;
export function initLighting(){
  if (envReady) return;
  envReady = shown.then(() => {
    pmrem = new THREE.PMREMGenerator(renderer);
    generatedEnv = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  });

  // ?lighting=warm in the address wins, then the last choice on this device, then Daylight.
  let saved = null; try { saved = localStorage.getItem(STORE_KEY); } catch {}
  setLighting(new URLSearchParams(location.search).get("lighting") || saved || DEFAULT_ID);
}

