// Floor, solid walls with real window/door openings, a ceiling, and the glass/doors in the openings.
//
// Walls are 12 cm thick and, like the ceiling, cast shadows: sunlight only gets into the room
// through the openings. Walls (and the ceiling) between the camera and the room are hidden
// "dollhouse" style so you can see in, but they keep casting shadows.
import * as THREE from "three";
import { S, wallLen } from "../state.js";
import { WM, FM } from "../catalog.js";
import { OT, wallLine, INWARD, openingsOn } from "../openings.js";
import { matCanvas } from "../textures.js";
import { cssVar } from "../utils.js";
import { roomGroup, pickables } from "./scene.js";
import { updateSun } from "./sun.js";
import { disposeTree } from "./models.js";

const T = .12;            // wall thickness
let cullables = [];       // [{objs:[meshes], test:(camera) => hidden?}]

// `metres`: the geometry's UVs are in metres (walls), otherwise 0..1 across the surface (floor).
function surfaceMat(m, w, h, metres = false){
  const t = new THREE.CanvasTexture(matCanvas(m));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.repeat.set(metres ? 1 / m.tile : w / m.tile, metres ? 1 / m.tile : h / m.tile);
  return new THREE.MeshStandardMaterial({map:t, roughness:m.kind === "marble" ? .35 : .85, metalness:0});
}

export function buildRoom(){
  while (roomGroup.children.length) disposeTree(roomGroup.children.pop());
  pickables.length = 0; cullables = [];
  const {L, W, H} = S, sel = S.sel;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), surfaceMat(FM[S.floor], L, W));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData = {kind:"floor"};
  roomGroup.add(floor); pickables.push(floor);

  for (const k of ["n", "e", "s", "w"]){
    const parts = [buildWall(k, sel && sel.kind === "wall" && sel.id === k)];
    for (const o of openingsOn(k)) parts.push(...buildOpening(o, sel && sel.kind === "opening" && sel.id === o.id).children);
    const n = INWARD[k], mid = wallMid(k);
    // hidden when the camera is outside this wall, i.e. behind its inner face
    cullables.push({objs:parts, test:(cam) => (cam.position.x - mid.x) * n.x + (cam.position.z - mid.z) * n.y < 0});
  }

  // Ceiling: lit from inside, blocks the sun from above; hidden when looking down from above.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(L + 2 * T, W + 2 * T), new THREE.MeshStandardMaterial({color:0xf4f3f0, roughness:.95}));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H; ceiling.castShadow = true; ceiling.receiveShadow = true;
  ceiling.userData = {kind:"ceiling"};
  roomGroup.add(ceiling);
  cullables.push({objs:[ceiling], test:(cam) => cam.position.y > H - .05});

  updateSun();
}

// Middle of a wall's inner face, in scene coordinates.
function wallMid(k){
  const l = wallLine(k), len = wallLen(k);
  return {x:l.x + l.dx * len / 2 - S.L / 2, z:l.y + l.dy * len / 2 - S.W / 2};
}

// A wall seen from inside: a shape len × H with holes for windows and notches for doors/glass doors,
// extruded T metres outwards. Front and back walls run past the corners so they close them.
function buildWall(k, selected){
  const {H} = S, l = wallLine(k), n = INWARD[k], len = wallLen(k);
  const ext = (k === "n" || k === "s") ? T : 0;
  const ry = Math.atan2(n.x, n.y);
  const sign = Math.cos(ry) * l.dx - Math.sin(ry) * l.dy;   // wall-local x vs. the plan's direction along the wall
  const span = (o) => { const a = sign * (o.offset - len / 2), b = sign * (o.offset + o.w - len / 2); return [Math.min(a, b), Math.max(a, b)]; };

  const shape = new THREE.Shape();
  shape.moveTo(-len / 2 - ext, 0);
  const ops = openingsOn(k);
  for (const o of ops.filter(o => o.sill <= .001).map(o => ({o, s:span(o)})).sort((a, b) => a.s[0] - b.s[0])){
    const [x0, x1] = o.s, top = o.o.h;
    shape.lineTo(x0, 0); shape.lineTo(x0, top); shape.lineTo(x1, top); shape.lineTo(x1, 0);
  }
  shape.lineTo(len / 2 + ext, 0); shape.lineTo(len / 2 + ext, H); shape.lineTo(-len / 2 - ext, H); shape.closePath();
  for (const o of ops.filter(o => o.sill > .001)){
    const [x0, x1] = span(o), hole = new THREE.Path();
    hole.moveTo(x0, o.sill); hole.lineTo(x0, o.sill + o.h); hole.lineTo(x1, o.sill + o.h); hole.lineTo(x1, o.sill); hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {depth:T, bevelEnabled:false});
  geo.translate(0, 0, -T);   // inner face at z = 0, wall body behind it
  const mat = surfaceMat(WM[S.walls[k]], 0, 0, true);
  if (selected){ mat.emissive = new THREE.Color(cssVar("--accent")); mat.emissiveIntensity = .22; }
  const mesh = new THREE.Mesh(geo, mat);
  const mid = wallMid(k);
  mesh.position.set(mid.x, 0, mid.z); mesh.rotation.y = ry;
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = {kind:"wall", id:k};
  roomGroup.add(mesh); pickables.push(mesh);
  return mesh;
}

