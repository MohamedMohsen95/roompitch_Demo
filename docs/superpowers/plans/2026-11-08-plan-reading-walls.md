# Reading Floor Plans From Their Walls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Room outlines come from the walls in the plan image (with names and written sizes from the AI), not from the AI drawing them. Uncertain rooms are left out, and the designer gets click-to-fill and gap-snapped doors and windows.

**Architecture:**
- **Image processing.** Pure JS modules on raw pixel buffers, tested with `node --test` on fixture images:
  - `plan/raster.js` holds the primitives;
  - `plan/walls.js` straightens the plan and finds walls, bridges and the footprint;
  - `plan/rooms.js` turns enclosed areas into outlines, plus click-to-fill;
  - `plan/assemble.js` names candidates, applies the confidence rules, sets the scale and builds the flat with its openings.
- **In the browser.** The pipeline runs in a Web Worker.
- **AI.**
  - `api/plan.js` now only reads names, sizes and areas.
  - The new `api/point.js` asks Moondream where each name is written.

**Tech Stack:**
- Plain JS (ES modules) with `node --test`.
- `node:zlib` for a PNG reader in tests only.
- React 19 + TypeScript UI, a Vite module worker, and Vercel Node functions.
- Cloudflare Workers AI: the plan model plus `@cf/moondream/moondream3.1-9B-A2B`.
- Python + OpenCV only for the one-off fixture generator (not run in CI).

**Spec:** `docs/superpowers/specs/2026-11-08-plan-reading-walls-design.md` (and the first plan-import spec it builds on)

## Global Constraints

- No outline that is clearly wrong is ever shown. An empty space is better than a wrong one.
- The AI never draws outlines. Outlines come from walls plus names, from click-to-fill, or from the designer.
- Nothing from the image becomes furniture, and areas enclosed by furniture lines are never rooms.
- An unnamed room is drawn with a temporary name "Space N" / "مساحة N", tagged "found without a name", if it is room-sized (> 2 m² once the scale is known) and has at least one bridge to another candidate.
- Several names in one enclosed area make one space with the names joined by " / ", if it passes the checks.
- Scale only from ≥ 2 rooms agreeing within 10 %. Otherwise ask for one wall length, as now.
- Compactness: area ÷ convex-hull area ≥ 0.6 for any drawn candidate.
- Dimension chains are not used. Door swing arcs are not detected: bridges on the outside wall are windows.
- Image processing runs in a Web Worker on an image of at most 2000 px on the long side, and never blocks the page.
- AI cost: one plan-model call per plan, plus one Moondream `point` call per distinct name. `MOONDREAM_MODEL` env, default `@cf/moondream/moondream3.1-9B-A2B`.
- English and Arabic strings for everything new; RTL and touch.
- No new npm dependencies.

## Review Focus

1. **A PNG with a transparent background** (common for exports): transparent pixels are paper, not walls. Test in Task 2.
2. **A plan cropped tight, with outer walls touching the image edge:** the footprint is still found (the image is padded with paper before flooding from the edge). Test in Task 3.
3. **An inverted plan (light walls on a dark background), or a photo with no clear paper colour:** the quality gate fails, no rooms are drawn, and the tools still work. Test in Task 3.
4. **A label point that lands in the title block, a dimension text outside the flat, or on a wall:** it is moved to the nearest candidate within the footprint, or listed as unplaced. It never becomes a room by itself. Test in Task 5.
5. **A very large image** (e.g. 6000 × 4000): it is downscaled to ≤ 2000 px before reading, and outlines map back to the full image's pixels. Test in Task 7 (`readScale`).

---

### Task 1: Test fixtures and a PNG reader for tests

**Files:**
- Create: `tests/helpers/png.js`, `tests/fixtures/plans/make_fixtures.py`, `tests/fixtures/plans/*.png`, `tests/fixtures/plans/expect.json`
- Test: `tests/png.test.js`

