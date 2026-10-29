# Plan Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third "New room" choice, "I have a floor plan": upload an image or PDF, let Cloudflare read spaces/doors/windows/sizes, correct it on top of the plan, then design one space or move between the spaces of a flat, with neighbouring spaces shown in 3D.

**Architecture:** A flat lives in plan pixels plus one scale (metres per pixel). Pure modules (`src/studio/plan/*.js`, Node-tested) do units, scale, snapping, and turning a space plus the flat's shared openings into the studio's existing room shape (`{form, poly, openings, H}`) and back. React screens (`src/studio/ui/plan/`) handle upload, the editor overlay and the flat screen. The studio itself is unchanged except for a "Flat" button, neighbour context in 3D, and a save hook that writes the space's design back into the flat.

**Tech Stack:** React 19 + TypeScript UI, plain JS logic with `node --test`, three.js, Vite, Supabase, Vercel function `api/plan.js`, `pdfjs-dist` (new dependency, browser only).

**Spec:** `docs/superpowers/specs/2026-10-29-plan-import-design.md`

## Global Constraints

- Lengths shown and typed in whole **centimetres**; areas in m². Feet-and-inches, metres and centimetres in plan text are all read and converted to cm.
- One ceiling height per flat, default **280 cm**.
- Wall snapping: **0°, 45°, 90°** (and multiples), plus snapping to corners of other spaces.
- AI: Cloudflare Workers AI through `api/plan.js`; model from env `CF_PLAN_MODEL`, falling back to `CF_VISION_MODEL`, then `@cf/meta/llama-4-scout-17b-16e-instruct`. Same `ACCESS_CODE` rule and error mapping as `api/analyze.js`. Image sent at most **1600 px** on the long side.
- The AI result is always shown on the plan for review before the studio; typed lengths are never changed by the AI; manual tracing always works when the AI fails.
- Existing manual and photo paths, single-room projects and saved rooms keep working unchanged.
- Every new string in `en` and `ar` (`src/studio/i18n.js`); screens work right-to-left and with touch.
- Supabase: flats are saved as `projects.kind = "flat"`. Until the migration allowing that kind is live (Mohamed arranges it with AlioSayed), saving a flat to the cloud fails quietly and the flat stays in the browser.

## Review Focus

1. **Size text in odd forms** ("13' x 16'", "9'9\" X 9'", "10' x 14'6\"", "12'8\" x 9'3\"", "3.5 x 4 m", "350x400cm", "12'-0\" X 29'-10\"") → each parses to cm, or to `null` (then the designer is asked) — never to a wrong number. Test in Task 1.
2. **One space's written size disagrees with the rest** (misread, or rotated) → that space is flagged and left out of the scale, not averaged in. Test in Task 2.
3. **Door on a wall shared by two spaces, moved while designing one of them** → it has moved in the other space too. Test in Task 3.
4. **A traced outline drawn counter-clockwise, with fewer than 3 corners, or crossing itself** → turned clockwise; fewer than 3 corners or self-crossing is flagged and blocks "Start designing". Test in Task 2.
5. **AI answer that is empty, not JSON, or has fractions outside 0–1** → whatever is valid is kept, the rest dropped, and the designer can trace by hand. Test in Task 4.

---

### Task 1: Units — reading written sizes

**Files:**
- Create: `src/studio/plan/units.js`
- Test: `tests/plan-units.test.js`

**Interfaces:**
- Produces:
  - `parseLength(text: string) -> number | null` — centimetres, rounded to whole cm. Accepts `12'-0"`, `12'0"`, `12' 6"`, `13'`, `9'9"`, `14'6"`, `10'-6"`, `3.5 m`, `3.5m`, `350 cm`, `350cm`, `3500 mm`, a bare number with a unit given by context is **not** accepted (returns `null`). Accepts the typographic `′ ″` and `’ ”` marks.
  - `parseRoomSize(text: string) -> [number, number] | null` — two lengths separated by `x`, `X`, `×` or `*`, with spaces optional; a unit written only after the second number (`3.5 x 4 m`, `350x400cm`) applies to both.

