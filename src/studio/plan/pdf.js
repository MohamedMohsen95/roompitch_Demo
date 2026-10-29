// PDF floor plans: count the pages and draw one page as an image, in the browser (pdf.js, loaded only when a PDF is chosen).
let lib = null;
async function pdfjs(){
  if (!lib){
    const [mod, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    mod.GlobalWorkerOptions.workerSrc = worker.default;
    lib = mod;
  }
  return lib;
}

const open = async (file) => (await pdfjs()).getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;

export async function pdfPageCount(file){
  const doc = await open(file);
  try { return doc.numPages; } finally { doc.destroy(); }
}

// One page (1-based) as a JPEG data URL, at most maxSide px on its long side, on white.
export async function renderPdfPage(file, page, maxSide = 2400){
  const doc = await open(file);
  try {
    const p = await doc.getPage(page);
    const base = p.getViewport({scale:1});
    const viewport = p.getViewport({scale:maxSide / Math.max(base.width, base.height)});
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({canvas, canvasContext:ctx, viewport}).promise;
    return {dataUrl:canvas.toDataURL("image/jpeg", .9), w:canvas.width, h:canvas.height};
  } finally { doc.destroy(); }
}
