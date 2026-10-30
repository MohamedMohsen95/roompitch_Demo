// Furniture in 3D: built-in pieces from boxes, real models from glTF, plus the selection outline.
import * as THREE from "three";
import { S, isSelectedItem } from "../state.js";
import { FU, texMaps } from "../catalog.js";
import { shade, cssVar } from "../utils.js";
import { scene, itemGroup } from "./scene.js";
import { loadModel, fitModel, disposeTree } from "./models.js";
import { photoMaterial, photoMapsReady } from "./photo-tex.js";
import { multiIds } from "../selection.js";

const itemObjs = new Map();   // item id -> THREE.Group
let selHelpers = [];

// One piece as the 3D view draws it, for any catalog id: the group, and `ready`, which resolves once a real
// model (and a rug's photo) has loaded into it. Used for the room (buildItem) and the library thumbnails (thumbs.js).
export function buildPiece(type){
  const f = FU[type], g = new THREE.Group(), {w, d, h, c} = f;
  let ready = Promise.resolve();
  const box = (bw, bh, bd, x, y, z, col, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshStandardMaterial({color:new THREE.Color(col), roughness:.8}));
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m;
  };
  if (f.model){
    // Faint placeholder box until the model arrives, then swap it in.
    const ph = box(w, h, d, 0, h / 2, 0, c);
    ph.material.transparent = true; ph.material.opacity = .35;
    ready = loadModel(f.model).then(src => {
      g.remove(ph); ph.geometry.dispose(); ph.material.dispose();
      const m = fitModel(src.clone(true), w, d, h);
      m.traverse(n => { n.userData.itemId = g.userData.id; });
      g.add(m);
      return m;
    }, err => { console.error("Model failed to load", f.model, err); ph.material.opacity = 1; throw err; });
  }
  // Rugs: a thin slab; with a photo texture its fabric covers the top at real scale.
  if (f.rug){
    const maps = texMaps(f);
    const rug = box(w, .012, d, 0, .006, 0, c, false);
    if (maps){ rug.material.dispose(); rug.material = photoMaterial(maps, w / f.tile, d / f.tile, {normalScale:1.4}); ready = photoMapsReady(maps); }
  }
  else switch (type){
    case "sofa":
      box(w, .42, d, 0, .21, 0, c); box(w, .44, .2, 0, .64, -d / 2 + .1, shade(c, -.1));
      box(.18, .22, d, -w / 2 + .09, .53, 0, c); box(.18, .22, d, w / 2 - .09, .53, 0, c);
      for (let i = 0; i < 3; i++) box((w - .4) / 3 - .03, .1, d - .3, -w / 2 + .2 + (i + .5) * (w - .4) / 3, .47, .05, shade(c, .08));
      break;
    case "armchair":
      box(w, .42, d, 0, .21, 0, c); box(w, .44, .18, 0, .64, -d / 2 + .09, shade(c, -.1));
      box(.12, .2, d, -w / 2 + .06, .52, 0, c); box(.12, .2, d, w / 2 - .06, .52, 0, c); break;
    case "ctable": case "dtable": {
      box(w, .05, d, 0, h - .025, 0, c);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.05, h - .05, .05, sx * (w / 2 - .07), (h - .05) / 2, sz * (d / 2 - .07), shade(c, -.2));
      if (type === "dtable") for (let i = 0; i < 3; i++) for (const sz of [-1, 1]){
        const x = -w / 2 + (i + .5) * w / 3, z = sz * (d / 2 + .25);
        box(.42, .05, .42, x, .45, z, "#8b7a68"); box(.42, .45, .04, x, .7, z + sz * .19, "#8b7a68");
      }
      break;
    }
    case "tvunit":
      box(w, h, d, 0, h / 2, 0, c); box(1.25, .72, .04, 0, h + .55, -d / 2 + .08, "#141414"); break;
    case "bed":
      box(w, .32, d, 0, .16, 0, "#8a7a66"); box(w - .06, .2, d - .12, 0, .42, .04, c);
      box(w, 1, .08, 0, .5, -d / 2 + .04, "#7a6a58");
      box(.6, .12, .35, -w / 4, .58, -d / 2 + .32, "#f1eee8"); box(.6, .12, .35, w / 4, .58, -d / 2 + .32, "#f1eee8"); break;
    case "plant": {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(.17, .13, .4, 20), new THREE.MeshStandardMaterial({color:0xd6d0c4, roughness:.9}));
      pot.position.y = .2; pot.castShadow = true; g.add(pot);
      for (let i = 0; i < 4; i++){
        const s = new THREE.Mesh(new THREE.SphereGeometry(.2 + i * .02, 16, 12), new THREE.MeshStandardMaterial({color:new THREE.Color(shade(c, (i - 1.5) * .08)), roughness:.9}));
        s.position.set(Math.sin(i * 1.7) * .09, .62 + i * .14, Math.cos(i * 1.7) * .09); s.castShadow = true; g.add(s);
      }
      break;
    }
  }
  return {group:g, ready};
}

function buildItem(it){
  const {group:g, ready} = buildPiece(it.type);
  g.userData = {kind:"item", id:it.id};
  g.traverse(n => { n.userData.itemId = it.id; });
  ready.then(() => { if (isSelectedItem(it.id)) refreshHelper(); }, () => {});
  return g;
}

// Room coordinates (metres from the north-west corner) -> scene coordinates (centred).
function placeObj(obj, it){ obj.position.set(it.x - S.L / 2, it.z || 0, it.y - S.W / 2); obj.rotation.y = it.rot * Math.PI / 180; }

export function buildItems(){
  while (itemGroup.children.length) disposeTree(itemGroup.children.pop());
  itemObjs.clear();
  for (const it of S.items){ const o = buildItem(it); placeObj(o, it); itemGroup.add(o); itemObjs.set(it.id, o); }
  refreshHelper();
}

export function syncItem(it){ const o = itemObjs.get(it.id); if (o){ placeObj(o, it); refreshHelper(); } }
// Reposition every piece (after a move that may have carried or re-stacked others).
export function syncAll(){ for (const it of S.items){ const o = itemObjs.get(it.id); if (o) placeObj(o, it); } refreshHelper(); }

// The box around these pieces in the scene (null if none is built).
export function itemsBox(ids){
  const box = new THREE.Box3();
  for (const id of ids){ const o = itemObjs.get(id); if (o) box.expandByObject(o); }
  return box.isEmpty() ? null : box;
}

export function refreshHelper(){
  for (const h of selHelpers){ scene.remove(h); h.geometry.dispose(); }
  selHelpers = [];
  const ids = multiIds().length ? multiIds() : S.sel && S.sel.kind === "item" ? [S.sel.id] : [];
  for (const id of ids){
    const o = itemObjs.get(id);
    if (o){ const h = new THREE.BoxHelper(o, new THREE.Color(cssVar("--accent"))); scene.add(h); selHelpers.push(h); }
  }
}

// Called every frame so the outline follows a model that finished loading.
export function updateHelper(){ for (const h of selHelpers) h.update(); }
