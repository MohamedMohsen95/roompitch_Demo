// The spaces next to the one being designed (a flat read from a floor plan), in plain grey: floor and walls,
// so the hall shows through the bedroom door. Not pickable; walls between the camera and them are hidden
// like the room's own. Walls shared with the room are left out (the room's wall, with its doors, is there).
import * as THREE from "three";
import { S } from "../state.js";
import { wallsOf, wallFrame } from "../geometry.js";
import { scene } from "./scene.js";
import { disposeTree } from "./models.js";

const GREY = 0xc9cbc8, T = .12;
const group = new THREE.Group();
let outlines = [], builtKey = "", cull = [];
const noRaycast = () => {};

export function setContext(list){ outlines = Array.isArray(list) ? list : []; }

// A neighbour wall lying along one of the room's walls: both ends within a wall's thickness (30 cm) of its line, overlapping it.
function shared(a, b){
  return wallsOf(S.poly).some(w => {
    const {dir} = wallFrame(w);
    const at = (p) => ({t:(p[0] - w.a[0]) * dir[0] + (p[1] - w.a[1]) * dir[1], d:Math.abs((p[0] - w.a[0]) * dir[1] - (p[1] - w.a[1]) * dir[0])});
    const pa = at(a), pb = at(b);
    return pa.d < .3 && pb.d < .3 && Math.max(pa.t, pb.t) > .05 && Math.min(pa.t, pb.t) < w.len - .05;
  });
}

// Rebuilt only when the neighbours or the room's size change.
export function buildContext(){
  const key = JSON.stringify([outlines, S.L, S.W, S.H, S.poly]);
  if (key === builtKey) return;
  builtKey = key;
  if (!group.parent && scene) scene.add(group);
  while (group.children.length) disposeTree(group.children.pop());
  cull = [];
  const toW = (x, y) => [x - S.L / 2, y - S.W / 2];
  const mat = () => new THREE.MeshStandardMaterial({color:GREY, roughness:.95, metalness:0, side:THREE.DoubleSide});
  for (const o of outlines){
    if (!Array.isArray(o) || o.length < 3) continue;
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(o.map(([x, y]) => { const [wx, wz] = toW(x, y); return new THREE.Vector2(wx, -wz); }))), mat());
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.004; floor.receiveShadow = true; floor.raycast = noRaycast;
    group.add(floor);
    for (const w of wallsOf(o)){
      if (!w.len || shared(w.a, w.b)) continue;
      const {normal} = wallFrame(w);
      const geo = new THREE.BoxGeometry(w.len, S.H, T);
      const m = new THREE.Mesh(geo, mat());
      const cx = (w.a[0] + w.b[0]) / 2 - normal[0] * T / 2, cy = (w.a[1] + w.b[1]) / 2 - normal[1] * T / 2;
      const [mx, mz] = toW(cx, cy);
      m.position.set(mx, S.H / 2, mz); m.rotation.y = Math.atan2(normal[0], normal[1]);
      m.castShadow = true; m.receiveShadow = true; m.raycast = noRaycast;
      group.add(m);
      const [fx, fz] = toW((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2);
      cull.push({m, test:(cam) => (cam.position.x - fx) * normal[0] + (cam.position.z - fz) * normal[1] < 0});
    }
  }
}

// Every frame, like the room's walls.
export function cullContext(camera){
  for (const c of cull){
    const hide = c.test(camera);
    if (c.m.userData.culled === hide) continue;
    c.m.userData.culled = hide;
    c.m.material.colorWrite = !hide; c.m.material.depthWrite = !hide;
  }
}