**Interfaces:**
- Produces:
  - `readPng(path: string) -> {w:number, h:number, data:Uint8ClampedArray /* RGBA */}`, which handles 8-bit RGB, RGBA, grey and palette PNGs, non-interlaced.
  - The fixture files `<name>.png`, `<name>_rot3.png`, `<name>_scan.png` and `<name>_nolabels.png` for each name in `arcmax`, `etsy`, `ex4`, `east`, each ≤ 1600 px on the long side.
  - `expect.json`: `{<name>: {labels:[{name, x, y}] /* where each name is written, fixture px */, rooms:[{name, x, y, ref:[[x,y]...] | null}] /* a point inside each target room and its hand-checked outline */, areas: {<name>: "64 sq ft"}?, quality:"ok"|"fail"}}`. The `_rot3` variants get the same rooms with points and refs rotated by the generator. The `_scan` and `_nolabels` variants share the original's coordinates.

- [ ] **Step 1:** Write `make_fixtures.py`. It takes the four source images from `docs/superpowers/specs/assets/` (copy them there first: arcmax.png, etsy.png, ex4.png, east.png) and does the following:
  - Downscales each to ≤ 1600 px.
  - Writes the `_rot3` variant: rotated 3° about the centre on white, with points rotated to match.
  - Writes the `_scan` variant: a brightness gradient of up to 25 %, Gaussian noise σ 6, a 1 px blur, then JPEG quality 35, saved as PNG.
  - Writes the `_nolabels` variant: each label's box (from `expect.json`) painted with the median colour of its surroundings.
  - Computes each `ref` with the spike's method, but only for the rooms marked `"checked": true` in a hand-written `expect.src.json`.
- [ ] **Step 2:** Write `expect.src.json` by hand from the fixture images:
  - label positions;
  - one point inside each target room, following the spec's "How we'll know it works":
    - arcmax: 3 bedrooms, 2 toilets, study;
    - etsy: bathroom, bedroom, living room, hall;
    - ex4: M bedroom, bedroom 2, M bath, bath 2, WIC, living/kitchen;
  - the written areas on etsy;
  - `"quality": "fail"` for east.
  Run the generator. Open every `ref` overlay it writes to `tests/fixtures/plans/check/` and keep `checked: true` only where the outline sits on the walls. Commit the overlays' verdicts, not the overlay images.
- [ ] **Step 3: Write the failing test** `tests/png.test.js`: `readPng("tests/fixtures/plans/etsy.png")` returns `w`/`h` equal to the sizes printed by the generator, with `data.length === w*h*4`, and the pixel at (5,5) is near-white (each channel > 200).
- [ ] **Step 4:** Run `npm test`. Expected: FAIL (module not found).
- [ ] **Step 5:** Implement `readPng`: parse the chunks, inflate IDAT with `zlib.inflateSync`, and undo filters 0–4 per scanline.
- [ ] **Step 6:** Run `npm test`. Expected: PASS.
- [ ] **Step 7: Commit:** `git add tests/helpers tests/fixtures/plans tests/png.test.js docs/superpowers/specs/assets && git commit -m "Plan reading: test fixtures and a PNG reader for tests"`

---

### Task 2: Raster primitives

**Files:**
- Create: `src/studio/plan/raster.js` (+ `raster.d.ts`)
- Test: `tests/plan-raster.test.js`

**Interfaces:**
- Produces:
  - **Types:**
    - `Img = {w, h, data:Uint8ClampedArray /* RGBA */}`
    - `Mask = {w, h, m:Uint8Array /* 0|1 */}`
  - **Paper and contrast:**
    - `paperColor(img) -> [r,g,b]`: the most common light colour. Transparent pixels count as white.
    - `contrastMask(img, paper, minDist:number) -> Mask`: 1 where the colour distance from the paper is ≥ `minDist` and the pixel is darker than the paper. Transparent → 0.
  - **Morphology:**
    - `openLine(mask, len, dir:"h"|"v") -> Mask` and `closeLine(mask, len, dir) -> Mask`, each O(w·h) with run lengths.
    - `openSquare(mask, k) -> Mask`.
  - **Regions:**
    - `components(mask, value=1) -> {labels:Int32Array, count, stats:[{area, x0,y0,x1,y1}]}`, 4-connected.
    - `floodFromEdges(free:Mask) -> Mask`: the free pixels reachable from the image edge, after padding by 1 px.
  - **Rotation:**
    - `dominantAngle(mask, range=10, step=0.25) -> degrees`: the angle that maximises the variance of row and column projections of the mask rotated by −angle.
    - `rotateImg(img, deg, fill=[255,255,255]) -> Img` and `rotatePoint([x,y], deg, fromSize:{w,h}, toSize:{w,h}) -> [x,y]`, both rotating about the centre.

