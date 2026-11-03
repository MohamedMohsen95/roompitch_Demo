// The landing page's 3D drawings, in white line on the page's blue, built from the studio's own models
// (public/models):
//   mountRoom   the "living room" template: the walls rise, the pieces settle in one by one, then it turns
//               slowly and can be dragged sideways
//   mountPiece  one catalogue piece at a time inside its size box, turning on a metre grid
// Line colour comes from the page's --room-line custom property. Both pause off screen, keep still with
// reduced motion, and return a function that frees the renderer when the page goes away.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import room from "./room.json";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// A CSS colour (oklch, hex...) as a three.js colour: the browser converts it.
function cssColor(el, name, fallback = "#fff"){
  const probe = document.createElement("canvas").getContext("2d", {willReadFrequently:true});
  probe.fillStyle = getComputedStyle(el).getPropertyValue(name).trim() || fallback; probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

// A model's meshes as edge lines, scaled into the piece's catalogue size and stood on the floor.
async function lineModel(it, mat){
  const obj = (await loader.loadAsync(it.model)).scene;
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = Math.min(it.w / size.x, it.d / size.z, it.h / size.y);
  obj.scale.setScalar(k); obj.position.set(-c.x * k, -box.min.y * k, -c.z * k); obj.updateMatrixWorld(true);
  const lines = new THREE.Group();
  obj.traverse(n => { if (n.isMesh){ const e = new THREE.LineSegments(new THREE.EdgesGeometry(n.geometry, 35), mat); e.applyMatrix4(n.matrixWorld); lines.add(e); } });
  return lines;
}

// The renderer, its canvas, resizing, and a frame loop that only runs while the host is on screen.
function stage(host, draw){
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  const size = () => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(size); ro.observe(host); size();
  let raf = 0, visible = false, t0 = null;
  const frame = (t) => {
    raf = 0; if (!visible) return;
    if (t0 === null) t0 = t;
    draw(t - t0, camera, renderer);
    raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, {threshold:0.05});
  io.observe(host);
  const dispose = () => {
    io.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); visible = false;
    renderer.dispose(); renderer.domElement.remove(); delete host.dataset.ready;
  };
  return {renderer, camera, dispose};
}

// A wall along x (length L) with rectangular holes: the solid parts as boxes.
function wallPieces(L, H, holes, t){
  const parts = [], xs = [0, ...holes.flatMap(h => [h.offset, h.offset + h.width]), L].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++){
    const a = xs[i], b = xs[i + 1]; if (b - a < 0.001) continue;
    const hole = holes.find(h => a >= h.offset - 1e-6 && b <= h.offset + h.width + 1e-6);
    if (!hole){ parts.push([a, b, 0, H]); continue; }
    if (hole.sill > 0) parts.push([a, b, 0, hole.sill]);
    if (hole.sill + hole.height < H) parts.push([a, b, hole.sill + hole.height, H]);
  }
  return parts.map(([a, b, y0, y1]) => { const g = new THREE.BoxGeometry(b - a, y1 - y0, t); g.translate((a + b) / 2, (y0 + y1) / 2, 0); return g; });
}

