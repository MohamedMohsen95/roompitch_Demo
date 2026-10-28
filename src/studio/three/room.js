// Floor, solid walls with real window/door openings, a ceiling, and the glass/doors in the openings,
// for any room outline (S.poly; wall i runs from corner i to corner i+1).
//
// Walls are 12 cm thick and, like the ceiling, cast shadows: sunlight only gets into the room
// through the openings. Walls (and the ceiling) between the camera and the room are hidden
// "dollhouse" style so you can see in, but they keep casting shadows.
import * as THREE from "three";
import { S } from "../state.js";
import { WM, FM, OPENING_TEX, texMaps } from "../catalog.js";
import { wallsOf, wallFrame, alongWall } from "../geometry.js";
import { openingsOn } from "../openings.js";
import { matCanvas } from "../textures.js";
import { cssVar } from "../utils.js";
import { roomGroup, pickables } from "./scene.js";
import { updateSun } from "./sun.js";
import { disposeTree } from "./models.js";
import { photoMaterial } from "./photo-tex.js";

const T = .12;            // wall thickness
let cullables = [];       // [{objs:[meshes], test:(camera) => hidden?}]

// Texture repeats w/tile × h/tile times; pass 1, 1 for geometry whose UVs are already in metres.
// Finishes with a photo texture (catalog.js tex) use it; the others are drawn in code (textures.js).
function surfaceMat(m, w, h){
  const maps = texMaps(m);
  if (maps) return photoMaterial(maps, w / m.tile, h / m.tile, {turn:m.turn});
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

// What fills a wall opening, in the opening's own frame: x along the wall, y up, z towards the room
// (z = ±T/2 are the wall's two faces). Every opening gets a lining over the cut wall and a casing (architrave)
// on both faces. A door gets a panelled walnut leaf with lever handles; a window or glass door gets a white
// frame, a sash per ~80 cm with glass, and an inside sill board when it sits above the floor.
function buildOpening(o, w, selected){
  const {normal} = wallFrame(w), isDoor = o.type === "door";
  const c = alongWall(w, o.offset + o.width / 2), [x, z] = toWorld(c[0] - normal[0] * T / 2, c[1] - normal[1] * T / 2);
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = Math.atan2(normal[0], normal[1]);
  const accent = selected ? new THREE.Color(cssVar("--accent")) : null;
  const glow = (m, k) => { if (accent){ m.emissive = accent; m.emissiveIntensity = k; } return m; };
  const add = (mesh, mx, my, mz, shadow = true) => { mesh.position.set(mx, my, mz); mesh.castShadow = shadow; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const box = (bw, bh, bd, mat, bx, by, bz, shadow) => add(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat), bx, by, bz, shadow);
  const W = o.width, Hh = o.height, sill = isDoor ? 0 : o.sill, top = sill + Hh, cy = sill + Hh / 2;

  const wood = OPENING_TEX.door, woodMaps = texMaps(wood);
  const woodMat = (bw, bh) => glow(woodMaps ? photoMaterial(woodMaps, bw / wood.tile, bh / wood.tile, {normalScale:.6, turn:wood.turn && bh > bw})
                                            : new THREE.MeshStandardMaterial({color:0x6b4e3a, roughness:.6}), .3);
  const paint = glow(new THREE.MeshStandardMaterial({color:0xf3f2ee, roughness:.45}), .35);
  const trim = isDoor ? woodMat(.1, Hh) : paint;
  const steel = new THREE.MeshStandardMaterial({color:0xc8c8c4, metalness:.9, roughness:.28});

  // Lining over the cut faces of the wall, and a 7 cm casing on both faces.
  const L = .025, cw = .07, ct = .015;
  box(L, Hh, T + .004, trim, -W / 2 + L / 2, cy, 0); box(L, Hh, T + .004, trim, W / 2 - L / 2, cy, 0);
  box(W, L, T + .004, trim, 0, top - L / 2, 0);
  if (sill > 0) box(W, L, T + .004, paint, 0, sill + L / 2, 0);
  for (const side of [1, -1]){
    const cz = side * (T / 2 + ct / 2);
    box(cw, Hh + cw, ct, trim, -W / 2 - cw / 2 + .01, cy + cw / 2, cz); box(cw, Hh + cw, ct, trim, W / 2 + cw / 2 - .01, cy + cw / 2, cz);
    box(W + 2 * cw - .02, cw, ct, trim, 0, top + cw / 2, cz);
    if (sill > 0 && side < 0) box(W + 2 * cw - .02, cw, ct, trim, 0, sill - cw / 2, cz);
  }

  if (isDoor){
    // Leaf with two raised panels per face (mouldings), and a lever handle on each side.
    const lw = W - 2 * L - .006, lh = Hh - L - .008, lt = .04, ly = lh / 2 + .004;
    box(lw, lh, lt, woodMat(lw, lh), 0, ly, 0);
    const pw = lw - .24, m = .022, panels = [[.12 + (lh * .52) / 2, lh * .52], [lh - .12 - (lh * .27) / 2, lh * .27]];
    for (const side of [1, -1]) for (const [py, ph] of panels){
      const mz = side * (lt / 2 + .005), mm = woodMat(pw, ph);
      box(pw, m, .01, mm, 0, py + ph / 2 - m / 2, mz, false); box(pw, m, .01, mm, 0, py - ph / 2 + m / 2, mz, false);
      box(m, ph, .01, mm, -pw / 2 + m / 2, py, mz, false); box(m, ph, .01, mm, pw / 2 - m / 2, py, mz, false);
    }
    const hx = lw / 2 - .075;
    for (const side of [1, -1]){
      const rose = add(new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .01, 24), steel), hx, 1.02, side * (lt / 2 + .005), false);
      rose.rotation.x = Math.PI / 2;
      box(.035, .025, .012, steel, hx, .93, side * (lt / 2 + .006), false);                  // key escutcheon
      box(.13, .018, .018, steel, hx - .055, 1.02, side * (lt / 2 + .045), false);          // lever
      box(.018, .018, .04, steel, hx, 1.02, side * (lt / 2 + .025), false);                 // neck
    }
  } else {
    // Outer frame set towards the outside face, sashes with glass, a thin handle on each sash.
    const fz = -T / 4, fd = .07, f = .055, iw = W - 2 * L, ih = Hh - L - (sill > 0 ? L : 0), iy = (sill > 0 ? sill + L : 0) + ih / 2;
    box(f, ih, fd, paint, -iw / 2 + f / 2, iy, fz); box(f, ih, fd, paint, iw / 2 - f / 2, iy, fz);
    box(iw, f, fd, paint, 0, iy + ih / 2 - f / 2, fz); box(iw, f, fd, paint, 0, iy - ih / 2 + f / 2, fz);
    const glass = new THREE.MeshStandardMaterial({color:accent || 0xdfeef5, transparent:true, opacity:accent ? .35 : .14, roughness:.03, metalness:.1, depthWrite:false, side:THREE.DoubleSide});
    const panes = Math.max(1, Math.round(iw / .8)), sw = (iw - 2 * f) / panes, sh = ih - 2 * f, s = .045;
    for (let i = 0; i < panes; i++){
      const sx = -iw / 2 + f + sw * (i + .5);
      box(sw, s, .05, paint, sx, iy + sh / 2 - s / 2, fz + .005); box(sw, s, .05, paint, sx, iy - sh / 2 + s / 2, fz + .005);
      box(s, sh, .05, paint, sx - sw / 2 + s / 2, iy, fz + .005); box(s, sh, .05, paint, sx + sw / 2 - s / 2, iy, fz + .005);
      add(new THREE.Mesh(new THREE.PlaneGeometry(sw - 2 * s, sh - 2 * s), glass), sx, iy, fz + .005, false);
      const hx = sx + (i % 2 ? -1 : 1) * (sw / 2 - s / 2), hy = Math.min(iy, 1.1);
      box(.016, .12, .016, steel, hx, hy, fz + .045, false);
    }
    // Inside window board: a little wider than the opening, standing 5 cm into the room.
    if (sill > 0) box(W + .12, .025, T / 2 + .05, paint, 0, sill + .0125, T / 4 + .025);
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
