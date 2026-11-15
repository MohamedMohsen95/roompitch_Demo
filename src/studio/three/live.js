// The Live switch of walk mode: path tracing the view as you walk (livetrace.js, loaded the first time it's
// switched on: WebGPU three.js, the tracer and the denoiser are a large download). Off again when the walk
// ends, the 3D view leaves the page or the Path-traced dialog takes the GPU.
import { subscribe } from "../store.js";
import { isWalking } from "./walk.js";
import { host } from "./scene.js";

/** @typedef {{on: boolean, phase: "off"|"preparing"|"moving"|"tracing"|"denoised"|"error", samples: number, rate: number}} Live */
/** @type {Live} */
let state = {on:false, phase:"off", samples:0, rate:0};
let session = null;
const subs = new Set();
function set(p){ state = {...state, ...p}; for (const fn of subs) fn(); }

export const liveState = () => state;
export const onLive = (fn) => { subs.add(fn); return () => { subs.delete(fn); }; };
export const canLive = () => typeof navigator !== "undefined" && "gpu" in navigator;

export async function startLive(){
  if (state.on || !host) return;
  set({on:true, phase:"preparing", samples:0, rate:0});
  const { startLiveTrace } = await import("./livetrace.js");
  if (!state.on) return;   // switched off while it loaded
  session = startLiveTrace(host, {onStatus(s){
    if (s.phase !== "error") return set(s);
    stopLive(); set({phase:"error"});
  }});
}

export function stopLive(){
  if (!state.on) return;
  session?.dispose(); session = null;
  set({on:false, phase:"off", samples:0, rate:0});
}

subscribe(() => { if (state.on && !isWalking()) stopLive(); });
