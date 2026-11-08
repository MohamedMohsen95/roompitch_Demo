# Throwaway spike: read walls from a plan image, then "click inside a room" -> outline.
import sys, json
import numpy as np, cv2

def line_open(m, L):
    ks = [np.ones((1, L), np.uint8), np.ones((L, 1), np.uint8), np.eye(L, dtype=np.uint8), np.fliplr(np.eye(L, dtype=np.uint8))]
    out = np.zeros_like(m)
    for k in ks: out |= cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    return out

def runs(mask_rows):
    # lengths of runs of 1s along each row
    out = []
    for r in mask_rows:
        d = np.diff(np.concatenate([[0], r, [0]]))
        st, en = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
        out.extend((en - st).tolist())
    return np.array(out)

def wall_mask(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    H, W = g.shape
    t, _ = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    dark = (g < t * 0.85).astype(np.uint8)
    L = max(9, int(0.025 * max(H, W)))
    v = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((L, 1), np.uint8))
    hzm = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((1, L), np.uint8))
    rl = np.concatenate([runs(v), runs(hzm.T)])
    rl = rl[(rl >= 1) & (rl <= 0.03 * max(H, W))]
    hist = np.bincount(rl) if rl.size else np.array([0, 0, 1])
    w = hist * np.arange(len(hist)) ** 2          # thick, long structures dominate
    thick = int(np.argmax(w))
    k = max(1, int(round(thick * 0.6)))
    solid = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((k, k), np.uint8)) if k > 1 else dark
    walls = line_open(solid, L)
    # drop filled blobs (bedspreads, dark furniture): components much thicker than the walls
    n, lab, st, _ = cv2.connectedComponentsWithStats(walls, 8)
    dt = cv2.distanceTransform(walls, cv2.DIST_L2, 3)
    keep = np.zeros_like(walls)
    for i in range(1, n):
        comp = lab == i
        if dt[comp].max() > 2.5 * thick and st[i, 4] < 0.02 * H * W: continue
        if max(st[i, 2], st[i, 3]) < 0.04 * max(H, W): continue
        keep[comp] = 1
    walls = keep
    # bridge gaps only along a wall's own line: horizontal walls across, vertical walls down
    hl = max(int(1.5 * thick), 9)
    hmask = cv2.morphologyEx(walls, cv2.MORPH_OPEN, np.ones((1, hl), np.uint8))
    vmask = cv2.morphologyEx(walls, cv2.MORPH_OPEN, np.ones((hl, 1), np.uint8))
    def bridge(Lb):
        return walls | cv2.morphologyEx(hmask, cv2.MORPH_CLOSE, np.ones((1, Lb), np.uint8)) \
                     | cv2.morphologyEx(vmask, cv2.MORPH_CLOSE, np.ones((Lb, 1), np.uint8))
    closed = bridge(int(0.08 * max(H, W)))          # doors
    outer = bridge(int(0.4 * max(H, W)))            # long glass walls on the outside too
    pad = np.pad(1 - outer, 1, constant_values=1).astype(np.uint8)
    m = np.zeros((H + 4, W + 4), np.uint8)
    cv2.floodFill(pad, m, (0, 0), 2)
    foot = (pad[1:-1, 1:-1] != 2).astype(np.uint8)
    return walls, closed, thick, foot

def room_from_click(closed, seed):
    free = (1 - closed).astype(np.uint8)
    H, W = free.shape
    mask = np.zeros((H + 2, W + 2), np.uint8)
    x, y = seed
    if not free[y, x]:
        # nudge to nearest free pixel
        ys, xs = np.nonzero(free[max(0,y-15):y+15, max(0,x-15):x+15])
        if not len(xs): return None, 0
        i = np.argmin((xs-15)**2 + (ys-15)**2); x, y = max(0,x-15)+xs[i], max(0,y-15)+ys[i]
    cv2.floodFill(free, mask, (int(x), int(y)), 2)
    region = (free == 2).astype(np.uint8)
    frac = region.sum() / (H * W)
    cs, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    poly = cv2.approxPolyDP(c, 0.006 * cv2.arcLength(c, True), True)[:, 0, :]
    return poly, frac

