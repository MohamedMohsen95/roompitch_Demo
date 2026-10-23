# Room Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first "New room" screen where the designer builds a rectangular or L-shaped room in centimetres with any number of doors and windows, by hand or with Cloudflare finding openings in photos, then designs in a studio that works with that room.

**Architecture:** Pure geometry (polygon, walls, openings, validation, fitting furniture) lives in one DOM-free module with Node tests. The studio keeps `S.L`/`S.W` as the room's bounding box (so 3D centring code keeps working) and gains `S.poly`, `S.openings` and an array `S.walls`. A new `api/analyze.js` asks a Cloudflare vision model for openings as fractions of the wall; a pure parser turns the reply into openings.

**Tech Stack:** Vite 8, three.js 0.186, plain ES modules, `node --test` (built into Node, no new dependency), Cloudflare Workers AI.

**Spec:** `docs/superpowers/specs/2026-10-22-room-setup-design.md`

## Global Constraints

- All lengths the designer types or reads are whole **centimetres**; areas stay **m²**. Internally everything is metres (`cm / 100`).
- Shapes: `"rect"` and `"L"` only. L cut-out corner is one of `"ne" | "nw" | "se" | "sw"`.
- A new room starts with no furniture, every wall `"paint-white"`, floor `"oak"`. "Room setup" from the studio keeps furniture and finishes.
- Up to **8** photos per room, one wall per photo. Photos are resized to at most **1024 px** on the long side before sending.
- AI never changes typed measurements; AI-found openings carry `fromAI: true` until the designer edits or confirms them.
- Vision model id comes from env `CF_VISION_MODEL`, default `@cf/meta/llama-4-scout-17b-16e-instruct`. Same `CF_ACCOUNT_ID` / `CF_API_TOKEN` and `ACCESS_CODE` rules as `api/generate.js`.
- Every new string exists in `en` and `ar` in `src/studio/i18n.js`; screen 1 works right-to-left.
- No new npm dependencies. Old pages (`index.html`, `app.js`) are not touched.
- Branch `room-setup` (already contains the PDF/i18n work and latest `main`).

## Review Focus

1. **An opening that doesn't fit** (past the wall end, taller than the ceiling, window sill + height above the ceiling, two openings overlapping) → flagged on the form, "Start designing" disabled. Test: `validateOpenings` cases in Task 1.
2. **Room made smaller, or L cut-out added, while furniture exists** → every piece ends up fully inside the outline. Test: `fitInside` cases in Task 1, and `applyRoom` keeping items inside in Task 2.
3. **Vision reply that isn't clean JSON** (prose around it, code fences, fractions outside 0–1, left > right, unknown type) → valid openings kept, bad ones dropped, no crash; empty list when nothing usable. Tests in Task 4.
4. **L cut-out as large as the room** (cut length ≥ length or cut width ≥ width) → shape error `"cutTooBig"`, no polygon built. Test in Task 1.
5. **Saved room missing, from the old format, or corrupted** → the tool opens on screen 1 with no "Continue last room". Test: `loadRoom` cases in Task 2.

---

### Task 1: Room geometry module

**Files:**
- Create: `src/studio/geometry.js`
- Create: `tests/geometry.test.js`
- Modify: `package.json` (add `"test": "node --test tests/"`)

**Interfaces:**
- Produces (all pure, metres unless the name says Cm; plan coordinates: x → east, y → south, origin top-left of the bounding box):
  - `shapePoly(form) -> {poly: [[x,y],...]} | {error: "tooSmall" | "cutTooBig"}` where `form = {shape, lengthCm, widthCm, cutLengthCm, cutWidthCm, corner}`. Corners listed clockwise on screen starting at the top-left-most corner. Minimum side 100 cm.
  - `wallsOf(poly) -> [{i, a:[x,y], b:[x,y], len}]` (wall *i* runs corner *i* → *i+1*).
  - `bbox(poly) -> {L, W}`.
  - `pointInPoly(x, y, poly) -> boolean`.
  - `rectInside({x, y, w, d}, poly) -> boolean` (centre x/y, all four corners and the centre inside).
  - `fitInside(rect, poly) -> {x, y}`: unchanged if already inside; else the nearest inside position on a 5 cm grid searching outward up to the bounding box.
  - `nearestWall(x, y, poly, maxDist = 0.8) -> number | null`.
  - `wallArea(i, poly, H, openings) -> number` (m², wall length × H minus openings on wall *i*, not below 0).
  - `validateOpenings(poly, H, openings) -> {[openingId]: "beyondWall" | "tooTall" | "overlap" | "tooSmall"}` where opening = `{id, type, wall, offset, width, height, sill}` in metres. `tooSmall` = width or height under 0.3 m.
  - `toM(cm) -> number`, `toCm(m) -> number` (rounded integer).

