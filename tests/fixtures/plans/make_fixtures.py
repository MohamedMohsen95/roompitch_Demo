# One-off generator for the plan-reading fixtures (needs Python with OpenCV and NumPy; not run by npm test).
#   python3 tests/fixtures/plans/make_fixtures.py
# Reads src/<name>.png and expect.src.json, writes:
#   (the plans themselves are src/<name>.png)
#   <name>_rot3.png       rotated 3° about the centre on white (points and outlines rotated to match)
#   <name>_scan.png       brightness gradient, noise, blur and heavy JPEG, like a poor scan
#   <name>_nolabels.png   every label box painted over with the colour around it
#   expect.json           expect.src.json plus a reference outline ("ref") for each room marked checked,
#                         and the rotated coordinates under "<name>_rot3"
#   check/<name>.png      the reference outlines over the plan, to check them by eye
# A reference outline is the closed area around the room's point, with doors bridged along their wall,
# traced and simplified. Rooms are marked "checked": true in expect.src.json only after looking at check/.
import json, os, sys
import numpy as np, cv2
PNG = [cv2.IMWRITE_PNG_COMPRESSION, 9]

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = json.load(open(os.path.join(HERE, "expect.src.json")))
rng = np.random.default_rng(7)

# Walls, door bridges and footprint as in the experiment (docs/superpowers/specs/assets/2026-11-08-wall-reading-spike.py).
import importlib.util
_spec = importlib.util.spec_from_file_location("spike", os.path.join(HERE, "..", "..", "..", "docs", "superpowers", "specs", "assets", "2026-11-08-wall-reading-spike.py"))
_src = open(_spec.origin).read().split("IN, OUT = sys.argv")[0]
spike = {}; exec(compile(_src, _spec.origin, "exec"), spike)

def walls_closed(img):
    walls, closed, thick, foot = spike["wall_mask"](img)
    return closed, thick, foot

# A reference outline from a hand-drawn rectangle: each side moved to the inside face of the dark wall
# it is next to (the first line within 30 px outwards where most pixels along the side are dark).
def snap_rect(img, rect):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY); dark = g < 90; H, W = g.shape
    x0, y0, x1, y1 = rect
    def frac_col(x, a, b): return dark[a:b, x].mean() if 0 <= x < W else 1
    def frac_row(y, a, b): return dark[y, a:b].mean() if 0 <= y < H else 1
    def side(pos, step, frac, a, b):
        for d in range(-12, 31):
            q = pos + step * d
            if frac(q, a, b) > 0.45: return q - step
        return pos
    ya, yb, xa, xb = y0 + (y1 - y0) // 5, y1 - (y1 - y0) // 5, x0 + (x1 - x0) // 5, x1 - (x1 - x0) // 5
    L = side(x0, -1, frac_col, ya, yb); Rr = side(x1, 1, frac_col, ya, yb)
    T = side(y0, -1, frac_row, xa, xb); B = side(y1, 1, frac_row, xa, xb)
    return [[L, T], [Rr, T], [Rr, B], [L, B]]

def rot(img, deg):
    H, W = img.shape[:2]
    M = cv2.getRotationMatrix2D((W / 2, H / 2), -deg, 1.0)   # positive deg = clockwise on screen
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255)), M

def rp(M, x, y):
    return [round(M[0, 0] * x + M[0, 1] * y + M[0, 2], 1), round(M[1, 0] * x + M[1, 1] * y + M[1, 2], 1)]

def scan(img):
    H, W = img.shape[:2]
    grad = np.linspace(1.0, 0.75, W)[None, :, None] * np.linspace(1.0, 0.9, H)[:, None, None]
    out = img.astype(np.float32) * grad + rng.normal(0, 6, img.shape)
    out = cv2.GaussianBlur(np.clip(out, 0, 255).astype(np.uint8), (3, 3), 0)
    ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 35])
    return cv2.imdecode(enc, cv2.IMREAD_COLOR)

def nolabels(img, boxes):
    out = img.copy()
    for x0, y0, x1, y1 in boxes:
        ring = np.concatenate([img[max(0, y0 - 4):y0, x0:x1].reshape(-1, 3), img[y1:y1 + 4, x0:x1].reshape(-1, 3)])
        out[y0:y1, x0:x1] = np.median(ring, axis=0) if len(ring) else 255
    return out

out = {}
for name, e in SRC.items():
    img = cv2.imread(os.path.join(HERE, "src", name + ".png"))
    closed, thick, foot = walls_closed(img)
    rooms = []
    view = img.copy()
    for r in e["rooms"]:
        ref = r.get("ref") or (snap_rect(img, r["rect"]) if r.get("rect") else None)
        cv2.circle(view, (r["x"], r["y"]), 6, (0, 160, 0), -1)
        if ref is not None:
            cv2.polylines(view, [np.array(ref).reshape(-1, 1, 2)], True, (0, 0, 220), 3)
            cv2.putText(view, r["name"], (r["x"] + 8, r["y"]), cv2.FONT_HERSHEY_SIMPLEX, .5, (0, 0, 220), 1)
        rooms.append({**{k: v for k, v in r.items() if k not in ("checked", "rect")}, "ref": ref if r.get("checked") else None, "candidate": ref})
    os.makedirs(os.path.join(HERE, "check"), exist_ok=True)
    cv2.imwrite(os.path.join(HERE, "check", name + ".png"), view)
    out[name] = {k: v for k, v in e.items() if k not in ("rooms",)} | {"rooms": [{k: v for k, v in r.items() if k != "candidate"} for r in rooms], "thick": thick}
    print(name, img.shape[1], "x", img.shape[0], "thick", thick)

    r3, M = rot(img, 3)
    cv2.imwrite(os.path.join(HERE, name + "_rot3.png"), r3, PNG)
    out[name + "_rot3"] = {
        "quality": e["quality"], "angle": 3,
        "labels": [{**l, "x": rp(M, l["x"], l["y"])[0], "y": rp(M, l["x"], l["y"])[1]} for l in e["labels"]],
        "rooms": [{"name": r["name"], "x": rp(M, r["x"], r["y"])[0], "y": rp(M, r["x"], r["y"])[1],
                   "ref": [rp(M, x, y) for x, y in r["ref"]] if r["ref"] else None} for r in out[name]["rooms"]],
    }
    cv2.imwrite(os.path.join(HERE, name + "_scan.png"), scan(img), PNG)
    cv2.imwrite(os.path.join(HERE, name + "_nolabels.png"), nolabels(img, e.get("boxes", [])), PNG)

json.dump(out, open(os.path.join(HERE, "expect.json"), "w"), indent=1)