- [ ] **Step 1: Write the failing tests** (`node:test`, `assert/strict`):
  - `parseLength("12'-0\"") === 366`, `parseLength("13'") === 396`, `parseLength("9'9\"") === 297`, `parseLength("14'6\"") === 442`, `parseLength("10'-6\"") === 320`, `parseLength("3.5 m") === 350`, `parseLength("350cm") === 350`, `parseLength("3500 mm") === 350`, `parseLength("12′ 6″") === 381`, `parseLength("12") === null`, `parseLength("Den") === null`.
  - `parseRoomSize("12'-0\" X 29'-10\"")` deep-equals `[366, 909]`; `parseRoomSize("13' x 16'")` → `[396, 488]`; `parseRoomSize("9'9\" X 9'")` → `[297, 274]`; `parseRoomSize("12'8\" x 9'3\"")` → `[386, 282]`; `parseRoomSize("3.5 x 4 m")` → `[350, 400]`; `parseRoomSize("350x400cm")` → `[350, 400]`; `parseRoomSize("LIVING / DINING")` → `null`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `units.js` (1 ft = 30.48 cm, 1 in = 2.54 cm; round at the end).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/studio/plan/units.js tests/plan-units.test.js && git commit -m "Plan import: read written sizes in feet, metres and centimetres"`

---

### Task 2: Flat model — outlines, scale, snapping

**Files:**
- Create: `src/studio/plan/flat.js`
- Test: `tests/plan-flat.test.js`

**Interfaces:**
- Consumes: Task 1 (`parseRoomSize`); `geometry.js` (`polyArea`, `wallsOf`).
- Produces (all pure; outlines and openings in **plan pixels**):
  - Flat shape: `{v:1, image:{w, h, path?:string, dataUrl?:string}, scale:number|null /* metres per pixel */, scaleFrom:"sizes"|"wall"|null, H:number /* metres */, spaces:[Space], openings:[PlanOpening]}`.
  - `Space = {id, name, outline:[[x,y]...], sizeText:string|null, status:"todo"|"doing"|"done", design:object|null, fromAI:boolean}`.
  - `PlanOpening = {id, type:"door"|"window", a:[x,y], b:[x,y], heightCm:number, sillCm:number, fromAI:boolean}`.
  - `newFlat(image:{w,h}) -> Flat` (H 2.8, empty lists, scale null).
  - `orientCW(outline) -> outline` (clockwise on screen, y down; starts at the top-left-most corner like `shapePoly`).
  - `outlineProblem(outline) -> null | "tooFewCorners" | "crossing"`.
  - `scaleFromSizes(flat) -> {scale:number|null, flagged:string[] /* space ids */}` — per space with a parsable `sizeText`, candidate = mean of (longCm/longPx, shortCm/shortPx) of its outline's bounding box, in m/px; result = median of candidates; a space whose candidate differs from the median by more than **10 %** is flagged and excluded, then the median is recomputed. Fewer than 1 usable space → `scale:null`.
  - `scaleFromWall(lenPx:number, lenCm:number) -> number` (m/px).
  - `snapPoint(p:[x,y], prev:[x,y]|null, others:[x,y][], tolPx:number) -> [x,y]` — first snaps to any of `others` within `tolPx`; otherwise, with `prev`, rotates `p` about `prev` to the nearest multiple of 45° keeping its distance.
  - `wallLengthsCm(outline, scale) -> number[]` and `setWallLengthCm(outline, i, cm, scale) -> outline` (stretches the outline along wall i's direction: every corner whose position along that direction is at or past wall i's old end moves by the change; the others stay, so square outlines stay square).

- [ ] **Step 1: Write the failing tests**:
  - `orientCW` of a square given counter-clockwise returns it clockwise starting at the top-left corner.
  - `outlineProblem([[0,0],[10,0]]) === "tooFewCorners"`; a bow-tie `[[0,0],[10,10],[10,0],[0,10]]` → `"crossing"`; a square → `null`.
  - `scaleFromSizes`: three spaces whose outlines are 100×200 px, 150×150 px, 120×100 px with sizes "10' x 20'", "15' x 15'", "12' x 10'" → scale ≈ `0.03048` (1e-4), `flagged` empty; add a fourth 100×100 px space with "30' x 30'" → still ≈ `0.03048`, `flagged` = [that id].
  - `scaleFromWall(200, 400) === 0.02`.
  - `snapPoint([10, 1], [0, 0], [], 3)` ≈ `[10.05, 0]` (0°); `snapPoint([7, 7.4], [0,0], [], 3)` lies on the 45° line; `snapPoint([49, 51], [0,0], [[50,50]], 3)` deep-equals `[50, 50]`.
  - `wallLengthsCm([[0,0],[100,0],[100,50],[0,50]], 0.02)` deep-equals `[200, 100, 200, 100]`; `setWallLengthCm(same, 0, 300, 0.02)` makes wall 0 = 300 cm and keeps the shape closed and rectangular (walls `[300,100,300,100]`).
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `flat.js` with those signatures.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Plan import: flat model, scale from written sizes, snapping"` (add the new files first).