from skimage.segmentation import watershed
def rooms_watershed(walls, foot, seeds):
    free = (foot & (1 - walls)).astype(np.uint8)
    dt = cv2.distanceTransform(free, cv2.DIST_L2, 5)
    markers = np.zeros(free.shape, np.int32)
    for i, (x, y) in enumerate(seeds, 1):
        cv2.circle(markers, (int(x), int(y)), 3, i, -1)
    markers[free == 0] = 0
    lab = watershed(-dt, markers, mask=free.astype(bool))
    return lab

def run(name, seeds, scale_view=1.0):
    img = cv2.imread(f"{IN}/{name}.png")
    up = max(1.0, 1800 / max(img.shape[:2]))
    if up > 1:
        img = cv2.resize(img, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
        seeds = {k: (x * up, y * up) for k, (x, y) in seeds.items()}
    walls, closed, thick, foot = wall_mask(img)
    if MODE == "ws":
        lab = rooms_watershed(closed, foot, list(seeds.values()))
        out = img.copy(); over = out.copy(); over[walls == 1] = (0, 0, 0); over[closed == 1] = (0, 0, 255); over[walls == 1] = (0, 0, 0); over[foot == 0] = (200, 200, 255)
        out = cv2.addWeighted(over, .5, out, .5, 0)
        print(name, "wall thickness ~", thick)
        for i, (label, (x, y)) in enumerate(seeds.items(), 1):
            region = (lab == i).astype(np.uint8)
            if not region.sum(): print("   ", label, "EMPTY"); continue
            cs, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            c = max(cs, key=cv2.contourArea)
            poly = cv2.approxPolyDP(c, 0.006 * cv2.arcLength(c, True), True)[:, 0, :]
            col = [(0,160,0),(200,90,0),(160,0,160),(0,140,200),(0,90,200),(120,120,0),(200,0,60),(0,200,160),(90,0,200),(60,60,60),(0,0,200)][(i-1) % 11]
            cv2.polylines(out, [poly.reshape(-1,1,2)], True, col, max(3, thick//2))
            cv2.circle(out, (int(x), int(y)), max(6, thick//2), col, -1)
            print("   ", label, len(poly), "corners")
        cv2.imwrite(f"{OUT}/{name}_ws.png", out)
        return
    out = img.copy()
    over = out.copy(); over[closed == 1] = (0, 0, 255); over[walls == 1] = (0, 0, 0)
    out = cv2.addWeighted(over, .5, out, .5, 0)
    colors = [(0,160,0),(200,90,0),(160,0,160),(0,140,200),(0,90,200),(120,120,0),(200,0,60),(0,200,160),(90,0,200),(60,60,60),(0,0,200)]
    report = []
    for i, (label, (x, y)) in enumerate(seeds.items()):
        poly, frac = room_from_click(closed, (int(x), int(y)))
        col = colors[i % len(colors)]
        if poly is None: report.append((label, "seed on wall")); continue
        leak = frac > 0.45
        cv2.polylines(out, [poly.reshape(-1,1,2)], True, col, max(3, thick//2))
        cv2.circle(out, (int(x), int(y)), max(6, thick//2), col, -1)
        report.append((label, f"{len(poly)} corners, {frac*100:.1f}% of image" + ("  LEAK" if leak else "")))
    cv2.imwrite(f"{OUT}/{name}_result.png", out)
    print(name, "wall thickness ~", thick, "px")
    for r in report: print("  ", *r)

IN, OUT = sys.argv[1], sys.argv[2]
MODE = sys.argv[3] if len(sys.argv) > 3 else "fill"
s = 2576/2000
run("arcmax", {k:(x*s,y*s) for k,(x,y) in {
  "bed TL":(360,330),"bed L2":(360,900),"bed R":(1640,960),"living":(968,330),"sitout":(1630,330),
  "kitchen":(1100,1180),"study":(1067,1450),"toilet L":(300,1360),"toilet R":(1630,1480),"entry":(680,1330)}.items()})
s = 2977/1000
run("etsy", {k:(x*s,y*s) for k,(x,y) in {"bath":(150,250),"bed":(230,560),"living":(560,420),"terrace":(850,320),"hall":(620,790)}.items()})
run("east", {"den":(65,300),"living":(215,280),"kitchen":(325,265),"master":(440,140),"patio":(230,90),"dining":(215,330),"second":(490,400),"mbath":(520,190),"bath2":(500,295),"foyer":(130,440)})
run("ex4", {"m bed":(140,280),"living":(390,250),"deck":(650,140),"bed2":(620,330),"m bath":(120,520),"wic":(60,680),"bath2":(650,620)})