- [ ] **Step 1: Write the failing tests** in `tests/geometry.test.js` using `node:test` + `node:assert/strict`:
  - `rect 500x400 gives 4 walls of 5,4,5,4`: `wallsOf(shapePoly({shape:"rect", lengthCm:500, widthCm:400}).poly).map(w => w.len)` deep-equals `[5, 4, 5, 4]`; `bbox` is `{L:5, W:4}`.
  - `L 600x500 with 200x150 cut at ne has 6 walls and the cut corner is outside`: 6 walls; perimeter sum `22`; `pointInPoly(5.5, 0.5, poly) === false`; `pointInPoly(1, 4, poly) === true`.
  - `cut as large as the room is rejected`: `shapePoly({shape:"L", lengthCm:400, widthCm:300, cutLengthCm:400, cutWidthCm:100, corner:"sw"})` deep-equals `{error:"cutTooBig"}`.
  - `side under 100 cm is rejected`: `{shape:"rect", lengthCm:90, widthCm:400}` → `{error:"tooSmall"}`.
  - `wallArea subtracts every opening on that wall`: rect 500×400, H 2.8, door on wall 2 `{width:0.9, height:2.1}` and window on wall 2 `{width:1, height:1.2, sill:0.9}` → `wallArea(2, …)` ≈ `5*2.8 - 1.89 - 1.2` (to 1e-9); wall 0 stays `14`.
  - `validateOpenings flags every bad case`: on rect 500×400, H 2.8: offset 4.5 + width 0.9 on wall 0 → `beyondWall`; door height 3 → `tooTall`; window sill 2 + height 1 → `tooTall`; two doors on wall 1 at offsets 0.5 and 1.0 width 0.9 → both `overlap`; width 0.2 → `tooSmall`; a good door → absent from result.
  - `fitInside moves a sofa out of the L cut-out`: L as above, rect `{x:5.5, y:0.6, w:2.2, d:0.9}` → result passes `rectInside`; a rect already inside comes back unchanged.
  - `nearestWall`: rect 500×400, point (2.5, 0.2) → `0`; point (2.5, 2) → `null`.
  - `toCm(2.346) === 235`, `toM(235) === 2.35`.

- [ ] **Step 2: Run** `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/studio/geometry.js`** with the signatures above. L polygon: start from the rectangle's corners and replace the chosen corner with the 3 points of the notch. `pointInPoly` by ray casting. Overlap = same wall and intervals `[offset, offset+width]` intersect by more than 1 mm.

- [ ] **Step 4: Run** `npm test` — Expected: all geometry tests PASS.

- [ ] **Step 5: Commit** `git add package.json src/studio/geometry.js tests/geometry.test.js && git commit -m "Room geometry: shapes, walls, openings, validation, fitting"`

---

### Task 2: Room state, saving and applying a room

