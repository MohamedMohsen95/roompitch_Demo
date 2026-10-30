// Library thumbnails: one piece on its own, built the way the 3D view builds it (items.js buildPiece), seen
// from the front at three-quarters and a little above, in even studio light with a soft shadow, on a clear
// background. Rendered at twice the size and scaled down for smooth edges; WebP where the browser can write it.
// Uses its own small renderer, so it works without the studio's 3D view (the thumbnail page for
// npm run thumbs, scripts/thumbs.html) and never touches the room's camera or lights.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildPiece } from "./items.js";
import { disposeTree } from "./models.js";

export const THUMB_PX = 256;
const DRAW_PX = THUMB_PX * 2;
let renderer, scene, camera, key, ground, out;

function setup(){
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(1); renderer.setSize(DRAW_PX, DRAW_PX, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .85;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a948c, .5));
  // The key light from the upper left, the only one with a shadow, onto a floor that shows nothing else.
  key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0005; key.shadow.normalBias = .02; key.shadow.radius = 5;
  scene.add(key, key.target);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({opacity:.2}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  camera = new THREE.PerspectiveCamera(28, 1, .01, 100);
  out = document.createElement("canvas"); out.width = out.height = THUMB_PX;
}

// Place the camera so the piece fills the frame with a small margin.
const MARGIN = .9;   // the share of the frame the piece may take
function frame(obj){
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const flat = size.y < .1;   // a rug: from higher up, so it reads as a rug
  const dir = new THREE.Vector3(.7, flat ? 1.5 : .55, 1).normalize();
  const corners = [0, 1].flatMap(x => [0, 1].flatMap(y => [0, 1].map(z =>
    new THREE.Vector3(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z))));
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let dist = size.length() * 2;
  for (let i = 0; i < 3; i++){   // refine: how far out the corners reach at this distance, then scale to fit
    camera.position.copy(c).addScaledVector(dir, dist); camera.lookAt(c); camera.updateMatrixWorld();
    const reach = Math.max(...corners.map(p => { const q = p.clone().applyMatrix4(camera.matrixWorldInverse); return Math.max(Math.abs(q.x), Math.abs(q.y)) / (-q.z * tan); }));
    dist *= reach / MARGIN;
  }
  camera.position.copy(c).addScaledVector(dir, dist); camera.lookAt(c);
  camera.near = dist / 50; camera.far = dist * 4; camera.updateProjectionMatrix();

  // shadow and floor sized to the piece
  const r = Math.max(size.x, size.z, size.y) * 1.2;
  key.position.set(c.x - r * 1.2, c.y + r * 2.4, c.z + r * 1.6); key.target.position.copy(c);
  Object.assign(key.shadow.camera, {left:-r, right:r, top:r, bottom:-r, near:.01, far:r * 8});
  key.shadow.camera.updateProjectionMatrix();
  ground.scale.setScalar(r * 4); ground.position.set(c.x, box.min.y, c.z);
}

const toBlob = (canvas) => new Promise(res => canvas.toBlob(b => b?.type === "image/webp" ? res(b) : canvas.toBlob(res, "image/png"), "image/webp", .9));

async function draw(type){
  setup();
  const {group, ready} = buildPiece(type);
  try {
    await ready;
    scene.add(group);
    frame(group);
    renderer.render(scene, camera);
    const ctx = out.getContext("2d");
    ctx.clearRect(0, 0, THUMB_PX, THUMB_PX); ctx.imageSmoothingQuality = "high";
    ctx.drawImage(renderer.domElement, 0, 0, THUMB_PX, THUMB_PX);
    return await toBlob(out);
  } finally {
    scene.remove(group); disposeTree(group);
  }
}

// The thumbnail of catalog piece `type` as an image Blob. One at a time, in the order asked.
let queue = Promise.resolve();
export function renderThumb(type){
  const job = queue.then(() => draw(type));
  queue = job.catch(() => {});
  return job;
}
