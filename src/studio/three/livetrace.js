// Live path tracing while walking (switched on and off by ./live.js). The same tracer as the Path-traced
// still (pathtrace.js), drawing over the 3D view from the walking camera itself: while you move it shows a
// quick, blurry low-resolution trace; as soon as you stop it sharpens pass after pass, and after MAX_SAMPLES
// passes the denoiser cleans it. The live view keeps stepping the walk (and taking the keys and pointer,
// which pass through this canvas) but stops drawing, so the GPU is all the tracer's.
// The room changing (a piece moved, a wall painted, another mood) hands the tracer the scene again.
import * as THREE from "three";
import { WebGPURenderer, AgXToneMapping } from "three/webgpu";
import { renderer, scene, camera, loop } from "./scene.js";
import { subscribe } from "../store.js";
import { getLighting } from "./lighting.js";
import { traceEnv, traceStage, newTracer, newDenoiser, needWebGPU, eyeStops, freeTracer } from "./pathtrace.js";

export const MAX_SAMPLES = 32;   // passes once you stand still; then the denoiser runs
const REBUILD_MS = 300;          // a burst of edits is handed to the tracer once

// Everything about the scene the tracer reads: which meshes, where, and how they're coloured.
function sceneKey(){
  const parts = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    parts.push(o.uuid, o.visible ? 1 : 0, ...o.matrixWorld.elements.map(v => v.toFixed(3)));
    for (const m of [].concat(o.material)) parts.push(m.uuid, m.color?.getHexString(), m.map?.uuid, m.roughness, m.metalness, m.opacity);
  });
  return parts.join();
}

/** @typedef {{phase: "preparing"|"moving"|"tracing"|"denoised"|"error", samples: number, rate: number}} LiveStatus */
/** @param {HTMLElement} host @param {{onStatus?: (s: LiveStatus) => void}} [opts] */
export function startLiveTrace(host, {onStatus = (s) => {}} = {}){
  const gpu = new WebGPURenderer({antialias:false});
  gpu.setPixelRatio(1);   // every pixel is traced: CSS pixels are plenty for a view that keeps moving
  gpu.toneMapping = AgXToneMapping;
  const canvas = gpu.domElement;
  canvas.className = "livetrace";
  canvas.setAttribute("aria-hidden", "true");
  const stops = eyeStops(true);

  let pt = null, lit = null, stage = null, mood = null, key = "", raf = 0, poll = 0, timer = 0, disposed = false, unsub = null;
  const seenM = new THREE.Matrix4(), seenP = new THREE.Matrix4();
  const fit = () => { const r = host.getBoundingClientRect(); if (r.width && r.height) gpu.setSize(r.width, r.height); };
  const resized = new ResizeObserver(fit);

  // Hand the tracer the room as it is now.
  function load(){
    stage?.dispose();
    scene.updateMatrixWorld();
    stage = traceStage(lit, true);
    camera.updateMatrixWorld();
    stage.load(pt, camera);
    key = sceneKey();
  }
  // After a change: a new mood needs its sky, anything else only the scene again.
  async function changed(){
    if (disposed || !pt) return;
    if (getLighting() !== mood){
      mood = getLighting();
      const l = await traceEnv();
      if (disposed){ l.dispose(); return; }
      const old = lit; lit = l; load(); old.dispose();
      return;
    }
    scene.updateMatrixWorld();
    if (sceneKey() !== key) load();
  }

  (async () => {
    onStatus({phase:"preparing", samples:0, rate:0});
    await gpu.init();
    if (disposed) return;
    needWebGPU(gpu);
    fit(); host.appendChild(canvas); resized.observe(host);
    mood = getLighting();
    const l = await traceEnv();
    if (disposed){ l.dispose(); return; }
    lit = l;

    pt = newTracer(gpu);
    pt.maxSamples = MAX_SAMPLES;
    pt.minSamples = 1;
    pt.dynamicLowRes = true;   // after a move: a low-resolution trace first, which keeps up with walking...
    pt.lowResScale = .25;
    pt.renderDelay = 150;      // ...then, once you've stood still this long, full resolution
    pt.fadeDuration = 250;
    pt.setDenoiser(newDenoiser());
    load();
    loop.noDraw = true;
    unsub = subscribe(() => { clearTimeout(timer); timer = setTimeout(changed, REBUILD_MS); });

    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      camera.updateMatrixWorld();
      if (!seenM.equals(camera.matrixWorld) || !seenP.equals(camera.projectionMatrix)){
        seenM.copy(camera.matrixWorld); seenP.copy(camera.projectionMatrix);
        pt.updateCamera();
      }
      gpu.toneMappingExposure = renderer.toneMappingExposure * 2 ** stops;
      pt.renderSample();
    };
    tick();
    // The sample count is read back from the GPU, so only a few times a second.
    const measure = async () => {
      if (disposed) return;
      const c = await pt.getSampleCountsAsync().catch(() => null);
      if (disposed) return;
      if (c) onStatus({
        phase:pt.lowResMode ? "moving" : pt._denoiser?.complete ? "denoised" : "tracing",
        samples:Math.floor(c.min), rate:c.samplesPerSecond || 0
      });
      poll = setTimeout(measure, 400);
    };
    measure();
  })().catch(err => { console.error("Live trace failed", err); if (!disposed) onStatus({phase:"error", samples:0, rate:0}); });

  return {
    dispose(){
      disposed = true; cancelAnimationFrame(raf); clearTimeout(poll); clearTimeout(timer);
      unsub?.(); resized.disconnect();
      loop.noDraw = false;
      stage?.dispose();
      freeTracer(gpu, pt, () => lit?.dispose());
      canvas.remove();
    }
  };
}
