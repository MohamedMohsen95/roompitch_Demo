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
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .495; controls.minDistance = 1.5; controls.maxDistance = 20;

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

export function setCam(view){
  const {L, W, H} = S; controls.target.set(0, .9, 0);
  const door = S.openings.find(o => o.type === "door"), dw = door && wallsOf(S.poly)[door.wall];
  if (view === "door" && dw){
    // Stand just outside the first door, looking in.
    const {normal} = wallFrame(dw), c = alongWall(dw, door.offset + door.width / 2);
    camera.position.set(c[0] - normal[0] * .35 - L / 2, 1.6, c[1] - normal[1] * .35 - W / 2);
  }
  else if (view === "top") camera.position.set(0, Math.max(L, W) * 1.7, .01);
  else camera.position.set(L * .85, H * 1.9, W * 1.25);
  controls.update();
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
  renderer.setAnimationLoop(() => { controls.update(); beforeRender?.(); renderer.render(scene, camera); });
}
