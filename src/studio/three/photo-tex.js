// Photo textures (catalog.js texMaps): colour, normal and AO/roughness maps, each file loaded once and
// shared between rebuilds of the room. Textures are marked cached so disposeTree() leaves them alone.
import * as THREE from "three";

const loader = new THREE.TextureLoader();
const files = new Map();     // url -> texture as loaded
const loaded = new Map();    // url -> Promise, settled once its image has arrived (or failed)
const tiled = new Map();     // url|repeat -> clone with that repeat (shares the image)

function map(url, rx, ry, srgb, turn){
  let src = files.get(url);
  if (!src){
    let done;
    loaded.set(url, new Promise(res => { done = res; }));
    src = loader.load(url, () => done(), undefined, () => { console.warn("Texture failed to load", url); done(); });
    src.wrapS = src.wrapT = THREE.RepeatWrapping; src.anisotropy = 8;
    if (srgb) src.colorSpace = THREE.SRGBColorSpace;
    src.userData.cached = true;
    files.set(url, src);
  }
  const key = `${url}|${rx.toFixed(3)}|${ry.toFixed(3)}|${turn}`;
  let t = tiled.get(key);
  if (!t){
    t = src.clone(); t.userData.cached = true;
    // Turned a quarter: the photo's rows run up the surface (vertical wood grain), so the repeats swap.
    if (turn){ t.rotation = Math.PI / 2; t.repeat.set(ry, rx); } else t.repeat.set(rx, ry);
    tiled.set(key, t);
  }
  return t;
}

// Some scans are almost mirror-smooth (herringbone parquet averages 0.1). With no reflections of a real
// room to show, direct sun on them is just a white hot spot, so the roughness map is read with a floor:
// polished surfaces look satin instead, and reflect half as strongly so wood keeps its colour at low angles.
const MIN_ROUGHNESS = .5;
function roughnessFloor(mat){
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor = max(roughnessFactor, ${MIN_ROUGHNESS.toFixed(2)});
      #endif`);
  };
  mat.customProgramCacheKey = () => "roughness-floor";
  return mat;
}

// Resolves when the photo maps of `maps` have arrived (after photoMaterial() asked for them).
export const photoMapsReady = (maps) => Promise.all(Object.values(maps).map(u => u && loaded.get(u))).then(() => {});

// A material showing the photo texture `maps` repeated rx × ry times over the geometry's 0..1 UVs
// (or once per metre / per tile when the UVs are already in metres). turn: rotate the photo a quarter.
export function photoMaterial(maps, rx, ry, {normalScale = 1, turn = false} = {}){
  const arm = maps.arm && map(maps.arm, rx, ry, false, turn);
  return roughnessFloor(new THREE.MeshPhysicalMaterial({
    map:map(maps.base, rx, ry, true, turn),
    normalMap:maps.normal ? map(maps.normal, rx, ry, false, turn) : null, normalScale:new THREE.Vector2(normalScale, normalScale),
    roughnessMap:arm, roughness:arm ? 1 : .8,
    aoMap:arm, aoMapIntensity:.7,
    metalness:0, specularIntensity:.5
  }));
}
