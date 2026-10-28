// Real 3D furniture (glTF/GLB from public/models): load once, clone per placed copy.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const cache = new Map();
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // also reads Meshopt-compressed models

// Meshes from a loaded model are shared by all its copies (userData.shared), so they're never disposed.
export function loadModel(url){
  if (!cache.has(url)) cache.set(url, new Promise((resolve, reject) => {
    loader.load(url, gltf => {
      gltf.scene.traverse(n => { n.userData.shared = true; if (n.isMesh){ n.castShadow = true; n.receiveShadow = true; } });
      resolve(gltf.scene);
    }, undefined, reject);
  }));
  return cache.get(url);
}

// Fit a model into the catalog footprint (w × d × h), centred, standing on the floor.
export function fitModel(obj, w, d, h){
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = Math.min(w / size.x, d / size.z, h / size.y);
  obj.scale.setScalar(k);
  obj.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  return obj;
}

// Free GPU memory of a removed object, except shared model parts and cached photo textures (photo-tex.js).
export function disposeTree(o){
  o.traverse(n => {
    if (n.userData.shared) return;
    if (n.geometry) n.geometry.dispose();
    if (n.material){ if (n.material.map && !n.material.map.userData.cached) n.material.map.dispose(); n.material.dispose(); }
  });
}