**Files:**
- Modify: `src/studio/state.js`
- Create: `src/studio/room-store.js`
- Create: `tests/room-store.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `S` gains `poly`, `openings` (metres, as in Task 1), `form` (the last setup form, cm), and `walls` becomes an **array** of finish ids, one per wall. `S.L`/`S.W` are always `bbox(S.poly)`. The default sample room is removed: `S` starts as a 500×400 rect, empty items, one door on wall 2 and one window on wall 0 (only used before setup runs).
  - `state.js` keeps its exports with the same names but polygon-aware: `clampItem(it)` uses `fitInside`; `nearestWall(x, y)` and `wallArea(i)` delegate to geometry with `S`; `wallLen(i)` returns `wallsOf(S.poly)[i].len`.
  - `applyRoom({form, poly, openings, H}, {keepDesign}) -> void` in `state.js`: sets the room; if `keepDesign` is false resets `items=[]`, `walls` all `"paint-white"`, `floor="oak"`; if true keeps finishes (new walls get `"paint-white"`, extra ones dropped) and runs `clampItem` on every item. Clears `sel` and `replacing`.
  - `room-store.js`: `saveRoom() -> void` (writes `{v:1, form, poly, openings, H, walls, floor, items, nextId}` to localStorage key `rp_room`), `loadRoom() -> object | null` (null when missing, unparsable, `v !== 1`, or poly has < 4 points), `restoreRoom(saved) -> void` (puts it into `S`).

- [ ] **Step 1: Write failing tests** in `tests/room-store.test.js` (install a tiny `globalThis.localStorage` stub in the test file):
  - `saveRoom then loadRoom round-trips`: after `applyRoom` with an L room and one item, `loadRoom()` returns the same `poly`, `openings`, `items`.
  - `loadRoom returns null for missing, garbage, old format`: no key → null; `"{nope"` → null; `{"L":5,"W":4}` → null.
  - `applyRoom keepDesign=false empties the room`: items `[]`, every wall `"paint-white"`, floor `"oak"`.
  - `applyRoom keepDesign=true keeps finishes and pulls furniture inside`: a sofa at the old far corner of a 600×500 room ends `rectInside` a new 400×300 room; wall 0's finish is kept.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** the `state.js` changes and `room-store.js`. `state.js` must not touch the DOM (tests import it in Node).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Room state: polygon, openings, wall array; save and restore"` (add the new files first).

---

### Task 3: Studio works with any room

**Files:**
- Modify: `src/studio/plan.js`, `src/studio/three/room.js`, `src/studio/three/scene.js` (`setCam("door")`), `src/studio/three/interaction.js`, `src/studio/estimate.js`, `src/studio/inspector.js`, `src/studio/library.js`, `src/studio/render-ai.js`, `src/studio/proposal.js`, `src/studio/main.js`, `src/studio/i18n.js`, `studio.html`
- Modify: `src/studio/catalog.js` (remove `DOOR`, `WIN`)

**Interfaces:**
- Consumes: Task 2 (`S.poly`, `S.openings`, `S.walls[]`, `wallArea(i)`, `nearestWall`, `saveRoom`).
- Produces: wall selections are `{kind:"wall", id: <wall index>}`; wall label `t("wallN", {n: i + 1})` (en `"Wall {n}"`, ar `"حائط {n}"`); `update()` also calls `saveRoom()`.

- [ ] **Step 1: Plan (`plan.js`)**: draw the polygon floor and walls from `wallsOf(S.poly)`, each wall's number at its midpoint (inside), its length in cm along the outside (`"{n} cm"` / `"{n} سم"`), every door as a gap with a swing arc into the room, every window as a double line. Hit areas stay `data-wall="<index>"`. `planMarkup({lang, sel, gridId})` keeps its signature.
- [ ] **Step 2: 3D (`three/room.js`)**: floor as a `THREE.Shape` from `S.poly` (offset by `-L/2, -W/2`), one wall plane per polygon edge facing inward, door/window panels per opening at `offset + width/2` along the wall, `sill + height/2` up. `setCam("door")` stands in the first door (falls back to `"corner"` if none).
- [ ] **Step 3: Everything else reads walls by index**: estimate groups wall areas by finish over `S.walls.entries()`; inspector shows "Wall n" and area; library `applyPayload("wall:…")` resolves with `nearestWall`; "Apply to all walls" fills the array; render prompt describes walls as "wall 1 … wall n going clockwise from the top-left corner" with each wall's finish, length and openings, and furniture as "against wall n" (replace the n/e/s/w wording); proposal room line shows `bbox` in cm and the floor area (polygon area) in m².
- [ ] **Step 4: Top bar (`studio.html`, `main.js`)**: remove the Length/Width/Height inputs; add a **"Room setup"** button (`#roomSetupBtn`, i18n `roomSetup`) and a read-only size label (`#roomSize`, e.g. `"600 × 500 × 280 cm"`). Floor area everywhere uses polygon area (add `polyArea(poly) -> number` to `geometry.js` with a test: L 600×500 cut 200×150 → `27`).
- [ ] **Step 5: Verify** with `npm test` (PASS) and by loading `/studio.html` (via `npm run dev`, or the Playwright harness used earlier) with an L room set in the console through `applyRoom(...)`: plan and 3D show 6 walls, 2 doors and 2 windows, finishes apply per wall, the estimate wall areas match `wallArea`, the PDF plan matches, Arabic labels show `حائط n`.
- [ ] **Step 6: Commit** `git commit -am "Studio: any room shape, numbered walls, many doors and windows"`