// Where an opening's centre sits on its wall's inner face, in scene coordinates, and which way the wall faces.
// (Shared with the camera "From door" view.)
export function openingFrame(o){
  const {L, W} = S, l = wallLine(o.wall), n = INWARD[o.wall];
  const c = {x:l.x + l.dx * (o.offset + o.w / 2), y:l.y + l.dy * (o.offset + o.w / 2)};   // plan coordinates
  return {x:c.x - L / 2, z:c.y - W / 2, nx:n.x, nz:n.y, ry:Math.atan2(n.x, n.y)};
}

// Glass and frame (windows, glass doors) or a door leaf, sitting inside the wall opening.
function buildOpening(o, selected){
  const f = openingFrame(o), isDoor = OT[o.type].kind === "door";
  const g = new THREE.Group();
  g.position.set(f.x - f.nx * T / 2, 0, f.z - f.nz * T / 2); g.rotation.y = f.ry;
  const accent = selected ? new THREE.Color(cssVar("--accent")) : null;
  const add = (mesh, x, y, z, shadow = true) => { mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const cy = o.sill + o.h / 2;

  if (isDoor){
    const leaf = new THREE.MeshStandardMaterial({color:0x6b4e3a, roughness:.6});
    if (accent){ leaf.emissive = accent; leaf.emissiveIntensity = .3; }
    add(new THREE.Mesh(new THREE.BoxGeometry(o.w - .02, o.h - .01, .04), leaf), 0, cy - .005, 0);
    const brass = new THREE.MeshStandardMaterial({color:0xc9b48a, metalness:.85, roughness:.3});
    for (const z of [.035, -.035]) add(new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), brass), o.w / 2 - .09, 1.0, z);
  } else {
    // glass lets light through (no shadow); frame and mullions cast thin shadows like real ones
    const glass = new THREE.MeshStandardMaterial({color:accent || 0xd9ecf6, transparent:true, opacity:accent ? .35 : .16, roughness:.04, metalness:0, depthWrite:false, side:THREE.DoubleSide});
    add(new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), glass), 0, cy, 0, false);
    const fm = new THREE.MeshStandardMaterial({color:0xf2f2f0, roughness:.5});
    if (accent){ fm.emissive = accent; fm.emissiveIntensity = .35; }
    const t = .05, d = .07, bar = (w, h, x, y) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fm), x, y, 0);
    bar(o.w, t, 0, o.sill + o.h - t / 2); bar(t, o.h, -o.w / 2 + t / 2, cy); bar(t, o.h, o.w / 2 - t / 2, cy);
    if (o.sill > 0) bar(o.w, t, 0, o.sill + t / 2);
    const panes = Math.max(1, Math.round(o.w / .8));          // a mullion roughly every 80 cm
    for (let i = 1; i < panes; i++) bar(t * .7, o.h, -o.w / 2 + i * o.w / panes, cy);
  }
  g.traverse(m => { m.userData = {kind:"opening", id:o.id, wall:o.wall}; });
  roomGroup.add(g); pickables.push(...g.children);
  return g;
}

// Called every frame: hide walls/ceiling between the camera and the room (they still cast shadows),
// and stop them catching clicks.
const noRaycast = () => {};
export function cullForCamera(camera){
  for (const c of cullables){
    const hide = c.test(camera);
    for (const m of c.objs){
      if (m.userData.culled === hide) continue;
      m.userData.culled = hide;
      for (const mat of [].concat(m.material)){ mat.colorWrite = !hide; mat.depthWrite = !hide && !mat.transparent; }
      m.raycast = hide ? noRaycast : THREE.Mesh.prototype.raycast;
    }
  }
}
