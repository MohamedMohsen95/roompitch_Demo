// Floor, walls, windows and doors in 3D.
import * as THREE from "three";
import { S } from "../state.js";
import { WM, FM } from "../catalog.js";
import { OT, wallLine, INWARD } from "../openings.js";
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

  for (const o of S.openings) roomGroup.add(buildOpening(o, sel && sel.kind === "opening" && sel.id === o.id));

  placeSun();
}

// Where an opening's centre sits on its wall, in scene coordinates, and which way the wall faces.
// (Shared with the camera "From door" view.)
export function openingFrame(o){
  const {L, W} = S, l = wallLine(o.wall), n = INWARD[o.wall];
  const c = {x:l.x + l.dx * (o.offset + o.w / 2), y:l.y + l.dy * (o.offset + o.w / 2)};   // plan coordinates
  return {x:c.x - L / 2, z:c.y - W / 2, nx:n.x, nz:n.y, ry:Math.atan2(n.x, n.y)};
}

// For now a window or door is a panel on the wall's inside face (real wall holes come next).
function buildOpening(o, selected){
  const f = openingFrame(o), isDoor = OT[o.type].kind === "door";
  const g = new THREE.Group();
  g.position.set(f.x + f.nx * .012, 0, f.z + f.nz * .012); g.rotation.y = f.ry;
  const mat = isDoor
    ? new THREE.MeshStandardMaterial({color:0x5b4332, roughness:.7})
    : new THREE.MeshStandardMaterial({color:0xcfe4f2, emissive:0xbcd8ee, emissiveIntensity:.55, roughness:.2});
  if (selected){ mat.emissive = new THREE.Color(cssVar("--accent")); mat.emissiveIntensity = .35; }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat);
  pane.position.y = o.sill + o.h / 2;
  g.add(pane);
  if (!isDoor){
    // white frame: mullion in the middle plus a thin border
    const fm = new THREE.MeshStandardMaterial({color:0xf2f2f0, roughness:.6}), t = .04;
    for (const [w, h, x, y] of [[t, o.h, 0, 0], [o.w, t, 0, o.h / 2 - t / 2], [o.w, t, 0, -o.h / 2 + t / 2], [t, o.h, -o.w / 2 + t / 2, 0], [t, o.h, o.w / 2 - t / 2, 0]]){
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fm);
      b.position.set(x, o.sill + o.h / 2 + y, .004); g.add(b);
    }
  } else {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), new THREE.MeshStandardMaterial({color:0xc9b48a, metalness:.8, roughness:.3}));
    knob.position.set(o.w / 2 - .09, 1.0, .03); g.add(knob);
  }
  g.traverse(n => { n.userData = {kind:"opening", id:o.id, wall:o.wall}; });
  pickables.push(...g.children);
  return g;
}