- [ ] **Step 1: Write the failing tests** on small synthetic images built in the test:
  - **Contrast:** a 40×30 white image with a black 3-px rectangle outline. `contrastMask(img, paperColor(img), 60)` has 1 on the outline only. The same image with alpha 0 outside the rectangle (white RGB) gives the same mask. Review Focus 1: a fully transparent black image gives an all-0 mask.
  - **Morphology:**
    - `openLine` with len 10, "h", on the mask keeps the horizontal sides and drops the vertical ones;
    - `closeLine(len 6, "h")` bridges a 5-px gap in a horizontal line and leaves a 7-px gap open.
  - **Regions:**
    - `components` on two separate squares gives `count === 2` with the right areas;
    - `floodFromEdges` on a closed square ring marks the outside, not the inside.
  - **Rotation:** `dominantAngle` of the rectangle mask rotated by 3° with `rotateImg` comes back within 0.3° of 3. `rotatePoint` there and back returns the same point within 1 px.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `raster.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Plan reading: raster primitives"` (with the new files added).

---

### Task 3: Walls, bridges, footprint and the quality gate

**Files:**
- Create: `src/studio/plan/walls.js` (+ `.d.ts`)
- Test: `tests/plan-walls.test.js`

**Interfaces:**
- Consumes: Task 2.
- Produces: `readWalls(img:Img) -> WallRead`, where:
  - `WallRead = {angle, size:{w,h} /* straightened frame */, src:{w,h}, thick, walls:Mask, closed:Mask, foot:Mask, bridges:Bridge[], quality:{ok:boolean, reason:null|"noPaper"|"noWalls"|"noThickness"|"noAngle"}}`.
  - `Bridge = {id, a:[x,y], b:[x,y], width /* px */, outside:boolean}`.

Steps inside `readWalls`, in order:
1. **Straighten.** Find the paper colour and the contrast mask. Straighten by `dominantAngle` of the contrast mask after `openLine` (length 2.5 % of the long side, both directions), but only if |angle| ≥ 0.3°.
2. **Wall thickness.** The thickness is the length-squared-weighted mode of the perpendicular run lengths of the line-opened mask, capped at 3 % of the long side.
3. **Wall mask.** First close the contrast mask with a square of 0.5·thick, so hatched walls become solid. Then apply `openSquare(round(0.6·thick))`, which also removes thin dimension lines, then line-opening in both directions. Drop components that are thicker than 2.5 × the wall thickness and smaller than 2 % of the image (filled blobs such as a rug or bedspread). Drop components shorter than 4 % of the long side (text).
4. **Bridges.**
   - Build the horizontal-wall mask (`openLine` of length 1.5·thick, "h") and its vertical counterpart.
   - `closed` is the walls, plus `closeLine(hMask, 8 % of the long side, "h")`, plus the same in "v".
   - Each new run of pixels added by the closing is one bridge: `a` and `b` are the centre points of its two ends, and `width` is the run length.
5. **Footprint.** The same bridging with 40 % of the long side for the outside only. `foot` is the inverse of `floodFromEdges` of its free space. A bridge is `outside: true` when either side of it touches the outside.
6. **Quality gate.** `ok` is false when any of these holds:
   - no paper colour covers ≥ 40 % of the image ("noPaper");
   - walls are < 0.5 % of the image ("noWalls");
   - the thickness histogram has no clear peak, with the mode bin holding < 15 % of the weight ("noThickness");
   - the best angle's projection variance is < 1.2 × the worst ("noAngle").

