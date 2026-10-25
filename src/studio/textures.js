// Finish textures drawn in code (no image files): used for library swatches and 3D surfaces.
import { shade, rng } from "./utils.js";

const cache = {};   // keyed by id + colour + kind, so a finish updated from Supabase is drawn again

export function matCanvas(m){
  const key = `${m.id}|${m.c}|${m.kind}`;
  if (cache[key]) return cache[key];
  const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
  const x = c.getContext("2d"), r = rng([...m.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  x.fillStyle = m.c; x.fillRect(0, 0, N, N);
  const noise = (a, n = 2200) => { for (let i = 0; i < n; i++){ x.fillStyle = r() < .5 ? `rgba(0,0,0,${a * r()})` : `rgba(255,255,255,${a * r()})`; x.fillRect(r() * N, r() * N, 2, 2); } };
  switch (m.kind){
    case "paint": noise(.035); break;
    case "panel":
      for (let i = 0; i < 4; i++){
        x.fillStyle = shade(m.c, (r() - .5) * .2); x.fillRect(i * N / 4, 0, N / 4, N);
        for (let k = 0; k < 12; k++){ x.strokeStyle = `rgba(40,20,5,${.06 + r() * .1})`; x.lineWidth = 1; x.beginPath(); const gx = i * N / 4 + r() * N / 4; x.moveTo(gx, 0); x.bezierCurveTo(gx + 6, N * .3, gx - 6, N * .6, gx + 3, N); x.stroke(); }
        x.fillStyle = "rgba(0,0,0,.4)"; x.fillRect(i * N / 4, 0, 2, N);
      } break;
    case "marble":
      noise(.025);
      for (let k = 0; k < 7; k++){ x.strokeStyle = `rgba(95,95,100,${.12 + r() * .25})`; x.lineWidth = .6 + r() * 1.6; x.beginPath(); let px = r() * N, py = 0; x.moveTo(px, py); for (let s = 0; s < 6; s++){ px += (r() - .5) * 90; py += N / 6; x.lineTo(px, py); } x.stroke(); }
      break;
    case "wallpaper":
      noise(.03);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++){ x.fillStyle = shade(m.c, -.16); x.save(); x.translate(i * 32 + 16 + (j % 2) * 16 - 8, j * 32 + 16); x.rotate(Math.PI / 4); x.fillRect(-5, -5, 10, 10); x.restore(); }
      break;
    case "parquet": {
      const rows = 8, pl = N / 1.5;
      for (let j = 0; j < rows; j++){
        const off = ((j * 37) % 3) * pl / 3;
        for (let i = -1; i < 3; i++){ x.fillStyle = shade(m.c, (r() - .5) * .22); x.fillRect(off + i * pl, j * N / rows, pl, N / rows); x.fillStyle = "rgba(50,25,5,.35)"; x.fillRect(off + i * pl, j * N / rows, 1.5, N / rows); }
        x.fillStyle = "rgba(50,25,5,.35)"; x.fillRect(0, j * N / rows, N, 1.5);
      }
      noise(.04); break;
    }
    case "tiles":
      noise(.03); x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(0, 0, N, 2); x.fillRect(0, 0, 2, N); x.fillRect(N / 2, 0, 2, N); break;
    case "concrete":
      noise(.08, 5000);
      for (let k = 0; k < 18; k++){ x.fillStyle = `rgba(0,0,0,${r() * .05})`; x.beginPath(); x.arc(r() * N, r() * N, 10 + r() * 40, 0, 7); x.fill(); }
      break;
  }
  return (cache[key] = c);
}

export const swatchURL = (m) => matCanvas(m).toDataURL("image/png");
