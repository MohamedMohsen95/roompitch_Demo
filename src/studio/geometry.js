// Room geometry, no DOM: shapes, walls, openings, fitting furniture inside.
// Metres everywhere except names ending in Cm. Plan coordinates: x → east, y → south,
// origin at the top-left of the bounding box. Corners run clockwise on screen.

export const toM = (cm) => Math.round(Number(cm)) / 100;
export const toCm = (m) => Math.round(Number(m) * 100);

const MIN_SIDE_CM = 100;
const EPS = 1e-9;

// form: {shape:"rect"|"L", lengthCm, widthCm, cutLengthCm, cutWidthCm, corner:"ne"|"nw"|"se"|"sw"}
export function shapePoly(form){
  const L = toM(form.lengthCm), W = toM(form.widthCm);
  if (!(form.lengthCm >= MIN_SIDE_CM && form.widthCm >= MIN_SIDE_CM)) return {error:"tooSmall"};
  const box = [[0, 0], [L, 0], [L, W], [0, W]];
  if (form.shape !== "L") return {poly:box};

  const cl = toM(form.cutLengthCm), cw = toM(form.cutWidthCm);
  if (!(form.cutLengthCm > 0 && form.cutWidthCm > 0)) return {error:"tooSmall"};
  if (cl >= L - EPS || cw >= W - EPS) return {error:"cutTooBig"};

  // Replace the chosen bounding-box corner with the three points of the notch.
  const notch = {
    nw: [[0, cw], [cl, cw], [cl, 0]],
    ne: [[L - cl, 0], [L - cl, cw], [L, cw]],
    se: [[L, W - cw], [L - cl, W - cw], [L - cl, W]],
    sw: [[cl, W], [cl, W - cw], [0, W - cw]]
  }[form.corner || "ne"];
  const idx = {nw:0, ne:1, se:2, sw:3}[form.corner || "ne"];
  const pts = [...box.slice(0, idx), ...notch, ...box.slice(idx + 1)];
  // Start at the top-left-most corner (smallest y, then smallest x).
  let start = 0;
  pts.forEach((p, i) => { const s = pts[start]; if (p[1] < s[1] - EPS || (Math.abs(p[1] - s[1]) < EPS && p[0] < s[0])) start = i; });
  return {poly:[...pts.slice(start), ...pts.slice(0, start)]};
}

export function wallsOf(poly){
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return {i, a, b, len:Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1e6) / 1e6};
  });
}

export function bbox(poly){
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return {L:Math.max(...xs) - Math.min(...xs), W:Math.max(...ys) - Math.min(...ys)};
}

export function pointInPoly(x, y, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Points exactly on an edge count as inside, so furniture can stand against a wall.
function onEdge(x, y, poly){
  return wallsOf(poly).some(({a, b, len}) => {
    const t = ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len);
    if (t < -EPS || t > 1 + EPS) return false;
    return Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y) < 1e-6;
  });
}
const inOrOn = (x, y, poly) => pointInPoly(x, y, poly) || onEdge(x, y, poly);

// rect: {x, y, w, d} with x/y at the centre. Inside when its corners and centre are inside,
// and no room corner pokes into it (that catches the L notch).
export function rectInside({x, y, w, d}, poly){
  const pts = [[x, y], [x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]];
  if (!pts.every(([px, py]) => inOrOn(px, py, poly))) return false;
  return !poly.some(([px, py]) => px > x - w / 2 + EPS && px < x + w / 2 - EPS && py > y - d / 2 + EPS && py < y + d / 2 - EPS);
}

// Nearest position (5 cm grid) where the rect fits, searching outward from where it is.
export function fitInside(rect, poly){
  if (rectInside(rect, poly)) return {x:rect.x, y:rect.y};
  const {L, W} = bbox(poly), step = 0.05;
  const clampX = (v) => Math.min(Math.max(v, rect.w / 2), L - rect.w / 2);
  const clampY = (v) => Math.min(Math.max(v, rect.d / 2), W - rect.d / 2);
  const x0 = Math.round(clampX(rect.x) / step) * step, y0 = Math.round(clampY(rect.y) / step) * step;
  const maxR = Math.ceil(Math.max(L, W) / step);
  for (let r = 0; r <= maxR; r++){
    let best = null, bestD = Infinity;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++){
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const x = Math.round((x0 + i * step) * 100) / 100, y = Math.round((y0 + j * step) * 100) / 100;
      if (!rectInside({...rect, x, y}, poly)) continue;
      const dd = Math.hypot(x - rect.x, y - rect.y);
      if (dd < bestD){ bestD = dd; best = {x, y}; }
    }
    if (best) return best;
  }
  // Doesn't fit anywhere (piece bigger than the room): centre it.
  return {x:L / 2, y:W / 2};
}

export function nearestWall(x, y, poly, maxDist = 0.8){
  let best = null, bestD = Infinity;
  for (const {i, a, b, len} of wallsOf(poly)){
    const t = Math.min(1, Math.max(0, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len)));
    const dd = Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y);
    if (dd < bestD){ bestD = dd; best = i; }
  }
  return bestD <= maxDist ? best : null;
}

export function wallArea(i, poly, H, openings = []){
  const w = wallsOf(poly)[i]; if (!w) return 0;
  const cut = openings.filter(o => o.wall === i).reduce((s, o) => s + o.width * o.height, 0);
  return Math.max(0, w.len * H - cut);
}

// Opening: {id, type:"door"|"window", wall, offset, width, height, sill} in metres.
export function validateOpenings(poly, H, openings){
  const walls = wallsOf(poly), err = {};
  for (const o of openings){
    const w = walls[o.wall];
    if (o.width < 0.3 - EPS || o.height < 0.3 - EPS) err[o.id] = "tooSmall";
    else if (!w || o.offset < -EPS || o.offset + o.width > w.len + EPS) err[o.id] = "beyondWall";
    else if ((o.type === "door" ? 0 : o.sill) + o.height > H + EPS || o.sill < -EPS) err[o.id] = "tooTall";
  }
  for (let i = 0; i < openings.length; i++) for (let j = i + 1; j < openings.length; j++){
    const a = openings[i], b = openings[j];
    if (a.wall !== b.wall) continue;
    const overlap = Math.min(a.offset + a.width, b.offset + b.width) - Math.max(a.offset, b.offset);
    if (overlap > 0.001){ err[a.id] ||= "overlap"; err[b.id] ||= "overlap"; }
  }
  return err;
}
