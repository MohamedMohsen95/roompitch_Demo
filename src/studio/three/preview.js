// The library's 3D preview: one piece on its own, built the way the room builds it (items.js buildPiece),
// turning slowly; drag to turn it, the wheel or a pinch to zoom. One small renderer, made the first time a
// preview opens and moved into whichever preview is showing. It draws only while a preview is open.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildPiece } from "./items.js";
import { disposeTree } from "./models.js";

const IDLE_MS = 3000;   // after the hand leaves it, the piece turns by itself again
let renderer, scene, camera, controls, key, ground, piece = null, view = null, host = null, ro = null, raf = 0, idle = 0, spin = true;

function setup(){
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // The same light as the library thumbnails (thumbs.js), so the picture and the 3D match.
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .85;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a948c, .5));
  key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0005; key.shadow.normalBias = .02; key.shadow.radius = 5;
  scene.add(key, key.target);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({opacity:.2}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  camera = new THREE.PerspectiveCamera(30, 1, .01, 100);

  controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {enableDamping:true, enablePan:false, autoRotateSpeed:1.5, minPolarAngle:.2, maxPolarAngle:Math.PI * .49});
  controls.addEventListener("start", () => { clearTimeout(idle); controls.autoRotate = false; view?.onTouched?.(); });
  controls.addEventListener("end", () => { clearTimeout(idle); if (spin) idle = setTimeout(() => { controls.autoRotate = true; }, IDLE_MS); });
}

// Look at the piece from the front at three-quarters, far enough out that all of it shows.
function frame(){
  const box = new THREE.Box3().setFromObject(piece), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const flat = size.y < .1;   // a rug: from higher up
  const r = box.getBoundingSphere(new THREE.Sphere()).radius;
  const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.aspect < 1 ? 1 / camera.aspect : 1) * 1.1;
  camera.position.copy(c).addScaledVector(new THREE.Vector3(.7, flat ? 1.5 : .55, 1).normalize(), dist);
  camera.near = dist / 50; camera.far = dist * 6; camera.updateProjectionMatrix();
  controls.target.copy(c); controls.minDistance = dist * .4; controls.maxDistance = dist * 1.8;
  controls.update();

  const s = Math.max(size.x, size.z, size.y) * 1.2;
  key.position.set(c.x - s * 1.2, c.y + s * 2.4, c.z + s * 1.6); key.target.position.copy(c);
  Object.assign(key.shadow.camera, {left:-s, right:s, top:s, bottom:-s, near:.01, far:s * 8});
  key.shadow.camera.updateProjectionMatrix();
  ground.scale.setScalar(s * 4); ground.position.set(c.x, box.min.y, c.z);
}

function resize(){
  if (!host) return;
  const {clientWidth:w, clientHeight:h} = host;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

function loop(){
  raf = requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
}

/**
 * Show catalog piece `type` in `el` (sized to it). `onReady` is called once it's drawn (the model has loaded),
 * `onTouched` the first time the person turns or zooms it. Returns a function that stops the preview.
 * Throws when this browser can't draw WebGL (the caller keeps the picture).
 */
export function showPreview(el, type, {onReady, onTouched} = {}){
  setup();
  stopDrawing();
  const mine = view = {onTouched};
  host = el; el.appendChild(renderer.domElement);
  ro = new ResizeObserver(resize); ro.observe(el); resize();
  spin = !matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (piece){ scene.remove(piece); disposeTree(piece); piece = null; }
  const {group, ready} = buildPiece(type);
  ready.catch(() => {}).then(() => {
    if (view !== mine) return disposeTree(group);
    piece = group; scene.add(group); frame();
    controls.autoRotate = spin;
    loop();
    onReady?.();
  });
  return () => { if (view === mine){ stopDrawing(); view = null; } };
}

function stopDrawing(){
  cancelAnimationFrame(raf); raf = 0; clearTimeout(idle);
  ro?.disconnect(); ro = null;
  renderer?.domElement.remove(); host = null;
}

// Back to the first view.
export function resetPreview(){ if (piece){ frame(); controls.autoRotate = spin; } }

// Turning by itself on or off. Returns the new state.
export function toggleSpin(){
  spin = !spin; clearTimeout(idle); controls.autoRotate = spin;
  return spin;
}
