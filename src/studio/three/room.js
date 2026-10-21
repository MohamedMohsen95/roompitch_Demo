// Floor, walls, door and window in 3D.
import * as THREE from "three";
import { S } from "../state.js";
import { WM, FM, DOOR, WIN } from "../catalog.js";
import { matCanvas } from "../textures.js";
import { cssVar } from "../utils.js";
import { roomGroup, pickables, placeSun } from "./scene.js";
import { disposeTree } from "./models.js";

function surfaceMat(m, w, h){
  const t = new THREE.CanvasTexture(matCanvas(m));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / m.tile, h / m.tile); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({map:t, roughness:m.kind === "marble" ? .35 : .85, metalness:0});
}

export function buildRoom(){
  while (roomGroup.children.length) disposeTree(roomGroup.children.pop());
  pickables.length = 0;
  const {L, W, H} = S, sel = S.sel;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), surfaceMat(FM[S.floor], L, W));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData = {kind:"floor"};
  roomGroup.add(floor); pickables.push(floor);

  const defs = {
    n:{len:L, pos:[0, H / 2, -W / 2], ry:0},
    s:{len:L, pos:[0, H / 2,  W / 2], ry:Math.PI},
    w:{len:W, pos:[-L / 2, H / 2, 0], ry:Math.PI / 2},
    e:{len:W, pos:[ L / 2, H / 2, 0], ry:-Math.PI / 2}
  };
  for (const [k, d] of Object.entries(defs)){
    const mat = surfaceMat(WM[S.walls[k]], d.len, H);
    if (sel && sel.kind === "wall" && sel.id === k){ mat.emissive = new THREE.Color(cssVar("--accent")); mat.emissiveIntensity = .22; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.len, H), mat);
    m.position.set(...d.pos); m.rotation.y = d.ry; m.receiveShadow = true; m.userData = {kind:"wall", id:k};
    roomGroup.add(m); pickables.push(m);
  }

  // door (south wall, seen from inside) and window (north wall)
  const door = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, DOOR.h), new THREE.MeshStandardMaterial({color:0x5b4332, roughness:.7}));
  door.position.set(DOOR.from + DOOR.w / 2 - L / 2, DOOR.h / 2, W / 2 - .01); door.rotation.y = Math.PI; roomGroup.add(door);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), new THREE.MeshStandardMaterial({color:0xcfe4f2, emissive:0xbcd8ee, emissiveIntensity:.55, roughness:.2}));
  win.position.set(0, WIN.sill + WIN.h / 2, -W / 2 + .01); roomGroup.add(win);
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(.04, WIN.h), new THREE.MeshStandardMaterial({color:0xf2f2f0}));
  frame.position.set(0, WIN.sill + WIN.h / 2, -W / 2 + .015); roomGroup.add(frame);

  placeSun();
}