- [ ] **Step 1: Write the failing tests:**
  - For each of `arcmax`, `etsy`, `ex4` and their `_scan` variants: `quality.ok === true`. `thick` is within ±40 % of the generator's printed estimate for the original.
  - For `_rot3`: `|angle - 3| < 0.5`.
  - `east`: `quality.ok === false`.
  - **Review Focus 2:** the etsy fixture cropped to its outer walls (the test crops `data` to the bounding box of the walls plus 2 px) still has `foot` covering the point of every room in `expect.json`.
  - **Review Focus 3:** etsy with its colours inverted (255 − value): `quality.ok === false`.
  - **Bridges:** for etsy, every door between two target rooms has a bridge within 1 thickness of it. Add their positions to `expect.json` as `doors:[[x,y]]`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `walls.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Tune thresholds inside the ranges the spec allows. Record any change of a number named here as a "Ruling:" in the ledger.
- [ ] **Step 5: Commit:** `git commit -m "Plan reading: walls, door gaps, footprint, quality gate"` (with the new files added).

---

### Task 4: Room candidates, outlines and click-to-fill

**Files:**
- Create: `src/studio/plan/rooms.js` (+ `.d.ts`)
- Test: `tests/plan-rooms.test.js`

**Interfaces:**
- Consumes: Task 3 (`WallRead`).
- Produces:
  - **`roomCandidates(read:WallRead) -> Candidate[]`.** Components of `foot ∧ ¬closed` with area ≥ 0.2 % of the image.
    - `Candidate = {id, outline:[[x,y]] /* source-image px, clockwise */, areaPx, hullRatio, touchesOutside:false, bridgeIds:string[], pixels? }`.
    - `touchesOutside` is computed on the bridged-for-doors free space before the footprint cut. It is true if the component reaches the outside through any path not closed by `closed`.
  - **`outlineOf(regionMask, read) -> [[x,y]]`.** Steps:
    1. Trace the outer boundary.
    2. Simplify (Douglas–Peucker, ε = 0.5·thick).
    3. Snap each edge to 0°, 45° or 90° of the straightened frame when within 8°.
    4. Intersect neighbouring edges for corners.
    5. Drop edges shorter than 0.75·thick.
    6. Map back to the source frame with `rotatePoint`.
    7. `orientCW`.
  - **`fillAt(read, p:[x,y] /* source px */) -> Candidate | null`.** The candidate containing `p` (moved to the nearest free pixel within 1·thick). Returns null when there is none, when it touches the outside, or when its `hullRatio` < 0.6.

- [ ] **Step 1: Write the failing tests:**
  - For every room in `expect.json` with a `ref`, on the original, `_scan` and `_rot3` variants: some candidate contains the room's point. Its outline's IoU with `ref` is ≥ 0.9 (rasterise both polygons in the test). All its corner angles are multiples of 45° ± 1° in the straightened frame.
  - **No outline follows furniture:** on etsy and arcmax, no candidate lies entirely inside another room's `ref` while having area < 25 % of it. (Areas enclosed by furniture lines are gone, because furniture lines are not walls.)
  - `fillAt` at each target room point returns the same candidate. `fillAt` at a point on the etsy terrace returns `null`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `rooms.js` (hull ratio with a monotone-chain hull on the outline).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Plan reading: room candidates, clean outlines, click-to-fill"` (with the new files added).

---

### Task 5: Names, confidence, scale, openings → a flat

**Files:**
- Create: `src/studio/plan/assemble.js` (+ `.d.ts`)
- Modify:
  - `src/studio/plan/units.js`: `parseArea(text) -> m² | null` for "64 sq ft", "64 sqft", "64 ft²", "12 m²", "12 m2", "12 sq m".
  - `src/studio/plan/flat.js`:
    - `scaleFromSizes` also uses `areaText`, and returns `null` unless ≥ 2 rooms agree within 10 %;
    - `newFlat` gains `unplaced: []`;
    - `Space` gains `unnamed: boolean` and `areaText: string | null`.
  - `src/studio/plan/flat.d.ts`, `flat-store.js` (`validFlat` accepts a missing `unplaced` and `unnamed`)
