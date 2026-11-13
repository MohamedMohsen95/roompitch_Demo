# Draw and Erase Walls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three things to the plan editor:
- "Draw wall" and "Erase" tools, which correct the wall reading.
- A new opening type `open`: no wall, floor to ceiling.
- Open parts worked out from the user's edits.

**Architecture:**
- **Edits.** The user's edits (`flat.edits`, image px) are applied by a pure `applyEdits(read, edits, k)` to the wall masks of the first reading, after `readWalls`' filters. The worker keeps the first reading, re-applies all edits on each change, and recomputes the room candidates.
- **Open parts.** These come from a pure `deriveOpens(flat, gaps, tolPx)`, which runs after every edit, fill and read. `gaps` are the drawn-wall end gaps the worker found.
- **`open` in the studio.** It flows through the existing opening model: a full-height cut with no frame.

**Tech Stack:** Plain ES modules with `.d.ts`, React + TypeScript, Three.js, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-09-plan-draw-erase-design.md`

## Global Constraints

- Edits are `{id, kind: "wall" | "erase", a: Point, b: Point}` in **image px**, stored in `flat.edits` in drawing order.
- **Drawn wall:**
  - `thick` wide, OR-ed into `walls`, `closed` and `outer`, then `foot` is recomputed.
  - An end gap of up to **1.5 m** is closed in `closed` and recorded as a bridge `drawn: true`. With no scale the limit is `doorLen` = 8 % of the long side, in reading px.
- **Erase:**
  - clears a band **1.6 × thick** wide from `walls`;
  - keeps the boundary: the stroke's centre line, `thick` wide, is OR-ed into `closed`;
  - never merges rooms.
- **Erase over an edge:** parallel within **10°**, within **1.5 × thick px** of the edge.
- **Drawn-gap bridge → `open`:** the bridge must lie on a space edge.
- **Open parts from edits** carry `fromEdit: true` and are recomputed. An `open` the user resized or added by hand is `fromEdit: false` and is kept.
- **`open` in 3D:** cut over the full height, with no lining, casing, leaf or glass. It is not priced, and render text calls it "open to the next space".
- Every new UI string goes in `en` and `ar` (`src/studio/i18n.js`). Use studio.css tokens.
- Commit on `plan-import`. Never merge to main.
- **Verify:**
  - `npm test` must pass every task.
  - From Task 3 on, also `npx tsc --noEmit` (this container: the `tcreal` scratch copy, as in the last plan).

## Review Focus

1. **Plan rotated 3°:** edits are in image px, and the masks are in the straightened reading frame. A drawn wall must land on the right pixels. Test in Task 1.
2. **Removing the only edit:** the reading returns exactly to the first reading (same candidates), and its open parts disappear. Tests in Tasks 1 and 2.
3. **A drawn wall with nothing within 1.5 m ahead:** no bridge, no crash, and the room stays open. Test in Task 1.
4. **An erase across two parallel room edges (a thick wall between two rooms):** both edges get an `open` over the same stretch. Test in Task 2.
5. **A v2 flat without `edits` (every flat saved before this):** loads and reads as today. Test in Task 3.

---

## File map

- **Create:**
  - `src/studio/plan/edits.js` and `edits.d.ts`: `applyEdits` and line painting.
  - `src/studio/plan/opens.js` and `opens.d.ts`: `deriveOpens`.
- **Modify:**
  - `src/studio/plan/walls.js`: also returns `outer`.
  - `src/studio/plan/assemble.js`: skips `drawn` / `erased` bridges.
  - `src/studio/plan/read-worker.js`: keeps `read0`; adds the `edit` and `gaps` messages.
  - `src/studio/ui/plan/readPlan.ts`: WallHandle `edit`, `gaps`.
  - `src/studio/plan/flat.js` and `flat.d.ts`: `open` height in `spaceRoom`; types.
  - `src/studio/plan/flat-store.js`: `edits` validation.
  - `src/studio/openings.js`, `src/studio/geometry.js` (`validateOpenings`), `src/studio/three/room.js`, `src/studio/three/sun.js`, `src/studio/render-ai.js`, `src/studio/ui/Inspector.tsx`, and pricing if any per opening.
  - `src/studio/ui/plan/PlanEditor.tsx`, `PlanImport.tsx`, `RealFlatView.tsx`, `src/studio/i18n.js`, `src/studio/studio.css`.
- **Tests:**
  - Create `tests/plan-edits.test.js` and `tests/plan-opens.test.js`.
  - Extend `tests/plan-assemble.test.js`, `tests/flat-store.test.js`, `tests/plan-space.test.js` and the opening tests in `tests/geometry.test.js`.

---

### Task 1: Applying edits to the wall reading

**Files:** Create `src/studio/plan/edits.js`, `edits.d.ts`. Modify `src/studio/plan/walls.js` (return `outer`), `walls.d.ts`. Test: `tests/plan-edits.test.js`.

**Interfaces:**
- Produces:
  ```ts
  export type Edit = {id: string, kind: "wall" | "erase", a: Point, b: Point};       // image px
  export function applyEdits(read: Read, edits: Edit[], k: number, scale?: number | null): Read;
  // k = reading px per image px. Returns a new Read: walls/closed/outer/foot copied and edited; bridges = the
  // original ones (each marked erased: true when an erase band covers its midpoint) + drawn end gaps
  // {id: "d<n>", a, b, width, dir: "h" | "v" | "d", outside: false, drawn: true}. With no edits it returns read itself.
  export function drawnGaps(read: Read, k: number): {a: Point, b: Point}[];      // the drawn bridges in image px
  ```
- `readWalls` also returns `outer` (the mask its footprint comes from), and `walls.d.ts` gains `outer: Mask`.
- **Painting:** a segment is drawn as the set of pixels within `width / 2` of it (a capsule). Endpoints are converted with `toStraight(read, [x * k, y * k])`.
- **End gap:**
  - From each end of a drawn wall, step along the wall's direction from `thick` past the end, up to `maxGap` px. `maxGap` is `1.5 / (scale / k)` when a scale is known, otherwise `Math.round(0.08 * long)`.
  - Stop at the first pixel of `closed` that is not part of this wall.
  - When one is found, paint the gap into `closed` and `outer` and record the bridge.
- **Foot:** recompute it from `outer` exactly as `readWalls` does (`maskNot(floodFromEdges(maskNot(outer)))`), then mark bridge `outside` as `readWalls` does.

- [ ] **Step 1: Write the failing tests**, using the `draw` helper copied from `tests/plan-synthetic.test.js`.
  - **A drawn wall closes a room:**
    - **Image:** 500 × 500 with an outer box (T = 8), and an inner wall from the left side to x = 250 at y = 200, leaving the rest open.
    - **Before:** `roomCandidates(read)` gives one candidate.
    - **After:** with `applyEdits(read, [{id:"w", kind:"wall", a:[250, 204], b:[442, 204]}], 1)`, two candidates. One contains (100, 100) and the other (100, 400).
  - **A drawn wall short of the far wall leaves a bridged gap:**
    - **Edit:** `b:[400, 204]`. The 42 px gap to the outer wall is under `maxGap` (40 px without a scale, so pass `scale = 0.03` m/px: 1.5 m = 50 px).
    - **Expect:**
      - two candidates;
      - `bridges.filter(b => b.drawn)` has length 1, with `a` near (400, 204) and `b` near (442, 204) within 2 px;
      - `drawnGaps` returns it in image px.
  - **Nothing ahead within 1.5 m:**
    - **Edit:** a wall `a:[100, 300], b:[150, 300]` in an empty box.
    - **Expect:** no drawn bridge, no throw, one candidate.
  - **Erase keeps two rooms:**
    - **Image:** a box split by a full wall at y = 200. Erase `a:[150, 204], b:[300, 204]`.
    - **Expect:**
      - two candidates still;
      - `walls.m` at (200, 204) is 0;
      - `closed.m` at (200, 204) is 1.
  - **Rotated 3°:**
    - Rotate the "drawn wall closes a room" image by 3° with `rotateImg` from `raster.js` (expand). Map the edit endpoints with the same rotation.
    - **Expect:** two candidates.
  - **No edits:** `applyEdits(read, [], 1) === read`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL (`applyEdits` not defined).
- [ ] **Step 3: Implement `edits.js`, and `outer` in `walls.js`.**
- [ ] **Step 4: Run `npm test`.** Expected: all pass, including every existing walls / rooms / assemble test.
- [ ] **Step 5: Commit:** `git commit -m "Plan edits: drawn walls and erases applied to the wall reading"`

### Task 2: Open parts from the edits

**Files:** Create `src/studio/plan/opens.js`, `opens.d.ts`. Test: `tests/plan-opens.test.js`.

**Interfaces:**
- Produces:
  ```ts
  export function deriveOpens(flat: Flat, gaps: {a: Point, b: Point}[], tolPx: number): Flat;
  ```
  It takes and returns tracing px.
- **Steps:**
  1. Drop every opening with `type === "open" && fromEdit`.
  2. For each `erase` edit, and each space edge parallel to it (within 10°) and within `tolPx` of it, add `{id: newId("o"), type: "open", a, b, heightCm: Math.round(flat.H * 100), sillCm: 0, fromAI: false, fromEdit: true}`. `a`/`b` is the stroke's projection onto the edge, clamped to the edge.
  3. For each gap lying on a space edge (both ends within `tolPx`), add the same kind of opening over the gap.
  4. Merge `fromEdit` opens on the same edge that touch or overlap.
  5. For each `wall` edit, cut every `open` (any `fromEdit`) where the wall runs along it (same parallel / tolerance rule). An open split in two becomes two, and pieces shorter than 1 px are dropped.
- `PlanOpening` (flat.d.ts) gets `type: "door" | "window" | "open"` and `fromEdit?: boolean`. `Flat` gets `edits?: Edit[]`.

- [ ] **Step 1: Write the failing tests** on a two-room flat. Left `box(0, 0, 200, 100)`, right `box(208, 0, 200, 100)`, `tolPx = 12`.
  - **An erase along the left room's right edge gives one open there, and the right room's facing edge gets one too:**
    - **Erase:** `a:[204, 20], b:[204, 60]`.
    - **Expect:** two opens, with y-ranges [20, 60] at x = 200 and at x = 208.
  - **Re-deriving replaces, it doesn't add:** `deriveOpens(deriveOpens(f, [], 12), [], 12)` has the same number of opens.
  - **A hand-made open stays:** a `{type: "open", fromEdit: false}` open survives.
  - **A drawn wall cuts an open:**
    - **Edits:** an erase `20..80`, then a wall `40..50` on the same edge.
    - **Expect:** opens [20, 40] and [50, 80] on each edge.
  - **A gap on an edge becomes an open; a gap off every edge doesn't.**
  - **No edits:** the `fromEdit` opens are removed, and nothing else changes.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `opens.js`.**
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit:** `git commit -m "Open parts worked out from the drawn walls and erases"`

### Task 3: Reading with edits (worker, readPlan, assemble, store)

**Files:** Modify `src/studio/plan/assemble.js`, `src/studio/plan/read-worker.js`, `src/studio/ui/plan/readPlan.ts`, `src/studio/plan/flat-store.js`, `flat.d.ts`. Test: `tests/plan-assemble.test.js`, `tests/flat-store.test.js`.

**Interfaces:**
- **`assembleFlat`:** in step 5 (doors and windows), skip bridges with `drawn || erased`.
- **Worker:**
  - **`read`:** stores `read0 = readWalls(...)` and runs `read = applyEdits(read0, msg.edits || [], k, null)`. The candidates come from `read`. It returns `{quality, thick, candidates, fittable, gaps: drawnGaps(read, k)}`.
  - **`edit`:** `{type: "edit", gen, edits, scale}` runs `read = applyEdits(read0, edits, k, scale)`, recomputes `cands`, and returns the same shape. `scale` is in m per image px.
- **`readPlan(image, opts: {ai, t, edits?: Edit[]})`:** passes `edits` with `read`. The returned `flat.edits = opts.edits || []`, and the returned flat is `deriveOpens(flat, info.gaps, 1.5 * info.thick)`.
- **`WallHandle` gains:**
  - `gaps: {a: Point, b: Point}[]`;
  - `edit(edits: Edit[], scale: number | null): Promise<{thick: number, gaps: {a: Point, b: Point}[]}>`.
- **`validFlat`:** `edits` is optional, and when present it must be an array of `{id: string, kind: "wall" | "erase", a, b}` with finite points.

- [ ] **Step 1: Write the failing tests:**
  - **Assemble does not turn a drawn gap into a door:**
    - Use the Task 1 short-wall image with its edit applied.
    - **Expect:** `assembleFlat(...)` openings contain no door whose midpoint is within 4 px of (421, 204).
  - **Flat-store:**
    - `validFlat({...f, edits:[{id:"e", kind:"erase", a:[0, 0], b:[5, 5]}]})` is true.
    - `kind:"cut"` is false.
    - A v2 flat with no `edits` is still valid (Review Focus 5).
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: all pass, exit 0.
- [ ] **Step 5: Commit:** `git commit -m "Reading with the plan's edits: worker, readPlan, assemble"`

### Task 4: `open` in the studio and 3D

**Files:** Modify `src/studio/plan/flat.js` (`spaceRoom`), `src/studio/openings.js`, `src/studio/geometry.js` (`validateOpenings`), `src/studio/three/room.js` (`buildOpening`), `src/studio/three/sun.js`, `src/studio/render-ai.js`, `src/studio/ui/Inspector.tsx`, and any per-opening pricing (`grep -rn 'type === "door"' src/studio`). Test: `tests/plan-space.test.js`, `tests/geometry.test.js`.

**Interfaces:**
- **`spaceRoom`:** an `open` opening gets `height = flat.H` and `sill = 0`, whatever its `heightCm`.
- **`openings.js`:**
  - `openingKind(o)` returns `"open"` for `o.type === "open"`.
  - `openingDesc` maps `open` to `"open to the next space"`.
  - `OP` gets an `open` entry (name "Opening" / "فتحة", not in the add menu).
- **`validateOpenings`:** treats `open` like a door for the sill (0), and its height may equal H.
- **`buildOpening`:** for `open`, return an empty group; the wall hole is still cut. `sun.js` excludes `open` from lit windows. Pricing skips `open`.

- [ ] **Step 1: Write the failing tests:**
  - **`spaceRoom`:** an `open` gives `height === flat.H` and `sill === 0`.
  - **Opening kinds:** `openingKind({type: "open"}) === "open"`, and `openingDesc({type: "open", ...}) === "open to the next space"`.
  - **Validation:** `validateOpenings(poly, H, [{id:"o", type:"open", wall:0, offset:0.5, width:1, height:H, sill:0}])` reports no error for `o`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: pass, exit 0.
- [ ] **Step 5: Commit:** `git commit -m "Open parts in the studio: a full-height gap with no frame"`

### Task 5: Draw wall and Erase tools in the plan editor

**Files:** Modify `src/studio/ui/plan/PlanEditor.tsx`, `PlanImport.tsx`, `RealFlatView.tsx`, `src/studio/i18n.js`, `src/studio/studio.css`.

**Interfaces:**
- **Tools.** `Tool` adds `"wall" | "erase"`. The toolbar order is Select · Fill room · Draw room (`trace`, label renamed) · Draw wall · Erase · Door · Window.
- **`PlanSel`** adds `{kind: "edit", id: string}`.
- **Drawing.** In `wall` / `erase`, pointerdown sets `a`, pointermove previews, and pointerup sets `b` and calls `onEdits([...(flat.edits || []), {id: newId("e"), kind, a, b}])`. Without Shift the stroke snaps to horizontal or vertical when within 8° of either. A stroke under 4 px is ignored.
- **Rendering:**
  - edits of kind `wall` as an accent line `thick` wide;
  - `erase` as a hatched band;
  - `open` openings as a dashed segment (class `pop open`);
  - Select picks an edit within 6 px. Delete, or the Remove button in PlanImport, removes it.
- **PlanEditor props** add `onEdits: (edits: Edit[]) => void`.
- **PlanImport.**
  - `onEdits(edits)`: sets `flat.edits`, awaits `walls.current.edit(edits, scale per image px)`, stores the gaps, then runs `change({...flat, edits})`.
  - `change` runs `deriveOpens(withSizeScale(f), walls.current?.gaps || [], 1.5 * (walls.current?.thick || 4))` before `syncTracing`.
  - "Read again" and the edit-mode re-read pass `edits: flat.edits`.
  - An `open` in the openings list is labelled `t("open1")`.
  - Resizing an `open` by its ends sets `fromEdit: false`.
- **`RealFlatView`:** class `ropen open` is drawn dashed.
- **i18n:** `toolWall`, `toolErase`, `hint_wall`, `hint_erase`, `open1`, and `toolTrace` renamed to "Draw room" / "ارسم أوضة".

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run `npm test` and `npx tsc --noEmit`.** Expected: pass, exit 0.
- [ ] **Step 3: Manual check (Mohamed, `npm run dev`):**
  - **ex4:** erase the stretch between M BATH and the hall. A dashed open appears, and in the room's 3D there is no wall there.
  - **Draw a wall across an open plan with a gap:** "Fill room" fills one side only, and the gap becomes an open.
- [ ] **Step 4: Commit:** `git commit -m "Plan editor: Draw wall and Erase, open parts shown dashed"`

### Task 6: Whole-branch check

- [ ] Run `npm test` and `npx tsc --noEmit` (all pass, exit 0). Check every new i18n key exists in `en` and `ar`. Push `plan-import`.
