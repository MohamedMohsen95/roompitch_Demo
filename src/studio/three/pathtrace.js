// Path-traced still of the 3D view (the "Path-traced" dialog, ui/PathTraceDialog.tsx).
// The live view rasterizes: each triangle is coloured with formulas, 60 times a second. This instead
// follows light rays as they bounce around the room (three-gpu-pathtracer on WebGPU, on the designer's own
// GPU), a round of samples per frame: grainy at first, every round averages in more light.
//
// Two things make an interior come out clean, as in V-Ray or Corona:
// - Window portals: a soft area light over each window, facing in. Sky light can only reach the room through
//   the windows; without them a ray from a dark corner has to find a window by chance, so the corners stay
//   dark and speckled for hundreds of passes. With them every point asks the windows directly.
// - A denoiser (Intel Open Image Denoise, a neural network on the GPU) once the passes are done: it removes the
//   remaining grain, guided by the colours and shapes of the surfaces so edges and textures stay sharp. Those
//   guides are rasterized, so noise-free: the "clean aux" model trusts them most and keeps the most texture.
//   A fully denoised image still reads a little plastic, so the result is a blend of it and the raw trace
//   ("Grain removal"), keeping a trace of real grain the way a photograph has.
//
// It renders the scene the live view shows, from the same camera, on a canvas of its own (a separate WebGPU
// renderer). The dialog loads this module only when it opens: WebGPU three.js, the tracer and the denoiser
// are a large download. The denoiser's weights are public/oidn/rt_hdr_calb_cnrm.tza (1.8 MB, from
// RenderKit/oidn-weights, Apache-2.0), fetched when the passes are done. (The "_large" model hung an
// integrated GPU long enough for Windows to reset it.)
import * as THREE from "three";
import { WebGPURenderer, RectAreaLightNode, AgXToneMapping, DataTexture, EquirectangularReflectionMapping, FloatType, LinearFilter, RGBAFormat } from "three/webgpu";
import { WebGPUPathTracer, OIDNDenoiser } from "three-gpu-pathtracer/webgpu";
import { initUNetFromURL } from "oidn-web";
import { RectAreaLightTexturesLib } from "three/addons/lights/RectAreaLightTexturesLib.js";
import { S } from "../state.js";
import { wallsOf, wallFrame, alongWall } from "../geometry.js";
import { renderer, scene, camera, loop } from "./scene.js";
import { toWorld } from "./room.js";
import { getLighting, equirectEnv, skyWithoutSun } from "./lighting.js";

const PORTAL_NITS = 6;   // how bright the sky looks through a window, before the mood's exposure
const MIN_ROUGHNESS = .25;   // polished scans are re-mapped to start here (see satinRoughness)

// The live view keeps polished scans (herringbone parquet averages roughness 0.1) from looking like mirrors
// with a shader floor (photo-tex.js) the tracer can't see, so here their roughness maps are re-mapped instead:
// 0..1 becomes 0.25..1, keeping the scan's variation. Varnished wood then has a soft satin sheen with real,
// blurred reflections. Swapped in while the tracer reads the scene, and put back.
const satinMaps = new Map();   // source image -> re-mapped canvas
function satinRoughness(tex){
  const img = tex.image;
  if (!img?.width) return null;
  let cv = satinMaps.get(img);
  if (!cv){
    cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const x = cv.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, cv.width, cv.height), p = d.data;
    for (let i = 1; i < p.length; i += 4) p[i] = Math.round(255 * MIN_ROUGHNESS + p[i] * (1 - MIN_ROUGHNESS));   // G = roughness
    x.putImageData(d, 0, 0);
    satinMaps.set(img, cv);
  }
  const t = tex.clone(); t.image = cv; t.needsUpdate = true;
  return t;
}

// Studio mood (no HDRI): a soft sky, white above and warm grey below.
function gradientEnv(){
  const w = 4, h = 32, data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++){
    const k = y / (h - 1);   // 0 = bottom row
    const c = [.85 + .15 * k, .82 + .18 * k, .78 + .22 * k];
    for (let x = 0; x < w; x++) data.set([...c, 1], (y * w + x) * 4);
  }
  const t = new DataTexture(data, w, h, RGBAFormat, FloatType);
  t.mapping = EquirectangularReflectionMapping; t.magFilter = t.minFilter = LinearFilter; t.needsUpdate = true;
  return t;
}

