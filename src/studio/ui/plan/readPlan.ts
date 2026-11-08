// Reading a floor plan in the browser: the walls and rooms in a Web Worker (plan/read-worker.js), and,
// when the AI is on, the room names and sizes (/api/plan) and where each name is written (/api/point).
// The result is a flat with only the rooms the program is sure of, plus a handle for click-to-fill and
// gap-snapped doors (kept in memory, not saved).
import { getCode } from "../../render-ai.js";
import type { Flat } from "../../plan/flat";
import { loadImage } from "./image";

export type WallHandle = {
  ok: boolean;                                   // the plan was clear enough to read rooms from
  thick: number;                                 // wall thickness in plan px
  fillAt: (p: [number, number]) => Promise<{outline: [number, number][], areaPx: number} | null>;
  gapAt: (p: [number, number], tolPx: number) => Promise<{a: [number, number], b: [number, number], width: number, outside: boolean} | null>;
};
export type ReadResult = {flat: Flat, walls: WallHandle, notice: string | null, needCode: boolean, aiOff: boolean};

let worker: Worker | null = null, seq = 0, generation = 0;
const waiting = new Map<number, {resolve: (v: any) => void, reject: (e: any) => void, timer: ReturnType<typeof setTimeout>}>();
const TIMEOUT = 60_000;
function failAll(why: string){
  for (const w of waiting.values()){ clearTimeout(w.timer); w.reject(new Error(why)); }
  waiting.clear();
  worker?.terminate(); worker = null;
}
function ask(msg: any, transfer: Transferable[] = []): Promise<any>{
  if (!worker){
    worker = new Worker(new URL("../../plan/read-worker.js", import.meta.url), {type:"module"});
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id); if (!w) return;
      waiting.delete(e.data.id); clearTimeout(w.timer);
      if (e.data.ok) w.resolve(e.data.value); else w.reject(new Error(e.data.error));
    };
    // a worker that can't load or runs out of memory must not leave the screen waiting forever
    worker.onerror = (e) => { e.preventDefault?.(); failAll("worker error"); };
    worker.onmessageerror = () => failAll("worker message error");
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error("timeout")); }, TIMEOUT);
    waiting.set(id, {resolve, reject, timer});
    worker!.postMessage({id, ...msg}, transfer);
  });
}

// RGBA pixels of an image (data URL or link), at its own size.
function pixels(src: string, w: number, h: number): Promise<ArrayBuffer>{
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h).data.buffer);
    };
    img.onerror = () => reject(new Error("not an image"));
    img.src = src;
  });
}

async function post(url: string, body: object){
  const r = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json", "x-access-code":getCode()}, body:JSON.stringify(body)});
  const data = await r.json().catch(() => ({}));
  return {status:r.status, ok:r.ok, data};
}

export async function readPlan(image: {dataUrl: string, w: number, h: number}, opts: {ai: boolean, t: (k: string, v?: any) => string}): Promise<ReadResult>{
  const {t} = opts;
  const gen = ++generation, rgba = await pixels(image.dataUrl, image.w, image.h);
  const info = await ask({type:"read", gen, rgba, w:image.w, h:image.h}, [rgba]);
  let notice: string | null = info.quality.ok ? null : t("qualityLow");
  let needCode = false, aiOff = false;
  let text = {rooms:[] as any[]}, points: Record<string, [number, number][]> = {};
  if (opts.ai && info.quality.ok){
    try {
      const small = await loadImage(image.dataUrl, 1600);
      const read = await post("/api/plan", {image:small.dataUrl});
      if (read.status === 401){ needCode = true; notice = t("enterCode"); }
      else if (read.status === 503){ aiOff = true; notice = t("planOff"); }
      else if (!read.ok) notice = read.data.error || t("wentWrong", {s:read.status});
      else {
        text = {rooms:Array.isArray(read.data.rooms) ? read.data.rooms : []};
        const names = [...new Set(text.rooms.map((r: any) => r.name))];
        if (names.length && info.candidates > 0){           // no rooms to name: don't spend the allowance
          const pt = await post("/api/point", {image:small.dataUrl, w:small.w, h:small.h, names});
          if (pt.ok) for (const [name, list] of Object.entries(pt.data.points || {}))
            points[name] = (list as [number, number][]).map(([x, y]) => [x * image.w, y * image.h]);
          else notice = pt.data.error || t("wentWrong", {s:pt.status});
        }
      }
    } catch { notice = t("noServer"); }
  }
  const flat: Flat = await ask({type:"assemble", gen, text, points, image:{w:image.w, h:image.h}});
  flat.image = {...flat.image, dataUrl:image.dataUrl};
  const walls: WallHandle = {
    ok:info.quality.ok, thick:info.thick,
    fillAt:(p) => ask({type:"fill", gen, p}).catch(() => null),
    gapAt:(p, tolPx) => ask({type:"gap", gen, p, tol:tolPx}).catch(() => null)
  };
  return {flat, walls, notice, needCode, aiOff};
}
