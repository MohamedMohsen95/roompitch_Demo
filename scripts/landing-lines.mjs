// npm run landing-lines: the landing page's furniture as ready-made line drawings.
// The page draws each model as its edges. Working those out in the browser meant downloading every GLB
// (about 4 MB) and blocking the page for most of a second while the hero animates (the potted plant alone
// has 154k triangles). This does it once: each model's edges (35° crease), stood on the floor and centred,
// packed as 16-bit positions in public/landing/lines.bin, with the index in src/landing/lines.json.
// Run it again after changing a model or the pieces the landing page shows.
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const MAX_SEGS = 11000;   // past this a drawing is mostly noise (leaves); keep an even spread of its edges

const room = JSON.parse(readFileSync("src/landing/room.json", "utf8"));
const page = readFileSync("src/landing/LandingPage.tsx", "utf8");
const models = [...new Set([...room.items.map(i => i.model), ...[...page.matchAll(/model:"([^"]+\.glb)"/g)].map(m => m[1])].filter(Boolean))];

await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// Only the shapes are needed: skip every texture (Node has no image decoder anyway).
loader.register(parser => { parser.assignTexture = () => Promise.resolve(null); return {name:"no-textures"}; });

const index = {}, chunks = [];
let offset = 0;
for (const url of models){
  const buf = readFileSync("public" + url);
  const gltf = await new Promise((ok, bad) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", ok, bad));
  const obj = gltf.scene; obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  let pts = [];
  obj.traverse(n => {
    if (!n.isMesh) return;
    const e = new THREE.EdgesGeometry(n.geometry, 35).applyMatrix4(n.matrixWorld);
    for (const v of e.attributes.position.array) pts.push(v);
  });
  let segs = pts.length / 6;
  if (segs > MAX_SEGS){
    const keep = [], step = segs / MAX_SEGS;
    for (let s = 0; s < MAX_SEGS; s++){ const i = Math.floor(s * step) * 6; for (let k = 0; k < 6; k++) keep.push(pts[i + k]); }
    pts = keep; segs = MAX_SEGS;
  }
  // Positions relative to the model standing centred on the floor, as fractions of its size.
  const lo = [c.x - size.x / 2, box.min.y, c.z - size.z / 2], dim = [size.x, size.y, size.z];
  const q = new Uint16Array(pts.length);
  for (let i = 0; i < pts.length; i++){ const a = i % 3; q[i] = Math.round(Math.min(1, Math.max(0, (pts[i] - (a === 1 ? box.min.y : lo[a])) / (dim[a] || 1))) * 65535); }
  index[url] = {offset, count:q.length, size:dim.map(v => +v.toFixed(5))};
  chunks.push(Buffer.from(q.buffer)); offset += q.byteLength;
  console.log(url.split("/").pop().padEnd(36), String(segs).padStart(6), "segments");
}
writeFileSync("public/landing/lines.bin", Buffer.concat(chunks));
writeFileSync("src/landing/lines.json", JSON.stringify(index, null, 1) + "\n");
console.log(`lines.bin ${(offset / 1024).toFixed(0)} KB, ${models.length} models`);
