// Pixel-level helpers for reading floor plans, on plain buffers so they run the same in a Web Worker and in
// node tests. Images are {w, h, data: RGBA bytes}; masks are {w, h, m: Uint8Array of 0/1}.
// Angles are degrees, positive = clockwise on screen (y down), about the image centre.

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const newMask = (w, h) => ({w, h, m:new Uint8Array(w * h)});

// The paper: the most common light colour. Transparent pixels count as white.
export function paperColor(img){
  const {data} = img, n = img.w * img.h, bins = new Map();
  const step = Math.max(1, Math.floor(n / 200000));
  for (let i = 0; i < n; i += step){
    const d = i * 4;
    let r = data[d], g = data[d + 1], b = data[d + 2];
    if (data[d + 3] < 128){ r = g = b = 255; }
    if (lum(r, g, b) < 128) continue;
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
    const e = bins.get(key);
    if (e){ e[0]++; e[1] += r; e[2] += g; e[3] += b; } else bins.set(key, [1, r, g, b]);
  }
  let best = null;
  for (const e of bins.values()) if (!best || e[0] > best[0]) best = e;
  if (!best) return [255, 255, 255];
  return [Math.round(best[1] / best[0]), Math.round(best[2] / best[0]), Math.round(best[3] / best[0])];
}

// Share of the image within tol (colour distance) of the paper colour.
export function paperCoverage(img, paper, tol = 40){
  const {data} = img, n = img.w * img.h, step = Math.max(1, Math.floor(n / 200000));
  let hit = 0, all = 0;
  for (let i = 0; i < n; i += step){
    const d = i * 4; all++;
    if (data[d + 3] < 128){ hit++; continue; }
    if (Math.hypot(data[d] - paper[0], data[d + 1] - paper[1], data[d + 2] - paper[2]) <= tol) hit++;
  }
  return hit / all;
}

// 1 where a pixel is at least minDist (RGB distance) from the paper and darker than it.
export function contrastMask(img, paper, minDist){
  const {w, h, data} = img, out = newMask(w, h), pl = lum(...paper);
  for (let i = 0, n = w * h; i < n; i++){
    const d = i * 4;
    if (data[d + 3] < 128) continue;
    const r = data[d], g = data[d + 1], b = data[d + 2];
    if (lum(r, g, b) < pl && Math.hypot(r - paper[0], g - paper[1], b - paper[2]) >= minDist) out.m[i] = 1;
  }
  return out;
}

// Run along each row ("h") or column ("v"): fn(index of first pixel, step, length).
function eachLine(mask, dir, fn){
  const {w, h} = mask;
  if (dir === "h") for (let y = 0; y < h; y++) fn(y * w, 1, w);
  else for (let x = 0; x < w; x++) fn(x, w, h);
}

// Keep only runs at least len long along dir.
export function openLine(mask, len, dir){
  const out = newMask(mask.w, mask.h), m = mask.m;
  eachLine(mask, dir, (start, step, n) => {
    let run = 0;
    for (let k = 0; k <= n; k++){
      const on = k < n && m[start + k * step];
      if (on) run++;
      else {
        if (run >= len) for (let j = k - run; j < k; j++) out.m[start + j * step] = 1;
        run = 0;
      }
    }
  });
  return out;
}

// Fill gaps shorter than len between two set pixels along dir.
export function closeLine(mask, len, dir){
  const out = {w:mask.w, h:mask.h, m:mask.m.slice()}, m = mask.m;
  eachLine(mask, dir, (start, step, n) => {
    let last = -1;
    for (let k = 0; k < n; k++){
      if (!m[start + k * step]) continue;
      const gap = k - last - 1;
      if (last >= 0 && gap > 0 && gap < len) for (let j = last + 1; j < k; j++) out.m[start + j * step] = 1;
      last = k;
    }
  });
  return out;
}

