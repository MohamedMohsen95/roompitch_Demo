// Minimal PNG reader for tests: 8-bit grey, grey+alpha, RGB, RGBA and palette images, not interlaced.
// Returns {w, h, data: Uint8ClampedArray RGBA}, like the browser's ImageData.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

export function readPng(path){
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG: " + path);
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (pos < buf.length){
    const len = buf.readUInt32BE(pos), kind = buf.toString("ascii", pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR"){ w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace}): ${path}`);
  const ch = {0:1, 2:3, 3:1, 4:2, 6:4}[type];
  if (!ch) throw new Error("unsupported colour type " + type);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++){
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++){
      const a = x >= ch ? row[x - ch] : 0, b = up ? up[x] : 0, c = up && x >= ch ? up[x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4){ const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[x] = v & 255;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++){
    const s = i * ch, d = i * 4;
    if (type === 0){ data[d] = data[d + 1] = data[d + 2] = px[s]; data[d + 3] = 255; }
    else if (type === 4){ data[d] = data[d + 1] = data[d + 2] = px[s]; data[d + 3] = px[s + 1]; }
    else if (type === 2){ data[d] = px[s]; data[d + 1] = px[s + 1]; data[d + 2] = px[s + 2]; data[d + 3] = 255; }
    else if (type === 6){ data[d] = px[s]; data[d + 1] = px[s + 1]; data[d + 2] = px[s + 2]; data[d + 3] = px[s + 3]; }
    else { const k = px[s]; data[d] = palette[k * 3]; data[d + 1] = palette[k * 3 + 1]; data[d + 2] = palette[k * 3 + 2]; data[d + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return {w, h, data};
}