---

### Task 3: From a flat space to a studio room and back

**Files:**
- Modify: `src/studio/plan/flat.js`
- Test: `tests/plan-space.test.js`

**Interfaces:**
- Consumes: Task 2; `geometry.js` (`wallsOf`, `wallFrame`, `bbox`).
- Produces:
  - `spaceRoom(flat, spaceId) -> {form:{shape:"plan", heightCm}, poly:[[x,y]] /* metres, local: bounding box at 0,0, clockwise */, openings:[{id, type, wall, offset, width, height, sill}] /* metres */, H, origin:[x,y] /* the local origin in plan pixels */}`. An opening belongs to a space wall when both its ends are within **max(4 px, 8 cm)** of that wall's line and inside its extent.
  - `writeBackOpenings(flat, spaceId, openings) -> flat` — replaces the flat openings that lay on this space's walls with the given ones (mapped back to pixels through `origin` and `scale`); ids are kept, so a shared door edited here moves for the neighbour too. Returns a new flat (no mutation).
  - `neighbours(flat, spaceId, withinM = 4) -> [[x,y]][]` — the other spaces' outlines in the space's local metres, for spaces whose bounding box is within `withinM` of this one's.

- [ ] **Step 1: Write the failing tests** (build a small flat in the test: two 200×100 px rooms side by side sharing the wall x=200, scale 0.02 m/px, a door on the shared wall from (200,30) to (200,75), a window on the left room's top wall):
  - `spaceRoom(flat, "left")`: `poly` = 4×2 m rectangle; openings has the door with `wall` = index of the right-hand wall, `offset` ≈ 0.6, `width` ≈ 0.9; and the window on wall 0.
  - `spaceRoom(flat, "right")` also has the same door id (on its left wall).
  - `writeBackOpenings` after moving the door to `offset` 1.0 in "left" → `spaceRoom(updated, "right")` shows the door at the matching position (its offset on the right room's wall reflects the move, within 1 cm).
  - `neighbours(flat, "left")` returns one outline, shifted so "right" starts at x = 4 m.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** in `flat.js`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS (including earlier tests).
- [ ] **Step 5: Commit** `git commit -am "Plan import: open a flat space as a studio room and write its doors back"`

---

### Task 4: Reading the plan with Cloudflare

**Files:**
- Create: `src/studio/plan/plan-vision.js`, `api/plan.js`
- Test: `tests/plan-vision.test.js`, `tests/plan-api.test.js`
- Modify: `.env.example` (document `CF_PLAN_MODEL`), `vercel.json` (`api/plan.js` maxDuration 60)

**Interfaces:**
- Produces:
  - `PLAN_PROMPT: string` — asks for JSON only: `{"spaces":[{"name":"LIVING","outline":[[x,y],...],"size":"12'-0\" X 29'-10\""}],"openings":[{"type":"door","x1":..,"y1":..,"x2":..,"y2":..}]}` with coordinates as **fractions of the image** (0–1), open areas as one space, furniture and fixtures ignored, `size` copied exactly as written or `null`.
  - `parsePlanReply(text) -> {spaces:[{name, outline, size}], openings:[{type, x1, y1, x2, y2}]}` — first JSON object with a `spaces` or `openings` array; drops outlines with < 3 points or any coordinate outside −0.05…1.05 (clamps the rest); drops unknown opening types; `{spaces:[], openings:[]}` when nothing usable.
  - `flatFromReply(reply, image:{w,h}) -> Flat` — pixels, `orientCW` outlines, `fromAI:true`, doors 210 cm high, windows 120 cm high with 90 cm sill, then `scale` from `scaleFromSizes`.
  - `api/plan.js`: `GET` → `{enabled, model}`; `POST {image}` → `{spaces, openings}` (fractions) or `{error}`; same checks, statuses and 55 s timeout as `api/analyze.js`; request body to Cloudflare as in `api/analyze.js` with `PLAN_PROMPT`, `max_tokens` 2000.
- [ ] **Step 1: Write the failing tests**: fenced and prose-wrapped replies parse; a 2-point outline is dropped; a coordinate of 1.3 drops that outline; `type:"stairs"` dropped; `"sorry"` → empty; `flatFromReply` on a reply with two spaces and sizes gives pixel outlines, `fromAI` set and a non-null `scale`; API tests mirror `tests/analyze-api.test.js` (no keys → 503, wrong code → 401, fenced reply → 200 parsed, CF 429 → 502 allowance message).
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** both files; `api/plan.js` imports `../src/studio/plan/plan-vision.js`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Plan import: ask Cloudflare to read a floor plan"` (with new files added).

---

### Task 5: Upload, PDF pages and the plan editor

**Files:**
- Create: `src/studio/plan/pdf.js`, `src/studio/ui/plan/PlanImport.tsx`, `src/studio/ui/plan/PlanEditor.tsx`
- Modify: `src/studio/ui/setup/SetupScreen.tsx` (third choice card "I have a floor plan"), `src/studio/ui/StudioApp.tsx` (route `/studio/plan`), `src/studio/i18n.js`, `src/studio/studio.css`, `package.json` (`pdfjs-dist`, exact version)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `pdfPageCount(file: File) -> Promise<number>`, `renderPdfPage(file: File, page: number, maxSide = 2400) -> Promise<{dataUrl, w, h}>` (pdf.js worker loaded through Vite's `?url` import).
  - `<PlanImport initialFlat?: Flat | null onDone(flat) onCancel() />`: steps upload → (PDF page pick) → "Read the plan" (POST `/api/plan` with the image downscaled to 1600 px; on error an inline message and an empty flat to trace) → editor → scale and height → "Start designing".
  - `<PlanEditor flat onChange(flat) selected onSelect(id) />`: SVG over the plan image; drag corners (with `snapPoint`), add a corner by double-clicking a wall, remove by selecting a corner and pressing Delete (and a button for touch), "New space" mode tracing by clicks (Enter / double-click / clicking the first corner closes it), delete or rename a space, add door/window by dragging along a wall, drag their ends, delete them; each wall's length in cm shown when `scale` is set and editable through `setWallLengthCm`; AI items marked until edited; spaces with `outlineProblem` or a flagged size outlined in red with the reason.
  - Scale panel: shows `scaleFrom`; when `scale` is null, asks to click one wall and type its length (`scaleFromWall`); a "Ceiling height (cm)" field, default 280.
  - "Start designing" is disabled while scale is null, any outline has a problem, or there are no spaces. One space → open it in the studio; several → the flat screen (Task 6).
- [ ] **Step 1: Verify current behaviour** — open `/studio`, confirm two choice cards; note it for the before/after.
- [ ] **Step 2: Implement** the three files and wiring. All plan logic calls the pure functions from Tasks 2–4; no geometry is duplicated in the components.
- [ ] **Step 3: Verify in a browser** with Mohamed's three example plans (saved under `tests/fixtures/plans/` for manual runs: the two JPGs and the AVIF converted to PNG) and a PDF made from one of them: page picker shows for a 2-page PDF; with `/api/plan` stubbed to return a canned reply, outlines appear over the plan and can be dragged (snaps to 90°/45°, to neighbour corners), traced, deleted; the no-size example asks for one wall length; "Start designing" stays disabled until scale is set. Arabic pass. 768 px wide touch pass for corner dragging. `npm test` PASS.
- [ ] **Step 4: Commit** `git commit -m "Plan import: upload, PDF pages and editing the plan"` (with new files added).

---

### Task 6: The flat screen, saving, and moving between spaces

**Files:**
- Create: `src/studio/plan/flat-store.js`, `src/studio/ui/plan/FlatScreen.tsx`
- Modify: `src/studio/ui/StudioApp.tsx` (route `/studio/flat`, opening a space, save hook), `src/studio/ui/StudioScreen.tsx` ("Flat" button instead of "Room setup" when the room is a flat space), `src/studio/cloud-store.js` (save/list/open kind `"flat"`), `src/studio/ui/setup/ProjectsList.tsx` (flats listed, opening one shows the flat screen), `db/schema.js` (`projects_kind_check` gains `"flat"`), `src/studio/i18n.js`
- Test: `tests/flat-store.test.js`

**Interfaces:**
- Consumes: Tasks 2, 3, 5.
- Produces:
  - `flat-store.js`: `saveFlat(flat) -> void` (localStorage `rp_flat`; then the cloud hook), `loadFlat() -> Flat | null` (null when missing, unparsable, `v !== 1`, or any space outline < 3 points), `validFlat(f) -> boolean`, `onFlatSaved(fn)`, `setCurrentSpace(id|null)`, `currentSpace() -> string|null`.
  - Opening a space: `room = spaceRoom(flat, id)`; if the space has a `design`, `restoreRoom({...design, poly:room.poly, openings:room.openings, H:room.H, form:room.form})` (outline and doors always from the flat) else `applyRoom(room, {keepDesign:false})`; status becomes `"doing"` when it was `"todo"`.
  - Save hook: while a flat space is open, each room save also stores the room as that space's `design`, writes doors back with `writeBackOpenings`, and calls `saveFlat`. The single-room `rp_room` / `pushRoom` path is not used for flat spaces.
  - `cloud-store.js`: `pushFlat(flat)` (same debounce as `pushRoom`, row `{kind:"flat", data:flat}`; the plan image uploaded once to storage at `<user id>/<project id>/plan.jpg` and referenced by `image.path`); `listProjects()` returns flats too with `kind`; `openProject()` returns `{kind, data}` (callers updated). A save rejected by the database (kind not yet allowed) logs once and leaves the flat in the browser.
  - `<FlatScreen flat onOpenSpace(id) onEditPlan() onMarkDone(id, done) />`: the plan with spaces outlined, names, area (m²) and status chip; "Edit plan" reopens `PlanImport` with the flat; a "done" toggle per space.
- [ ] **Step 1: Write the failing tests** (`tests/flat-store.test.js` with a localStorage stub): save/load round trip; `loadFlat` null for missing, garbage, `{v:2}`, a space with 2 points; the save hook stores `design` on the right space and a door moved in that design is moved in the flat (using `writeBackOpenings`).
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `flat-store.js`, the flat screen and the wiring listed above; add `"flat"` to `projects_kind_check` in `db/schema.js` (do **not** generate or push the migration here: Mohamed arranges that with AlioSayed; note it in the commit message).
- [ ] **Step 4: Run** `npm test` — Expected: PASS. **Verify in a browser:** import a flat with 3 spaces, design two, mark one done, reload: the flat screen comes back with statuses and each space's design; a door edited in one bedroom has moved in the hall; with Supabase keys but no migration, nothing breaks.
- [ ] **Step 5: Commit** `git commit -m "Plan import: the flat screen, saving flats, moving between spaces (needs the 'flat' kind migration in Supabase)"` (with new files added).

---

### Task 7: Neighbouring spaces in 3D

**Files:**
- Create: `src/studio/three/context.js`
- Modify: `src/studio/app.js` (rebuild context with the room), `src/studio/ui/StudioApp.tsx` (pass neighbours when a flat space opens; none otherwise)

**Interfaces:**
- Consumes: Task 3 (`neighbours`).
- Produces: `setContext(outlines: [[x,y]][] /* local metres */) -> void` and `buildContext() -> void` — a three.js group of grey floor and wall planes for each outline (height `S.H`, colour `#c9cbc8`, no textures, `raycast` disabled so they can't be picked), added beside `roomGroup`, culled with the same front-wall rule as the room; excluded from the AI render snapshot only if they hide the room (keep them otherwise).
- [ ] **Step 1: Implement** and wire it.
- [ ] **Step 2: Verify in a browser:** in a bedroom of an imported flat, the hall is visible in grey through the bedroom door from the "From door" and corner views; clicking it selects nothing; a single-room project shows no context. `npm test` PASS.
- [ ] **Step 3: Commit** `git commit -am "Plan import: show neighbouring spaces in 3D"`

---

### Task 8: Final pass

- [ ] **Step 1:** `npm test` PASS; `npm run typecheck` and `npm run build` pass (on a machine with dependencies).
- [ ] **Step 2:** The spec's "How we'll know it works" list, on Mohamed's three plans, with the Cloudflare reading recorded per plan (spaces / openings / sizes right or fixed). English and Arabic; tablet width.
- [ ] **Step 3:** README: the plan option, units, the flat screen, `CF_PLAN_MODEL`, the `flat` kind migration.
- [ ] **Step 4:** Push `plan-import`; final whole-branch review; report.