// An area light just inside each window and glass door, the size of the opening, shining into the room.
// (Doors are closed leaves, so they get none.)
function windowPortals(color){
  const g = new THREE.Group(), walls = wallsOf(S.poly);
  for (const o of S.openings){
    const w = walls[o.wall];
    if (o.type !== "window" || !w) continue;
    const {normal} = wallFrame(w), c = alongWall(w, o.offset + o.width / 2);
    const [x, z] = toWorld(c[0] + normal[0] * .02, c[1] + normal[1] * .02), y = o.sill + o.height / 2;
    const l = new THREE.RectAreaLight(color, PORTAL_NITS, Math.max(.1, o.width - .06), Math.max(.1, o.height - .06));
    l.position.set(x, y, z);
    l.lookAt(x + normal[0], y, z + normal[1]);
    g.add(l);
  }
  return g;
}

// Start a path-traced render into `host`. onStatus({phase, samples}) is called as it goes; phase is
// "preparing" | "tracing" | "denoising" | "done" | "error", samples the average passes per pixel.
// Returns {stops, exposure(stops), grain(k), pause(on), finish(), save(), dispose()}.
/** @param {HTMLElement} host @param {{maxSamples?: number, removal?: number, onStatus?: (s: {phase: "preparing"|"tracing"|"denoising"|"done"|"error", samples: number}) => void}} [opts] */
export function startPathTrace(host, {maxSamples = 128, removal = .75, onStatus = (s) => {}} = {}){
  // A landscape picture at least 3:2: from the same camera, a narrow 3D panel just shows more of the room
  // to each side. As big as fits the dialog (its width, about 60% of the window's height). Every pixel is
  // traced, so the pixel ratio stays modest: 1.5 at most.
  const aspect = Math.max(camera.aspect, 1.5);
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const maxW = Math.max(320, host.clientWidth), maxH = Math.max(240, window.innerHeight * .6);
  const w = Math.round(Math.min(maxW, maxH * aspect)), h = Math.round(w / aspect);

  const gpu = new WebGPURenderer({antialias:false});
  gpu.setPixelRatio(dpr);
  gpu.setSize(w, h);
  gpu.toneMapping = AgXToneMapping;
  // Brightness, in stops over the live view's exposure. At eye level (below the ceiling) the light comes in
  // through the windows only, so it starts 1.5 stops brighter, as a photographer would open up indoors.
  const eyeLevel = camera.position.y < S.H;
  const stops = eyeLevel ? 1.5 : 0, base = renderer.toneMappingExposure;
  gpu.toneMappingExposure = base * 2 ** stops;

  const cam = camera.clone();
  cam.aspect = aspect; cam.updateProjectionMatrix();

  let pt = null, raf = 0, poll = 0, paused = false, disposed = false, gradient = null, sky = null, portals = null, last = 0;
  const swapped = [];   // [material, its roughness map, the re-mapped one] (freed on close)
  // The finished picture: raw trace and denoised version blended on a 2D canvas, which takes the WebGPU
  // canvas's place once denoising is done.
  const out = document.createElement("canvas"), ctx = out.getContext("2d");
  let raw = null, clean = null;
  const shot = async () => { pt.renderSample(); const img = new Image(); img.src = gpu.domElement.toDataURL("image/png"); await img.decode(); return img; };
  // Both versions, at the current brightness. The tracer shows the denoised image once it has one, so for
  // the raw one it is briefly unhooked. (_denoiser is the tracer's own field; the version is pinned.)
  async function capture(){
    const den = pt._denoiser;
    pt._denoiser = null; const r = shot(); pt._denoiser = den;
    raw = await r; clean = await shot();
  }
  function compose(){
    if (!raw || !clean) return;
    ctx.globalAlpha = 1; ctx.drawImage(raw, 0, 0);
    ctx.globalAlpha = removal; ctx.drawImage(clean, 0, 0);
  }
  // The live view stops drawing meanwhile, so the GPU is all the tracer's.
  loop.hold = true;
  // Walls and the ceiling hidden from the camera in the live view are only made see-through there (they
  // still shade the room); here they're left out while the dialog is open, so the camera can see in
  // (the denoiser draws the scene again at the end, so they stay out until then).
  // Window glass goes too: the tracer treats a see-through surface as letting each ray through or not at
  // random, which turned the window into grain and held back part of the sunlight.
  const hidden = [];
  const isGlass = (o) => o.userData.kind === "opening" && [].concat(o.material).some(m => m.transparent && m.opacity < .5);
  scene.traverse(o => { if (o.isMesh && o.visible && (o.userData.culled || isGlass(o))){ o.visible = false; hidden.push(o); } });

  (async () => {
    onStatus({phase:"preparing", samples:0});
    await gpu.init();
    if (disposed) return;
    // Without a WebGPU device (or after the GPU was reset) three falls back to WebGL, which the tracer can't use.
    if (!/** @type {any} */ (gpu.backend).isWebGPUBackend) throw new Error("No WebGPU device");
    // The denoiser draws the scene once, rasterized, to read the surfaces' colours and directions; with the
    // window portals in it that needs the area-light lookup tables.
    RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
    host.appendChild(gpu.domElement);

    // Environment: the mood's HDRI as an equirect image (the live view uses a pre-blurred version the
    // tracer can't read), or a soft gradient for Studio. The live scene isn't touched: the tracer reads a
    // stand-in that forwards to the real scene, with its own environment and the window portals added.
    const light = getLighting();
    const hdr = await equirectEnv().catch(() => null);
    if (disposed) return;
    const env = hdr ? (sky = skyWithoutSun(hdr)) : (gradient = gradientEnv());
    portals = windowPortals(new THREE.Color(light.fill.sky));
    const view = Object.create(scene);
    view.children = [...scene.children, portals];
    view.environment = env;
    view.environmentIntensity = light.env;
    // At eye level the windows show bright daylight, as an interior photograph exposed for the room does
    // (the HDRI itself is only light: shown, its low-resolution scenery looked fake). From above, the room
    // keeps the plain backdrop of the live view.
    if (eyeLevel) view.background = new THREE.Color(0xf4f7fa);

    pt = new WebGPUPathTracer(gpu);
    pt.maxBounces = 8;              // light bouncing off walls and furniture before it reaches the camera
    pt.filterGlossyFactor = .5;     // fewer bright speckles on shiny surfaces
    pt.clampIndirect = 4;           // and fewer from light bounced off them
    pt.maxSamples = maxSamples;     // it stops there, and the denoiser runs
    pt.renderDelay = 0;

    // The acceleration structure is built on the page (a fraction of a second for a room). A frame first
    // so "Preparing" shows.
    await new Promise(r => requestAnimationFrame(() => setTimeout(r)));
    if (disposed) return;
    scene.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)){
        if (!m.roughnessMap || m.customProgramCacheKey?.() !== "roughness-floor") continue;
        const t = satinRoughness(m.roughnessMap);
        if (t){ swapped.push([m, m.roughnessMap, t]); m.roughnessMap = t; }
      }
    });
    try { pt.setScene(view, cam); }
    finally { for (const [m, orig] of swapped) m.roughnessMap = orig; }
    pt.setDenoiser(new OIDNDenoiser({initUNetFromURL, auxWeightsUrl:"/oidn/rt_hdr_calb_cnrm.tza"}));

    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      if (!paused) pt.renderSample();
    };
    tick();
    // The sample count is read back from the GPU, so only a few times a second.
    const measure = async () => {
      if (disposed) return;
      const c = await pt.getSampleCountsAsync().catch(() => null);
      if (disposed) return;
      if (c){
        last = Math.max(last, Math.floor(c.avg));
        const den = pt._denoiser;
        if (den?.complete){
          cancelAnimationFrame(raf);
          await capture();
          if (disposed) return;
          out.width = gpu.domElement.width; out.height = gpu.domElement.height;
          out.style.width = gpu.domElement.style.width; out.style.height = gpu.domElement.style.height;
          compose();
          gpu.domElement.replaceWith(out);
          onStatus({phase:"done", samples:last});
          return;
        }
        onStatus({phase:c.min >= pt.maxSamples ? "denoising" : "tracing", samples:last});
      }
      poll = setTimeout(measure, 400);
    };
    measure();
  })().catch(err => { console.error("Path trace failed", err); if (!disposed) onStatus({phase:"error", samples:0}); });

  return {
    stops,
    // Applied when the image is shown, so it doesn't restart the trace.
    exposure(v){
      gpu.toneMappingExposure = base * 2 ** v;
      if (!pt || disposed) return;
      if (raw) capture().then(() => { if (!disposed) compose(); }); else pt.renderSample();
    },
    // How much of the denoised image is used, 0 to 1 (the rest is the raw trace).
    grain(k){ removal = k; compose(); },
    pause(on){ paused = on; if (pt) pt.pause = on; },
    // Stop at the passes done so far and denoise now.
    finish(){ if (!pt) return; paused = false; pt.pause = false; pt.maxSamples = Math.max(1, last); },
    // A WebGPU canvas only holds its picture until the frame ends, so draw once more and read it right away.
    save(){ if (!pt) return null; if (raw) return out.toDataURL("image/png"); pt.renderSample(); return gpu.domElement.toDataURL("image/png"); },
    dispose(){
      disposed = true; cancelAnimationFrame(raf); clearTimeout(poll);
      for (const o of hidden) o.visible = true;
      loop.hold = false;
      pt?.dispose(); gradient?.dispose(); sky?.dispose(); for (const [, , t] of swapped) t.dispose(); portals?.traverse(l => l.dispose?.());
      gpu.dispose(); gpu.domElement.remove(); out.remove();
    }
  };
}
