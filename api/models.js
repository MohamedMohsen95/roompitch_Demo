// RoomPitch — furniture catalog from 3D model files.
//
// GET /api/models -> { models: [{ id, name, w, d, h, price, c, model }] }
//
// Every .gltf/.glb in public/models/<any folder>/ shows up in the Room Studio's furniture library
// on the next page load. Best: put the original in models-src/<folder>/ and run `npm run models`,
// which writes a compressed .glb here (a 5 MB model becomes ~200 KB).
// Size comes from the model itself (glTF units are metres): w = width (x), d = depth (z), h = height (y).
// The price is a placeholder between 5,000 and 12,000, fixed per model name so it doesn't change on reload.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const MODELS_DIR = fileURLToPath(new URL("../public/models/", import.meta.url));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const files = await findModelFiles(MODELS_DIR).catch(() => []);
  const models = [];
  for (const file of files) {
    try {
      const gltf = await readGltfJson(file);
      const size = measure(gltf);
      if (!size) continue;
      const name = niceName(file);
      const url = "models/" + relative(MODELS_DIR, file).split(/[\\/]/).map(encodeURIComponent).join("/");
      models.push({
        id: "m-" + slug(relative(MODELS_DIR, file)),
        name,
        w: round2(size.x), d: round2(size.z), h: round2(size.y),
        price: placeholderPrice(name),
        c: "#8a8580",
        model: url
      });
    } catch (err) {
      console.error("Skipping model", file, err.message);
    }
  }
  models.sort((a, b) => a.name.localeCompare(b.name));
  return res.status(200).json({ models });
}

async function findModelFiles(dir, depth = 0) {
  if (depth > 3) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await findModelFiles(p, depth + 1));
    else if (/\.(gltf|glb)$/i.test(e.name)) out.push(p);
  }
  return out;
}

// .gltf is JSON; .glb is binary with the JSON in its first chunk.
async function readGltfJson(file) {
  const buf = await readFile(file);
  if (extname(file).toLowerCase() === ".gltf") return JSON.parse(buf.toString("utf8"));
  if (buf.toString("ascii", 0, 4) !== "glTF") throw new Error("not a GLB file");
  const len = buf.readUInt32LE(12);
  if (buf.toString("ascii", 16, 20) !== "JSON") throw new Error("GLB has no JSON chunk");
  return JSON.parse(buf.toString("utf8", 20, 20 + len));
}

/* ── Bounding box of the default scene, with every node's transform applied ── */

function measure(g) {
  const scene = g.scenes?.[g.scene ?? 0];
  if (!scene) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const visit = (i, parent) => {
    const n = g.nodes[i], m = mul(parent, localMatrix(n));
    for (const prim of g.meshes?.[n.mesh]?.primitives || []) {
      const acc = g.accessors?.[prim.attributes?.POSITION];
      if (!acc?.min || !acc?.max) continue;
      const [lo, hi] = [acc.min, acc.max].map(v => v.map(n => dequantize(n, acc)));
      for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
        const p = apply(m, x, y, z);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
    }
    for (const c of n.children || []) visit(c, m);
  };
  for (const i of scene.nodes || []) visit(i, IDENTITY);
  if (!isFinite(min[0])) return null;
  return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };
}

// Compressed models (KHR_mesh_quantization, e.g. from `npm run models`) store positions as
// normalized integers; the node's transform then scales them back to metres.
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }; // BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT
function dequantize(n, acc) {
  if (!acc.normalized || !NORM[acc.componentType]) return n;
  return Math.max(n / NORM[acc.componentType], acc.componentType % 2 ? 0 : -1);
}

// 4×4 matrices, column-major (glTF's layout).
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function localMatrix(n) {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1
  ];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
const apply = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14]
];

/* ── Names and prices ── */

// "metal_office_desk_2k.gltf" -> "Metal office desk", "ChairDamaskPurplegold.glb" -> "Chair damask purplegold"
function niceName(file) {
  const s = basename(file).replace(/\.(gltf|glb)$/i, "").replace(/[_-]\d+k$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
const slug = (s) => s.replace(/\.(gltf|glb)$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const round2 = (v) => Math.round(v * 100) / 100;

// Same name -> same price, somewhere in 5,000–12,000, rounded to 500.
function placeholderPrice(name) {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return 5000 + Math.round((h % 7001) / 500) * 500;
}
