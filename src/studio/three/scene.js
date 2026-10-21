// The 3D stage: renderer, camera, orbit controls, lights and image-based lighting (HDRI).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { S } from "../state.js";
import { DOOR } from "../catalog.js";
import { $, cssVar } from "../utils.js";

// Real photographed lighting (Poly Haven, CC0) for reflections and soft ambient light.
// Try another one without editing code: studio.html?hdri=lebombo_1k
export const DEFAULT_HDRI = "photo_studio_loft_hall_1k";

export let host, renderer, scene, camera, controls, sun;
export const roomGroup = new THREE.Group(), itemGroup = new THREE.Group();
export const pickables = [];   // floor + walls, for clicks and drops

export function initScene(){
  host = $("#three");
  renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true}); // buffer kept for the AI render snapshot
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, .05, 100);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .495; controls.minDistance = 1.5; controls.maxDistance = 20;

  initEnvironment();

  // Direct light on top of the environment: a soft fill and a sun through the window for shadows.
  // Physical light units (three r155+).
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8178, .6));
  sun = new THREE.DirectionalLight(0xfff3e2, 1.5);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .02; sun.shadow.radius = 4;
  scene.add(sun, sun.target, roomGroup, itemGroup);

  themeBg();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeBg);
  new MutationObserver(themeBg).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});

  new ResizeObserver(resize).observe(host);
  resize();
  $("#camCorner").onclick = () => setCam("corner"); $("#camDoor").onclick = () => setCam("door"); $("#camTop").onclick = () => setCam("top");
}

// Start with a lighting environment generated in code (instant), then swap in the HDRI once downloaded.
function initEnvironment(){
  const pmrem = new THREE.PMREMGenerator(renderer);
  const fallback = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environment = fallback;
  scene.environmentIntensity = .35;

  const name = new URLSearchParams(location.search).get("hdri") || DEFAULT_HDRI;
  if (name === "none") return;
  new HDRLoader().load(`hdri/${encodeURIComponent(name)}.hdr`, hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = .5;
    hdr.dispose(); fallback.dispose(); pmrem.dispose();
  }, undefined, err => console.warn("HDRI not loaded, using the built-in environment", err));
}

// Update the sun and its shadow area for the current room size.
export function placeSun(){
  const {L, W, H} = S;
  sun.position.set(-L * .3, H * 2.6, -W * 1.4); sun.target.position.set(0, 0, 0);
  const sh = Math.max(L, W); Object.assign(sun.shadow.camera, {left:-sh, right:sh, top:sh, bottom:-sh}); sun.shadow.camera.updateProjectionMatrix();
}

function themeBg(){ scene.background = new THREE.Color(cssVar("--stage") || "#dfe4e1"); }

export function setCam(view){
  const {L, W, H} = S; controls.target.set(0, .9, 0);
  if (view === "door") camera.position.set(DOOR.from + DOOR.w / 2 - L / 2, 1.6, W / 2 + .2);
  else if (view === "top") camera.position.set(0, Math.max(L, W) * 1.7, .01);
  else camera.position.set(L * .85, H * 1.9, W * 1.25);
  controls.update();
}

export function resize(){
  const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false); renderer.domElement.style.width = r.width + "px"; renderer.domElement.style.height = r.height + "px";
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}

// Render loop; `beforeRender` lets other modules update per frame (e.g. the selection outline).
export function startLoop(beforeRender){
  renderer.setAnimationLoop(() => { controls.update(); beforeRender?.(); renderer.render(scene, camera); });
}