- Test: `tests/plan-assemble.test.js`, plus additions to `tests/plan-units.test.js` and `tests/plan-flat.test.js`

**Interfaces:**
- Consumes: Tasks 3 and 4, plus `flat.js`.
- Produces:
  - **`assembleFlat(read, cands, text, points, image) -> Flat`.**
    - `read`: a `WallRead`.
    - `text`: `{rooms:[{name, size:string|null, area:string|null}]}`.
    - `points`: `{[name]: [[x,y]]}` in source px.
    - `image`: `{w, h, dataUrl}`.
    - The step order is fixed (spec goal 5):
      1. Place each point into the candidate containing it. A point on a wall or text moves to the nearest candidate within 2·thick. A point outside `foot` goes to `unplaced`.
      2. Name the candidates: one name gives that name; several give the names joined with " / "; none gives `unnamed`.
      3. Compute the scale from the named candidates that have a size or area (≥ 2 agreeing).
      4. Apply the checks. Drop a candidate if any of these holds:
         - it touches the outside;
         - `hullRatio` < 0.6;
         - it has an `outlineProblem`;
         - with a scale, its area is < 1 m², or < 2 m² when unnamed;
         - without a scale, it is < 0.5 % of the footprint;
         - it is > 70 % of the footprint while other candidates exist;
         - its area disagrees with its written size or area by > 25 % (with a scale);
         - it is unnamed and has no bridge to another candidate.
         A dropped named candidate's names go to `unplaced`.
      5. Build the openings from the bridges whose both sides, or whose inside side, belong to drawn spaces:
         - inside bridges become `door`, 210 / 0 cm;
         - outside bridges become `window`, 120 / 90 cm;
         - all `fromAI: true`.
      6. Unnamed spaces get `name: ""` and `unnamed: true`. The UI shows "Space N".
    - Repeated names: Moondream returns every occurrence, and each point names the candidate it falls in.
  - **`readScale(img:Img, max=2000) -> {img:Img, k:number}`.** Downscales for reading. Outlines are multiplied by `1/k` before `assembleFlat` returns.

- [ ] **Step 1: Write the failing tests:**
  - **Units:** `parseArea("64 sq ft") ≈ 5.95`, `parseArea("12 m²") === 12`, `parseArea("LIVING") === null`.
  - **Scale:**
    - one room with an area gives `scale: null`;
    - two rooms agreeing within 10 % gives a scale;
    - two that disagree gives `null` with both flagged.
  - **End to end** with `readWalls` and `roomCandidates` on the fixtures, and `text`/`points` taken from `expect.json`'s labels:
    - **Required on every variant:** every drawn space whose point is a target room has IoU ≥ 0.85 with its `ref`. No drawn space overlaps two target rooms' points unless they are listed as one open area. east draws nothing.
    - **Targets** (logged, asserted only on the original variants): arcmax 3 bedrooms, 2 toilets, study; etsy bathroom, bedroom, living room, hall; ex4 all six.
    - **etsy:** the scale is not null and within 10 % of the value implied by its written areas.
  - **Unnamed rooms:** the same run on the `_nolabels` variants with empty `text`/`points` draws the same target rooms (IoU ≥ 0.85) with `unnamed: true`.
  - **Review Focus 4:** a label point placed in arcmax's title block and one placed exactly on a wall: the first goes to `unplaced`, the second names the nearest room.
  - **Openings:** etsy's drawn spaces have a door at each `expect.json` door position (within 1 thickness).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the changes listed above.
- [ ] **Step 4:** Run `npm test`. Expected: PASS (earlier plan-import tests included, updated only where the two-room rule changes them; note each such change as a Ruling).
- [ ] **Step 5: Commit:** `git commit -m "Plan reading: names, confidence rules, scale from areas, openings from gaps"` (with the new files added).

---

### Task 6: The AI reads text and points at names

