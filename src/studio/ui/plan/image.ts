// Plan images in the browser: redraw on white, at most maxSide px on the long side, as JPEG.
export function loadImage(src: string, maxSide: number): Promise<{dataUrl: string, w: number, h: number}>{
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";   // a stored plan (signed link): keep the canvas readable
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve({dataUrl:c.toDataURL("image/jpeg", .88), w:c.width, h:c.height});
    };
    img.onerror = () => reject(new Error("not an image"));
    img.src = src;
  });
}