// 1-D min (erode) or max (dilate) over a window of k along dir. Erosion's window starts a = floor(k/2)
// before the pixel; dilation uses the reflected window, so erode-then-dilate is an opening.
function filter1D(mask, k, dir, erode){
  const out = newMask(mask.w, mask.h), m = mask.m, a = Math.floor(k / 2);
  const lo = erode ? -a : -(k - 1 - a), hi = erode ? k - 1 - a : a;
  eachLine(mask, dir, (start, step, n) => {
    const pre = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + m[start + i * step];
    for (let i = 0; i < n; i++){
      const s = i + lo, e = i + hi;
      if (erode){
        if (s < 0 || e >= n) continue;
        if (pre[e + 1] - pre[s] === k) out.m[start + i * step] = 1;
      } else if (pre[Math.min(n, e + 1)] - pre[Math.max(0, s)] > 0) out.m[start + i * step] = 1;
    }
  });
  return out;
}
export function openSquare(mask, k){
  if (k <= 1) return {w:mask.w, h:mask.h, m:mask.m.slice()};
  const e = filter1D(filter1D(mask, k, "h", true), k, "v", true);
  return filter1D(filter1D(e, k, "h", false), k, "v", false);
}
export function closeSquare(mask, k){
  if (k <= 1) return {w:mask.w, h:mask.h, m:mask.m.slice()};
  const d = filter1D(filter1D(mask, k, "h", false), k, "v", false);
  return filter1D(filter1D(d, k, "h", true), k, "v", true);
}

// Grow (dilate) by r pixels in every direction (a square of side 2r+1).
export function dilate(mask, r){
  if (r < 1) return {w:mask.w, h:mask.h, m:mask.m.slice()};
  return filter1D(filter1D(mask, 2 * r + 1, "h", false), 2 * r + 1, "v", false);
}

export const maskOr = (...ms) => { const out = newMask(ms[0].w, ms[0].h); for (const mk of ms) for (let i = 0; i < out.m.length; i++) out.m[i] |= mk.m[i]; return out; };
export const maskNot = (mk) => ({w:mk.w, h:mk.h, m:mk.m.map(v => 1 - v)});

// 4-connected components of pixels equal to value: labels (0 = none), count, and per label {area, x0, y0, x1, y1}.
export function components(mask, value = 1){
  const {w, h, m} = mask, labels = new Int32Array(w * h), stats = [], q = new Int32Array(w * h);
  let count = 0;
  for (let s = 0; s < w * h; s++){
    if (m[s] !== value || labels[s]) continue;
    const id = ++count, st = {area:0, x0:w, y0:h, x1:0, y1:0};
    let head = 0, tail = 0;
    q[tail++] = s; labels[s] = id;
    while (head < tail){
      const i = q[head++], x = i % w, y = (i - x) / w;
      st.area++;
      if (x < st.x0) st.x0 = x; if (x > st.x1) st.x1 = x; if (y < st.y0) st.y0 = y; if (y > st.y1) st.y1 = y;
      if (x > 0 && m[i - 1] === value && !labels[i - 1]){ labels[i - 1] = id; q[tail++] = i - 1; }
      if (x < w - 1 && m[i + 1] === value && !labels[i + 1]){ labels[i + 1] = id; q[tail++] = i + 1; }
      if (y > 0 && m[i - w] === value && !labels[i - w]){ labels[i - w] = id; q[tail++] = i - w; }
      if (y < h - 1 && m[i + w] === value && !labels[i + w]){ labels[i + w] = id; q[tail++] = i + w; }
    }
    stats.push(st);
  }
  return {labels, count, stats};
}

// Free pixels (1) reachable from outside the image (as if it had a 1-px free border).
export function floodFromEdges(free){
  const {w, h, m} = free, out = newMask(w, h), q = new Int32Array(w * h);
  let tail = 0;
  const push = (i) => { if (m[i] && !out.m[i]){ out.m[i] = 1; q[tail++] = i; } };
  for (let x = 0; x < w; x++){ push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++){ push(y * w); push(y * w + w - 1); }
  for (let head = 0; head < tail; head++){
    const i = q[head], x = i % w;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w);
  }
  return out;
}

