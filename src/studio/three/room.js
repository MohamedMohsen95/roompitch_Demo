// Floor, solid walls with real window/door openings, a ceiling, and the glass/doors in the openings,
// for any room outline (S.poly; wall i runs from corner i to corner i+1).
//
// Walls are 12 cm thick and, like the ceiling, cast shadows: sunlight only gets into the room
// through the openings. Walls (and the ceiling) between the camera and the room are hidden
// "dollhouse" style so you can see in, but they keep casting shadows.
import * as THREE from "three";
import { S } from "../state.js";
import { WM, FM } from "../catalog.js";
import { wallsOf, wallFrame, alongWall } from "../geometry.js";
import { openingsOn } from "../openings.js";
import { matCanvas } from "../textures.js";
import { cssVar } from "../utils.js";
import { roomGroup, pickables } from "./scene.js";
import { updateSun } from "./sun.js";
import { disposeTree } from "./models.js";

const T = .12;            // wall thickness
let cullables = [];       // [{objs:[meshes], test:(camera) => hidden?}]

// Texture repeats w/tile × h/tile times; pass 1, 1 for geometry whose UVs are already in metres.
function surfaceMat(m, w, h){
  const t = new THREE.CanvasTexture(matCanvas(m));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / m.tile, h / m.tile); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({map:t, roughness:m.kind === "marble" ? .35 : .85, metalness:0});
}

// Plan (x, y) in metres → world position on the floor (room centred on the origin).
export const toWorld = (x, y) => [x - S.L / 2, y - S.W / 2];

// Outline as a shape lying flat: floor (seen from above) or ceiling (seen from below).
function outlineShape(sign){
  return new THREE.Shape(S.poly.map(([x, y]) => { const [wx, wz] = toWorld(x, y); return new THREE.Vector2(wx, sign * wz); }));
}

export function buildRoom(){
  while (roomGroup.children.length) disposeTree(roomGroup.children.pop());
  pickables.length = 0; cullables = [];
  const {H} = S, sel = S.sel, ws = wallsOf(S.poly);

  // Floor: the room outline. Shape UVs are in metres, so the texture repeats once per tile.
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(outlineShape(-1)), surfaceMat(FM[S.floor], 1, 1));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData = {kind:"floor"};
  roomGroup.add(floor); pickables.push(floor);

  ws.forEach((w, i) => {
    const next = ws[(i + 1) % ws.length];
    const parts = [buildWall(w, next, sel && sel.kind === "wall" && sel.id === w.i)];
    for (const o of openingsOn(w.i)) parts.push(...buildOpening(o, w, sel && sel.kind === "opening" && sel.id === o.id).children);
    const {normal} = wallFrame(w), [mx, mz] = toWorld(...alongWall(w, w.len / 2));
    // hidden when the camera is outside this wall, i.e. behind its inner face
    cullables.push({objs:parts, test:(cam) => (cam.position.x - mx) * normal[0] + (cam.position.z - mz) * normal[1] < 0});
  });

  // Ceiling: lit from inside, blocks the sun from above; hidden when looking down from above.
  const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(outlineShape(1)), new THREE.MeshStandardMaterial({color:0xf4f3f0, roughness:.95, side:THREE.DoubleSide}));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H; ceiling.castShadow = true; ceiling.receiveShadow = true;
  ceiling.userData = {kind:"ceiling"};
  roomGroup.add(ceiling);
  cullables.push({objs:[ceiling], test:(cam) => cam.position.y > H - .05});

  updateSun();
}

