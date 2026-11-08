// Polygon helpers for tests: point in polygon, and intersection-over-union by rasterising on a grid.
export function insidePoly(poly, [x, y]){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// IoU of two polygons on a 1-px grid (areaOnly: the first polygon's area in px).
export function polyIoU(a, b, areaOnly = false){
  const all = [...a, ...b], x0 = Math.floor(Math.min(...all.map(p => p[0]))), x1 = Math.ceil(Math.max(...all.map(p => p[0])));
  const y0 = Math.floor(Math.min(...all.map(p => p[1]))), y1 = Math.ceil(Math.max(...all.map(p => p[1])));
  let inter = 0, uni = 0, area = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
    const p = [x + 0.5, y + 0.5], ia = insidePoly(a, p), ib = insidePoly(b, p);
    if (ia) area++;
    if (ia && ib) inter++;
    if (ia || ib) uni++;
  }
  return areaOnly ? area : (uni ? inter / uni : 0);
}
