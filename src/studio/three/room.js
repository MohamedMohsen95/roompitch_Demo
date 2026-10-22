// Floor, walls, door and window in 3D.
import * as THREE from "three";
import { S } from "../state.js";
import { WM, FM } from "../catalog.js";
import { wallsOf, wallFrame, alongWall } from "../geometry.js";
import { matCanvas } from "../textures.js";
import { cssVar } from "../utils.js";
import { roomGroup, pickables, placeSun } from "./scene.js";
import { disposeTree } from "./models.js";

function surfaceMat(m, w, h){
  const t = new THREE.CanvasTexture(matCanvas(m));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / m.tile, h / m.tile); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({map:t, roughness:m.kind === "marble" ? .35 : .85, metalness:0});
}

// Plan (x, y) in metres → world position on the floor (room centred on the origin).
export const toWorld = (x, y) => [x - S.L / 2, y - S.W / 2];

export function buildRoom(){
  while (roomGroup.children.length) disposeTree(roomGroup.children.pop());
  pickables.length = 0;
  const {H} = S, sel = S.sel, ws = wallsOf(S.poly);

  // Floor: the room outline. Shape UVs are in metres, so the texture repeats once per tile.
  const shape = new THREE.Shape(S.poly.map(([x, y]) => { const [wx, wz] = toWorld(x, y); return new THREE.Vector2(wx, -wz); }));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), surfaceMat(FM[S.floor], 1, 1));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData = {kind:"floor"};
  roomGroup.add(floor); pickables.push(floor);

  // One wall per edge, facing into the room (seen from outside it is see-through, like a dollhouse).
  for (const w of ws){
    const {normal} = wallFrame(w), [mx, mz] = toWorld(...alongWall(w, w.len / 2)), ry = Math.atan2(normal[0], normal[1]);
    const mat = surfaceMat(WM[S.walls[w.i]] || WM["paint-white"], w.len, H);
    if (sel && sel.kind === "wall" && sel.id === w.i){ mat.emissive = new THREE.Color(cssVar("--accent")); mat.emissiveIntensity = .22; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.len, H), mat);
    m.position.set(mx, H / 2, mz); m.rotation.y = ry; m.receiveShadow = true; m.userData = {kind:"wall", id:w.i};
    roomGroup.add(m); pickables.push(m);
  }

  // Doors and windows: panels just in front of their wall.
  const doorMat = () => new THREE.MeshStandardMaterial({color:0x5b4332, roughness:.7});
  const glassMat = () => new THREE.MeshStandardMaterial({color:0xcfe4f2, emissive:0xbcd8ee, emissiveIntensity:.55, roughness:.2});
  for (const o of S.openings){
    const w = ws[o.wall]; if (!w) continue;
    const {normal} = wallFrame(w), c = alongWall(w, o.offset + o.width / 2);
    const [x, z] = toWorld(c[0] + normal[0] * .01, c[1] + normal[1] * .01), ry = Math.atan2(normal[0], normal[1]);
    const sill = o.type === "door" ? 0 : o.sill;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), o.type === "door" ? doorMat() : glassMat());
    panel.position.set(x, sill + o.height / 2, z); panel.rotation.y = ry; roomGroup.add(panel);
    if (o.type === "window"){
      const [fx, fz] = toWorld(c[0] + normal[0] * .015, c[1] + normal[1] * .015);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(.04, o.height), new THREE.MeshStandardMaterial({color:0xf2f2f0}));
      frame.position.set(fx, sill + o.height / 2, fz); frame.rotation.y = ry; roomGroup.add(frame);
    }
  }

  placeSun();
}