// The angle (within ±range) that lines the mask's pixels up best with the image axes: the mask rotated by
// −angle has the most concentrated row and column histograms.
export function dominantAngle(mask, range = 10, step = 0.25){
  const {w, h, m} = mask, xs = [], ys = [];
  let n = 0;
  for (let i = 0; i < w * h; i++) if (m[i]) n++;
  const every = Math.max(1, Math.floor(n / 30000));
  for (let i = 0, k = 0; i < w * h; i++) if (m[i] && (k++ % every === 0)){ xs.push(i % w - w / 2); ys.push(Math.floor(i / w) - h / 2); }
  if (!xs.length) return 0;
  const size = Math.ceil(Math.hypot(w, h)) + 4, hx = new Float64Array(size), hy = new Float64Array(size);
  const score = (deg) => {
    const t = -deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    hx.fill(0); hy.fill(0);
    for (let i = 0; i < xs.length; i++){
      hx[Math.round(c * xs[i] - s * ys[i] + size / 2)]++;
      hy[Math.round(s * xs[i] + c * ys[i] + size / 2)]++;
    }
    let sum = 0;
    for (let i = 0; i < size; i++) sum += hx[i] * hx[i] + hy[i] * hy[i];
    return sum;
  };
  let best = 0, bestScore = -1;
  for (let a = -range; a <= range + 1e-9; a += step){ const sc = score(a); if (sc > bestScore){ bestScore = sc; best = a; } }
  // refine around the best step
  for (let a = best - step; a <= best + step + 1e-9; a += step / 5){ const sc = score(a); if (sc > bestScore){ bestScore = sc; best = a; } }
  return Math.round(best * 100) / 100;
}

// The projection scores used by dominantAngle, for the quality gate: {best, worst} over the range.
export function angleContrast(mask, range = 10, step = 1){
  const a = dominantAngle(mask, range, step);
  const {w, h, m} = mask;
  const vals = [];
  for (let d = -range; d <= range; d += step){
    const t = -d * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), size = Math.ceil(Math.hypot(w, h)) + 4;
    const hx = new Float64Array(size);
    let k = 0;
    for (let i = 0; i < w * h; i += 7) if (m[i]){ const x = i % w - w / 2, y = Math.floor(i / w) - h / 2; hx[Math.round(c * x - s * y + size / 2)]++; k++; }
    let sum = 0; for (let i = 0; i < size; i++) sum += hx[i] * hx[i];
    vals.push(k ? sum / k : 0);
  }
  return {angle:a, best:Math.max(...vals), worst:Math.min(...vals)};
}

// Rotate an image by deg about its centre into an image of the same size (bilinear), filling with fill.
// With expand, the result is large enough to hold the whole rotated image.
export function rotateImg(img, deg, fill = [255, 255, 255], expand = false){
  const {w, h, data} = img;
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), cx = w / 2, cy = h / 2;
  const W = expand ? Math.ceil(w * Math.abs(c) + h * Math.abs(s)) : w, H = expand ? Math.ceil(w * Math.abs(s) + h * Math.abs(c)) : h;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    // inverse rotation: where in the source does (x, y) come from
    const dx = x + 0.5 - W / 2, dy = y + 0.5 - H / 2;
    const sx = c * dx + s * dy + cx - 0.5, sy = -s * dx + c * dy + cy - 0.5;
    const d = (y * W + x) * 4;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    for (let ch = 0; ch < 4; ch++){
      let v = 0;
      for (const [xx, yy, wt] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]){
        const pv = xx >= 0 && yy >= 0 && xx < w && yy < h ? data[(yy * w + xx) * 4 + ch] : (ch === 3 ? 255 : fill[ch]);
        v += pv * wt;
      }
      out[d + ch] = v;
    }
  }
  return {w:W, h:H, data:out};
}

// Where point p of an image of size from lands after rotating by deg into an image of size to (centres matched).
export function rotatePoint(p, deg, from, to){
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const dx = p[0] - from.w / 2, dy = p[1] - from.h / 2;
  return [c * dx - s * dy + to.w / 2, s * dx + c * dy + to.h / 2];
}