// A wall seen from inside: a shape len × H with holes for windows and notches for doors/glass doors,
// extruded T metres outwards. At an outside corner the wall runs on by T so the corner is closed
// (each corner is closed by the wall that ends there; inside corners need nothing).
function buildWall(w, next, selected){
  const {H} = S, {dir, normal} = wallFrame(w), len = w.len;
  const nd = wallFrame(next).dir, outside = dir[0] * nd[1] - dir[1] * nd[0] > 0;   // corners run clockwise on screen
  const endExt = outside ? T : 0;
  const ry = Math.atan2(normal[0], normal[1]);
  const sign = Math.cos(ry) * dir[0] - Math.sin(ry) * dir[1];   // wall-local x vs. the wall's direction
  const at = (s) => sign * (s - len / 2);                       // distance along the wall -> local x
  const span = (o) => { const a = at(o.offset), b = at(o.offset + o.width); return [Math.min(a, b), Math.max(a, b)]; };

  const xs = [at(0), at(len + endExt)], x0 = Math.min(...xs), x1 = Math.max(...xs);
  const shape = new THREE.Shape();
  shape.moveTo(x0, 0);
  const ops = openingsOn(w.i);
  for (const d of ops.filter(o => o.sill <= .001).map(o => ({o, s:span(o)})).sort((a, b) => a.s[0] - b.s[0])){
    shape.lineTo(d.s[0], 0); shape.lineTo(d.s[0], d.o.height); shape.lineTo(d.s[1], d.o.height); shape.lineTo(d.s[1], 0);
  }
  shape.lineTo(x1, 0); shape.lineTo(x1, H); shape.lineTo(x0, H); shape.closePath();
  for (const o of ops.filter(o => o.sill > .001)){
    const [a, b] = span(o), hole = new THREE.Path();
    hole.moveTo(a, o.sill); hole.lineTo(a, o.sill + o.height); hole.lineTo(b, o.sill + o.height); hole.lineTo(b, o.sill); hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {depth:T, bevelEnabled:false});
  geo.translate(0, 0, -T);   // inner face at z = 0, wall body behind it
  const mat = surfaceMat(WM[S.walls[w.i]] || WM["paint-white"], 1, 1);
  if (selected){ mat.emissive = new THREE.Color(cssVar("--accent")); mat.emissiveIntensity = .22; }
  const mesh = new THREE.Mesh(geo, mat);
  const [mx, mz] = toWorld(...alongWall(w, len / 2));
  mesh.position.set(mx, 0, mz); mesh.rotation.y = ry;
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = {kind:"wall", id:w.i};
  roomGroup.add(mesh); pickables.push(mesh);
  return mesh;
}

// Glass and frame (windows, glass doors) or a door leaf, sitting inside the wall opening.
function buildOpening(o, w, selected){
  const {normal} = wallFrame(w), isDoor = o.type === "door";
  const c = alongWall(w, o.offset + o.width / 2), [x, z] = toWorld(c[0] - normal[0] * T / 2, c[1] - normal[1] * T / 2);
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = Math.atan2(normal[0], normal[1]);
  const accent = selected ? new THREE.Color(cssVar("--accent")) : null;
  const add = (mesh, mx, my, mz, shadow = true) => { mesh.position.set(mx, my, mz); mesh.castShadow = shadow; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const sill = isDoor ? 0 : o.sill, cy = sill + o.height / 2;

  if (isDoor){
    const leaf = new THREE.MeshStandardMaterial({color:0x6b4e3a, roughness:.6});
    if (accent){ leaf.emissive = accent; leaf.emissiveIntensity = .3; }
    add(new THREE.Mesh(new THREE.BoxGeometry(o.width - .02, o.height - .01, .04), leaf), 0, cy - .005, 0);
    const brass = new THREE.MeshStandardMaterial({color:0xc9b48a, metalness:.85, roughness:.3});
    for (const k of [.035, -.035]) add(new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), brass), o.width / 2 - .09, 1.0, k);
  } else {
    // glass lets light through (no shadow); frame and mullions cast thin shadows like real ones
    const glass = new THREE.MeshStandardMaterial({color:accent || 0xd9ecf6, transparent:true, opacity:accent ? .35 : .16, roughness:.04, metalness:0, depthWrite:false, side:THREE.DoubleSide});
    add(new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), glass), 0, cy, 0, false);
    const fm = new THREE.MeshStandardMaterial({color:0xf2f2f0, roughness:.5});
    if (accent){ fm.emissive = accent; fm.emissiveIntensity = .35; }
    const t = .05, d = .07, bar = (bw, bh, bx, by) => add(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d), fm), bx, by, 0);
    bar(o.width, t, 0, sill + o.height - t / 2); bar(t, o.height, -o.width / 2 + t / 2, cy); bar(t, o.height, o.width / 2 - t / 2, cy);
    if (sill > 0) bar(o.width, t, 0, sill + t / 2);
    const panes = Math.max(1, Math.round(o.width / .8));          // a mullion roughly every 80 cm
    for (let i = 1; i < panes; i++) bar(t * .7, o.height, -o.width / 2 + i * o.width / panes, cy);
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
