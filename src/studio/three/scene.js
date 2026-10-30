// The 3D stage: renderer, camera, orbit controls and lights.
// The lighting mood (HDRI, sun colour, exposure) is set by ./lighting.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { S } from "../state.js";
import { wallsOf, wallFrame, alongWall } from "../geometry.js";
import { cssVar } from "../utils.js";

export let host, renderer, scene, camera, controls, sun, fill;
export const roomGroup = new THREE.Group(), itemGroup = new THREE.Group();
export const pickables = [];   // floor + walls, for clicks and drops
// How the camera is driven: "orbit" (OrbitControls) or "walk" (walk.js sets step and exit while walking).
export const nav = {mode:"orbit", step:null, exit:null};
let looping = false;

// Made once; the studio page puts the canvas into its 3D panel with attachScene() each time it shows.
export function initScene(){
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true}); // buffer kept for the AI render snapshot
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, .05, 100);
  // Orbit around a point that moves: the wheel zooms toward the pointer (and can get right up to a piece),
  // right-drag (or two fingers) slides the view. A press or the wheel stops a camera glide.
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .495; controls.minDistance = .2; controls.maxDistance = 25;
  controls.zoomToCursor = true;
  for (const ev of ["pointerdown", "wheel"]) renderer.domElement.addEventListener(ev, () => { glide = null; }, {passive:true});

  // Direct light on top of the environment: a soft fill and the sun (the only shadow-casting light).
  // Physical light units (three r155+). The sun is placed by sun.js; colours come from the lighting mood.
  fill = new THREE.HemisphereLight(0xffffff, 0x8a8178, .6);
  sun = new THREE.DirectionalLight(0xfff3e2, 1.5);
  scene.add(fill);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .02; sun.shadow.radius = 4;
  scene.add(sun, sun.target, roomGroup, itemGroup);

  themeBg();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeBg);
  new MutationObserver(themeBg).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});

}

// Show the 3D view in `el`, sized to it. Returns a function that takes it out again.
export function attachScene(el){
  host = el;
  el.appendChild(renderer.domElement);
  const ro = new ResizeObserver(resize); ro.observe(el);
  resize();
  return () => { ro.disconnect(); renderer.domElement.remove(); if (host === el) host = null; };
}

function themeBg(){ scene.background = new THREE.Color(cssVar("--stage") || "#dfe4e1"); }

const GLIDE_MS = 600;
// The preset views. They glide there (over `ms`), except `instant` (opening a room).
export function setCam(view, instant = false, ms = GLIDE_MS){
  const {L, W, H} = S, target = new THREE.Vector3(0, .9, 0), pos = new THREE.Vector3();
  const door = S.openings.find(o => o.type === "door"), dw = door && wallsOf(S.poly)[door.wall];
  if (view === "door" && dw){
    // Stand just outside the first door, looking in.
    const {normal} = wallFrame(dw), c = alongWall(dw, door.offset + door.width / 2);
    pos.set(c[0] - normal[0] * .35 - L / 2, 1.6, c[1] - normal[1] * .35 - W / 2);
  }
  else if (view === "top") pos.set(0, Math.max(L, W) * 1.7, .01);
  else pos.set(L * .85, H * 1.9, W * 1.25);
  flyTo(pos, target, instant, ms);
}

// Frame a box (a piece, or several): keep looking from the same side, a little from above, close enough
// that it fills most of the view.
export function focusBox(box){
  const center = box.getCenter(new THREE.Vector3()), r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, .15);
  const fov = THREE.MathUtils.degToRad(camera.fov) / 2, dist = r / Math.sin(Math.min(fov, Math.atan(Math.tan(fov) * camera.aspect))) * 1.15;
  const dir = camera.position.clone().sub(controls.target); dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 1);
  dir.normalize().multiplyScalar(Math.cos(.45)).setY(Math.sin(.45));   // ~25° above
  flyTo(center.clone().addScaledVector(dir, dist), center);
}

// Move the camera and the point it orbits, eased over `ms` (~0.6 s).
let glide = null;   // {p0, t0, p1, t1, start, ms}
export const stopGlide = () => { glide = null; };   // a walk starting takes the camera
function flyTo(pos, target, instant = false, ms = GLIDE_MS){
  nav.exit?.(false);   // a view or a focus ends a walk (and takes the camera from there)
  if (instant || !looping){
    glide = null; camera.position.copy(pos); controls.target.copy(target); controls.update(); return;
  }
  glide = {p0:camera.position.clone(), t0:controls.target.clone(), p1:pos.clone(), t1:target.clone(), start:performance.now(), ms};
}
function stepGlide(){
  if (!glide) return;
  const k = Math.min(1, (performance.now() - glide.start) / glide.ms), e = 1 - Math.pow(1 - k, 3);   // ease out
  camera.position.lerpVectors(glide.p0, glide.p1, e); controls.target.lerpVectors(glide.t0, glide.t1, e);
  if (k === 1) glide = null;
}

// Keep the orbit point in and around the room, so sliding the view can't lose it.
function keepTarget(){
  const {L, W, H} = S, t = controls.target, m = 1;
  t.set(THREE.MathUtils.clamp(t.x, -L / 2 - m, L / 2 + m), THREE.MathUtils.clamp(t.y, 0, H), THREE.MathUtils.clamp(t.z, -W / 2 - m, W / 2 + m));
}

export function resize(){
  if (!host) return;
  const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false); renderer.domElement.style.width = r.width + "px"; renderer.domElement.style.height = r.height + "px";
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}

// Render loop; `beforeRender` lets other modules update per frame (e.g. the selection outline).
export function startLoop(beforeRender){
  if (looping) return;
  looping = true;
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    if (nav.step) nav.step(dt); else { stepGlide(); keepTarget(); controls.update(); }
    beforeRender?.(); renderer.render(scene, camera);
  });
}