export function mountRoom(host){
  const L = room.poly[1][0], W = room.poly[2][1], H = room.H, T = 0.12;
  const scene = new THREE.Scene();
  const lineMat = new THREE.LineBasicMaterial({color:cssColor(host, "--room-line"), transparent:true, opacity:0.9});
  const faintMat = new THREE.LineBasicMaterial({color:lineMat.color, transparent:true, opacity:0.22});
  const edges = (geo) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), lineMat);
  const world = new THREE.Group(); world.position.set(-L / 2, 0, -W / 2); scene.add(world);

  // The floor and its metre grid.
  world.add(edges(new THREE.BoxGeometry(L, 0.06, W).translate(L / 2, -0.03, W / 2)));
  const pts = [];
  for (let x = 1; x < L; x++) pts.push(x, 0.001, 0, x, 0.001, W);
  for (let z = 1; z < W; z++) pts.push(0, 0.001, z, L, 0.001, z);
  world.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)), faintMat));

  // The two far walls, cut open for their window and door; the near two are left off so the room shows.
  const walls = new THREE.Group(), back = new THREE.Group(), side = new THREE.Group(); world.add(walls);
  wallPieces(L + T, H, room.openings.filter(o => o.wall === 0).map(o => ({...o, offset:o.offset + T})), T).forEach(g => back.add(edges(g)));
  back.position.set(-T, 0, -T / 2);
  wallPieces(W, H, room.openings.filter(o => o.wall === 3).map(o => ({...o, offset:W - o.offset - o.width})), T).forEach(g => side.add(edges(g)));
  side.rotation.y = -Math.PI / 2; side.position.set(-T / 2, 0, 0);
  walls.add(back, side);
  for (const o of room.openings.filter(o => o.wall === 0 && o.type === "window")){
    const pane = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(o.width, o.height)), faintMat);
    pane.position.set(o.offset + o.width / 2, o.sill + o.height / 2, -T / 2); walls.add(pane);
  }

  // The furniture, each piece as it sits in the template; a box where a piece has no model.
  const pieces = room.items.map(it => {
    const holder = new THREE.Group();
    holder.position.set(it.x, it.z || 0, it.y); holder.rotation.y = it.rot * Math.PI / 180;
    world.add(holder);
    const box = () => holder.add(edges(new THREE.BoxGeometry(it.w, it.h, it.d).translate(0, it.h / 2, 0)));
    if (it.model) lineModel(it, lineMat).then(g => holder.add(g), box); else box();
    return {holder, y:it.z || 0};
  });

  // The camera, from the open corner; drag sideways to turn the room a little.
  const target = new THREE.Vector3(0.4, 0.2, 0.5);
  let yaw = 0.62, drag = null, yawDrag = 0;
  const {renderer, dispose} = stage(host, (t, camera, renderer) => {
    const quiet = still(), k = quiet ? 1 : ease(t / 900);
    walls.scale.y = Math.max(0.001, k);
    pieces.forEach((p, i) => {
      const q = quiet ? 1 : ease((t - 500 - i * 120) / 700);
      p.holder.position.y = p.y + (1 - q) * 1.4; p.holder.visible = q > 0;
    });
    if (!quiet && drag === null) yaw = 0.62 + Math.sin(t / 9000) * 0.32;
    const narrow = camera.aspect < 1, r = narrow ? 13.5 : 11, a = yaw + yawDrag;
    if (camera.fov !== (narrow ? 46 : 32)){ camera.fov = narrow ? 46 : 32; camera.updateProjectionMatrix(); }
    camera.position.set(Math.sin(a) * r, 5.4, Math.cos(a) * r); camera.lookAt(target);
    renderer.render(scene, camera);
  });
  const el = renderer.domElement;
  el.style.touchAction = "pan-y"; el.style.cursor = "grab";
  el.addEventListener("pointerdown", e => { drag = e.clientX; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; });
  el.addEventListener("pointermove", e => { if (drag !== null) yawDrag = Math.max(-0.9, Math.min(0.9, (e.clientX - drag) * -0.006)); });
  const end = () => { if (drag === null) return; yaw += yawDrag; yawDrag = 0; drag = null; el.style.cursor = "grab"; };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  host.dataset.ready = "true";
  return dispose;
}

// Returns {show(item), dispose}: show swaps in a piece ({w, d, h, model} in metres); models are cached.
export function mountPiece(host){
  const scene = new THREE.Scene();
  const lineMat = new THREE.LineBasicMaterial({color:cssColor(host, "--room-line"), transparent:true, opacity:0.9});
  const faintMat = new THREE.LineBasicMaterial({color:lineMat.color, transparent:true, opacity:0.22});
  const pts = [];
  for (let i = -3; i <= 3; i++) pts.push(i * 0.5, 0, -1.5, i * 0.5, 0, 1.5, -1.5, 0, i * 0.5, 1.5, 0, i * 0.5);
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)), faintMat));

  const cache = new Map();
  let current = null, shownAt = 0, span = 1, ask = 0;
  const {dispose} = stage(host, (t, camera, renderer) => {
    const quiet = still(), a = quiet ? 0.7 : 0.7 + t / 5200, r = span * 2.9 + 0.8;
    camera.position.set(Math.sin(a) * r, span * 0.9 + 0.3, Math.cos(a) * r);
    camera.lookAt(0, span * 0.32, 0);
    if (current) current.position.y = quiet ? 0 : (1 - ease((performance.now() - shownAt) / 600)) * 0.5;
    renderer.render(scene, camera);
  });
  host.dataset.ready = "true";
  const build = async (it) => {
    const g = new THREE.Group();
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(it.w, it.h, it.d).translate(0, it.h / 2, 0)), faintMat));
    if (it.model) g.add(await lineModel(it, lineMat));
    return g;
  };
  async function show(it){
    const mine = ++ask;
    if (!cache.has(it.model)) cache.set(it.model, build(it));
    const g = await cache.get(it.model);
    if (mine !== ask) return;
    if (current) scene.remove(current);
    current = g; scene.add(g); span = Math.max(it.w, it.d, it.h); shownAt = performance.now();
  }
  return {show, dispose};
}