---

### Task 4: Photo analysis on the server

**Files:**
- Create: `src/studio/vision.js` (pure, shared by browser and server)
- Create: `api/analyze.js`
- Create: `tests/vision.test.js`, `tests/analyze-api.test.js`
- Modify: `.env.example` (document `CF_VISION_MODEL`)

**Interfaces:**
- Produces:
  - `VISION_PROMPT: string` — asks for JSON only: `{"openings":[{"type":"door"|"window","left":0-1,"right":0-1,"top":0-1,"bottom":0-1}]}`, fractions of the wall as seen (left/right across the wall's width, top = ceiling 0 → floor 1), only openings on the main wall in the photo.
  - `parseVisionReply(text) -> [{type, left, right, top, bottom}]` — finds the first JSON object in the text (handles code fences and prose), keeps items with a known type and `0 ≤ left < right ≤ 1`, `0 ≤ top < bottom ≤ 1` after clamping values within ±0.05 of the range; returns `[]` when nothing is usable.
  - `openingsFromFractions(list, {wall, wallLen, H}) -> openings[]` — metres, `offset = left*wallLen`, `width = (right-left)*wallLen`, `height = (bottom-top)*H`, `sill = (1-bottom)*H` (0 for doors), rounded to whole cm, `fromAI: true`, ids `"ai-<wall>-<n>"`.
  - `api/analyze.js`: `GET` → `{enabled, model}`; `POST {image}` (data URI ≤ ~4.4 MB, same check as `generate.js`) → `{openings: [...fractions]}` or `{error}` with the same status mapping as `generate.js` (401 access code, 502 provider errors, 504 timeout 55 s). Sends the image to `https://api.cloudflare.com/client/v4/accounts/<id>/ai/run/<model>` as `messages` with content `[{type:"text", text: VISION_PROMPT}, {type:"image_url", image_url:{url:<data URI>}}]`, `max_tokens` 600, `temperature` 0. If the chosen model rejects that format, adapt `api/analyze.js` to the model's documented input and note it in the commit.

- [ ] **Step 1: Write failing tests**:
  - `vision.test.js`: reply wrapped in ```` ```json ```` fences parses; reply with prose before/after parses; `left > right` item dropped; `type:"painting"` dropped; `right: 1.03` clamped to 1; `"no openings"` → `[]`. `openingsFromFractions([{type:"window", left:.3, right:.6, top:.25, bottom:.65}], {wall:0, wallLen:5, H:2.8})` → `[{id:"ai-0-0", type:"window", wall:0, offset:1.5, width:1.5, height:1.12, sill:0.98, fromAI:true}]`; a door gets `sill: 0`.
  - `analyze-api.test.js`: stub `globalThis.fetch` and a fake `req/res`; no CF keys → POST returns `{error}` with 503; wrong `x-access-code` when `ACCESS_CODE` set → 401; CF reply `{result:{response:"```json {\"openings\":[...]}```"}}` → 200 with parsed openings; CF 429 → 502 with the daily-allowance message.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `vision.js` and `api/analyze.js` (`api/analyze.js` imports `../src/studio/vision.js`). Vite's dev plugin already routes `/api/analyze` to it.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Analyze room photos with a Cloudflare vision model"` (with the new files added).

---

### Task 5: Screen 1, build by hand

**Files:**
- Create: `src/studio/setup/screen.js` (form, flow), `src/studio/setup/preview.js` (SVG preview)
- Modify: `studio.html` (`#setupScreen` section before the studio `.wrap`, which gets `id="studioScreen"`), `src/studio/main.js`, `src/studio/i18n.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `initSetup({onStart})`, `showSetup({keepDesign})`, `showStudio()`. Draft (cm): `{mode:"manual"|"photos", shape, lengthCm, widthCm, cutLengthCm, cutWidthCm, corner, heightCm, openings:[{id, type, wall, offsetCm, widthCm, heightCm, sillCm, fromAI}], photos:[{id, dataUrl, wall}]}`. Defaults: rect 500 × 400, height 280, cut 200 × 150 at `"ne"`, door 90 × 210, window 120 × 120 with sill 90.

- [ ] **Step 1: Screen layout** in `studio.html` + `screen.js`: title, two big choice cards ("I'll build the room myself" / "I have photos of the room"), "Continue last room" when `loadRoom()` is not null. After choosing: shape toggle, number inputs in cm (`step 1`, `inputmode="numeric"`), corner picker for L, the numbered wall list with lengths, an openings list (type, wall select, offset, width, height, sill for windows, delete), "Add door" / "Add window", and the live preview. Each invalid opening shows its message (`beyondWall`, `tooTall`, `overlap`, `tooSmall`) and "Start designing" is disabled while any error or shape error exists.
- [ ] **Step 2: Preview** (`preview.js`): same drawing language as the plan, wall numbers, openings; openings draggable along their wall (pointer events, 1 cm steps, clamped to the wall).
- [ ] **Step 3: Flow**: "Start designing" → `applyRoom(..., {keepDesign})`, `saveRoom()`, `showStudio()`, `rebuildAll()`, `setCam("corner")`. Tool opens on screen 1 (with "Continue last room" when saved; that restores and shows the studio). Studio "Room setup" → `showSetup({keepDesign:true})` with the draft filled from `S.form` and `S.openings`. AI-found openings show a small "found by AI" tag that clears when edited.
- [ ] **Step 4: i18n**: add every new label to `en` and `ar`; screen 1 switches with the language button (the button is visible on screen 1 too).
- [ ] **Step 5: Verify** in the browser: build a rect with 2 doors and 2 windows and an L-shape by hand, in English and Arabic, on a 1440-wide and a 768-wide (tablet) viewport; an overlapping door blocks "Start designing"; reload returns "Continue last room"; "Room setup" from the studio keeps furniture. `npm test` still PASS.
- [ ] **Step 6: Commit** `git commit -m "Room setup screen: build the room by hand"` (with the new files added).

---

### Task 6: Screen 1, from photos

**Files:**
- Create: `src/studio/setup/photos.js`, `src/studio/photo-store.js`
- Modify: `src/studio/setup/screen.js`, `src/studio/i18n.js`, `studio.html`

**Interfaces:**
- Consumes: Task 4 (`/api/analyze`, `openingsFromFractions`), Task 5 (draft, preview).
- Produces: `photo-store.js`: `savePhotos(photos) -> Promise<void>`, `loadPhotos() -> Promise<photos[]>` (IndexedDB database `roompitch`, store `photos`; resolves `[]` on any error).

- [ ] **Step 1: Upload**: file input (multiple, `accept="image/*"`), up to 8 (extra files ignored with a message), each resized to ≤ 1024 px JPEG; thumbnails with a wall dropdown (and clicking a wall in the preview assigns the selected photo). Hint text: one wall per photo, whole wall visible.
- [ ] **Step 2: Analyze**: "Find doors and windows" sends each tagged photo to `POST /api/analyze` (sequentially, with progress "Photo 2 of 5"); replaces earlier `fromAI` openings on that wall with the new ones; keeps hand-made ones. Untagged photos are skipped with a message. Errors (no keys, access code, daily allowance, bad reply) show inline and the designer can still add openings by hand. Access code is read/written the same way as `render-ai.js`.
- [ ] **Step 3: Saving**: photos saved with `savePhotos` on "Start designing" and loaded back with the room.
- [ ] **Step 4: Verify** with 3+ real room photos and Cloudflare keys (needs Mohamed's `.env`, so run on his machine or ask him to): record per opening whether it was found and the position error in cm, in the PR description. Without keys, check the error message path. `npm test` PASS.
- [ ] **Step 5: Commit** `git commit -m "Room setup: find doors and windows in photos"` (with the new files added).

---

### Task 7: Final pass and handoff

- [ ] **Step 1:** `npm test` PASS; `npm run build` succeeds (on a machine with dependencies installed).
- [ ] **Step 2:** Full manual pass in both languages: setup by hand → design → render dialog → PDF; reload; Room setup round-trip.
- [ ] **Step 3:** Update `README.md` (Room Studio section): the new first screen, cm, photos, `CF_VISION_MODEL`, `npm test`.
- [ ] **Step 4:** Push `room-setup`; tell Mohamed how to try it and what the photo test showed.
