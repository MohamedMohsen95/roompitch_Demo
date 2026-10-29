// Image work done in the browser: resizing uploads, merging an AI edit through the brush mask,
// and the tinted "demo render" used when no AI key is set.
import { MAX_SIDE } from "./data";

export type Img = {src: string, w: number, h: number};

const canvas = (w: number, h: number) => Object.assign(document.createElement("canvas"), {width: w, height: h});

export function loadImage(src: string): Promise<HTMLImageElement>{
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image"));
    img.src = src;
  });
}

// Resize to MAX_SIDE and re-encode as JPEG (keeps uploads small and fast).
export async function fileToResizedDataUrl(file: Blob, maxSide = MAX_SIDE, type = "image/jpeg"): Promise<Img>{
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    // Most image models prefer dimensions divisible by 8.
    const w = Math.max(8, Math.round(img.naturalWidth * scale / 8) * 8);
    const h = Math.max(8, Math.round(img.naturalHeight * scale / 8) * 8);
    const c = canvas(w, h), ctx = c.getContext("2d")!;
    if (type === "image/jpeg"){ ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    return {src: c.toDataURL(type, 0.9), w, h};
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Shrink a data-URI image so its longest side is at most maxSide (some AI providers require it).
export async function downscaleDataUrl(src: string, maxSide: number){
  const img = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1) return src;
  const w = Math.max(8, Math.floor(img.naturalWidth * scale / 8) * 8);
  const h = Math.max(8, Math.floor(img.naturalHeight * scale / 8) * 8);
  const c = canvas(w, h);
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.92);
}

// Turn a black/white mask into an alpha mask (white = keep), optionally softened.
function alphaMask(mask: HTMLImageElement, w: number, h: number, blur = 0){
  const mc = canvas(w, h), mctx = mc.getContext("2d", {willReadFrequently: true})!;
  if (blur) mctx.filter = `blur(${blur}px)`;
  mctx.drawImage(mask, 0, 0, w, h);
  const id = mctx.getImageData(0, 0, w, h);
  for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = id.data[i];
  mctx.putImageData(id, 0, 0);
  return mc;
}

// Paste `newSrc` over `baseSrc` only where the mask is white, with a soft edge.
export async function compositeWithMask(baseSrc: string, newSrc: string, maskSrc: string){
  const [base, next, mask] = await Promise.all([loadImage(baseSrc), loadImage(newSrc), loadImage(maskSrc)]);
  const w = base.naturalWidth, h = base.naturalHeight;
  const c = canvas(w, h), ctx = c.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  const layer = canvas(w, h), lc = layer.getContext("2d")!;
  lc.drawImage(next, 0, 0, w, h);
  lc.globalCompositeOperation = "destination-in";
  lc.drawImage(alphaMask(mask, w, h, Math.max(2, Math.round(w / 200))), 0, 0);
  ctx.drawImage(layer, 0, 0);
  return c.toDataURL("image/jpeg", 0.92);
}

// Demo mode: no AI key yet, so we fake a render by tinting the photo.
export async function demoRender(baseSrc: string, tint: string, maskSrc?: string){
  await new Promise(r => setTimeout(r, 900 + Math.random() * 700));
  const base = await loadImage(baseSrc);
  const w = base.naturalWidth, h = base.naturalHeight;
  const c = canvas(w, h), ctx = c.getContext("2d")!;
  ctx.drawImage(base, 0, 0);

  // The restyled layer
  const layer = canvas(w, h), lc = layer.getContext("2d")!;
  lc.filter = "saturate(0.75) contrast(1.08) brightness(1.06)";
  lc.drawImage(base, 0, 0);
  lc.filter = "none";
  lc.globalCompositeOperation = "color";
  lc.globalAlpha = 0.55;
  lc.fillStyle = tint;
  lc.fillRect(0, 0, w, h);
  lc.globalAlpha = 1;
  if (maskSrc){
    // Only keep the restyled layer inside the painted mask.
    lc.globalCompositeOperation = "destination-in";
    lc.drawImage(alphaMask(await loadImage(maskSrc), w, h), 0, 0);
  }
  lc.globalCompositeOperation = "source-over";
  ctx.drawImage(layer, 0, 0);

  // Label so nobody mistakes it for a real render
  const fs = Math.round(w / 34);
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  const label = "DEMO — add an AI key in .env for real renders";
  const tw = ctx.measureText(label).width;
  // Bottom-right, so it stays visible on the "After" side of the comparison slider.
  const x = w - tw - fs * 1.8;
  ctx.fillStyle = "rgba(20,20,20,.62)";
  ctx.fillRect(x - fs * 0.6, h - fs * 2.4, tw + fs * 1.2, fs * 1.8);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x, h - fs * 1.1);
  return c.toDataURL("image/jpeg", 0.9);
}