**Files:**
- Modify:
  - `src/studio/plan/plan-vision.js`:
    - new `TEXT_PROMPT` and `parseTextReply(text) -> {rooms:[{name, size, area}]}`;
    - `parsePointReply(json, {w,h}) -> [[x,y]]`;
    - remove the outline prompt and `flatFromReply`.
  - `api/plan.js`: uses `TEXT_PROMPT` and returns `{rooms}`.
  - `.env.example`: `MOONDREAM_MODEL`.
  - `vercel.json`: `api/point.js` gets `maxDuration` 30.
- Create: `api/point.js`
- Test: `tests/plan-vision.test.js` (rewritten), `tests/plan-api.test.js` (updated), `tests/point-api.test.js`

**Interfaces:**
- Produces:
  - **`TEXT_PROMPT`** asks for JSON only: `{"rooms":[{"name":"BEDROOM","size":"12'-0\" X 14'-6\"" | null,"area":"64 sq ft" | null}]}`.
    - A name that is written several times is listed once per occurrence.
    - It must not list furniture, dimension chains or title-block text.
  - **`api/point.js`:**
    - `POST {image, names:string[]}` returns `{points:{[name]:[[x,y] /* fractions 0–1 */]}}`.
    - It makes one Workers AI call per distinct name (at most 20) with `{task:"point", image, target:name, max_objects:20}`, run in parallel.
    - `parsePointReply` accepts `points` items as `{x,y}` (0–1), `[x,y]`, or pixels (> 1, divided by the image size). It drops anything outside −0.02…1.02.
    - Same `ACCESS_CODE`, 503/401/502 mapping and messages as `api/analyze.js`.
    - `GET` returns `{enabled, model}`.

- [ ] **Step 1: Write the failing tests:**
  - `parseTextReply`: a fenced reply parses; `"sorry"` gives `{rooms:[]}`; non-string sizes become `null`; 3 × "BEDROOM" are kept as 3 entries.
  - `parsePointReply`: handles `{points:[{x:.5,y:.25}]}`, `{points:[[.5,.25]]}` and `{points:[{x:500,y:250}]}` with `{w:1000,h:1000}`, all giving `[[.5,.25]]`; `{points:null}` gives `[]`.
  - `point-api`:
    - no keys gives 503;
    - a wrong code gives 401;
    - two names give two calls whose bodies have `task:"point"` and `target` set to each name, and the reply maps the names to points;
    - CF 429 gives 502 with "allowance".
  - `plan-api`: the reply is `{rooms}`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the changes listed above.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Plan reading: the AI reads names and sizes, Moondream points at them"` (with the new files added).

---

### Task 7: The reading pipeline in the browser

**Files:**
- Create:
  - `src/studio/plan/read-worker.js`: a module worker. It receives `{rgba, w, h}` and returns `{read, cands}` without the masks, plus a compact `closed` mask as `Uint8Array` for click-to-fill and gap snapping.
  - `src/studio/ui/plan/readPlan.ts`
- Modify:
  - `src/studio/ui/plan/PlanImport.tsx`: uses `readPlan`, the "found without a name" tag, "Space N" display, and an `unplaced` name picker on each space.
  - `src/studio/i18n.js`
- Test: `npm test`, plus a browser check (Step 3)

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  - **`readPlan(image:{dataUrl,w,h}, opts:{ai:boolean}) -> Promise<{flat:Flat, walls:WallHandle, notice:string|null}>`.** It works in this order:
    1. Downscale with `readScale`.
    2. Read in the worker.
    3. If AI: POST `/api/plan` and, with its names, `/api/point`, both with the image downscaled to 1600 px. On any AI error it carries on without names and puts the error in `notice`.
    4. `assembleFlat`.
  - **`WallHandle = {fillAt(p):Candidate|null, gapAt(p, tolPx):Bridge|null}`.** Kept in memory for the editor (Task 8); not saved.
  - **Strings (en and ar):**
    - `foundNoName`: "found without a name" / "اتعرفت من غير اسم"
    - `spaceN` (exists)
    - `pickName`: "Name from the plan…" / "اسم من المسقط…"
    - `qualityLow`: "This plan isn't clear enough to read the rooms automatically. Draw them with the tools." / "المسقط مش واضح كفاية لقراءة الأوض أوتوماتيك. ارسمها بالأدوات."
    - `readingWalls`: "Reading the walls…" / "جاري قراءة الحيطان…"
    - `unplacedN`: "{n} name(s) found on the plan but not drawn" / "{n} اسم اتقرا من المسقط ومترسمش"
  - **Retiring the old path.** Remove `flatFromReply` uses and the old AI-outline "Read again" behaviour. "Read again with AI" re-runs `readPlan` and keeps designs by name (existing rule).

- [ ] **Step 1:** Implement the files above. The worker is created with `new Worker(new URL("../../plan/read-worker.js", import.meta.url), {type:"module"})`.
- [ ] **Step 2:** Run `npm test`. Expected: PASS. Run `npm run typecheck` and `npm run build` on a machine with dependencies. Expected: no errors.
- [ ] **Step 3: Browser check** (`/studio` → "I have a floor plan") on the four plans, AI off:
  - arcmax, etsy and ex4 show their rooms as unnamed spaces with doors;
  - east shows `qualityLow` and no spaces;
  - the page stays responsive while reading (the spinner keeps animating);
  - naming a space from the `unplaced` picker works;
  - check in Arabic too.
- [ ] **Step 4: Commit:** `git commit -m "Plan reading: read the walls in a worker and build the flat from them"` (with the new files added).

---

### Task 8: Click-to-fill, and doors and windows on gaps

**Files:**
- Modify: `src/studio/ui/plan/PlanEditor.tsx` (new `fill` tool, gap snapping for the `door`/`window` tools), `src/studio/ui/plan/PlanImport.tsx` (passes the `WallHandle`), `src/studio/i18n.js`

**Interfaces:**
- Consumes: Task 7 (`WallHandle`).
- Produces:
  - **The `fill` tool:**
    - A click calls `walls.fillAt(p)`. A result adds a space: `unnamed: true` unless a name is picked, and selected.
    - `null` shows `fillNone`: "No closed room here. Draw it with “New space”." / "مفيش أوضة مقفولة هنا. ارسمها بـ«مساحة جديدة»."
    - A result whose centre lies inside an existing space selects that space instead.
    - Hint strings `toolFill` ("Fill room" / "املا أوضة") and `hint_fill`.
  - **The door and window tools:** a tap within 2·thick of a gap calls `walls.gapAt`, and the opening spans exactly that bridge. Otherwise the current drag/tap behaviour applies.
  - **Without a `WallHandle`** (an old flat, or a reload: the handle isn't saved), the `fill` tool is disabled with a tooltip, and the door/window tools behave as now.

- [ ] **Step 1:** Implement the changes above.
- [ ] **Step 2:** Run `npm test`. Expected: PASS. Then the browser check:
  - on etsy, fill each room, including the terrace (expect `fillNone`);
  - place a door by tapping the bedroom door gap, and check its width matches the gap;
  - on east, the `fill` tool shows `fillNone` (or nothing wrong);
  - touch check at 768 px wide.
- [ ] **Step 3: Commit:** `git commit -am "Plan reading: fill a room with one click, doors and windows snap to wall gaps"`

---

### Task 9: Final pass

- [ ] **Step 1:** Run `npm test` (PASS), then `npm run typecheck` and `npm run build`.
- [ ] **Step 2: Moondream check with Mohamed's keys.** Run `/api/point` on the four originals with the names from `/api/plan`. Record per plan:
  - the names read;
  - the points found and how many fell in the right room;
  - the neurons used, from the Cloudflare dashboard.
  Adjust only `TEXT_PROMPT` or the `target` wording if the points miss. Record each change as a Ruling.
- [ ] **Step 3:** README (Arabic section and the English summary): how plans are read now, the `MOONDREAM_MODEL` setting, the fill tool, and what to expect on unclear plans.
- [ ] **Step 4:** Push `plan-import`. Final whole-branch review by a fresh reviewer, then one fix pass with tests. Report the rulings and any deferred minors.
