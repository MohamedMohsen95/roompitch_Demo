# Tracing and Real Flat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the traced walls fixed on the floor-plan image and send every size correction to a second geometry, the real flat in metres. The flat overview, the room studio and its map are built from that real flat.

**Architecture:**
- A `Flat` v2 carries `real: RealFlat | null`. The real flat is in metres in the flat frame (image px × scale). While it is `null`, it is derived from the tracing (tracing × scale).
- Pure modules hold all the logic: `real.js` (derive, rescale, sync tracing edits, diff, overlaps) and `correct.js` (room size and wall corrections, shared walls, the "runs past" step).
- React screens only call them and show dialogs. `spaceRoom` / `writeBackOpenings` switch from tracing × scale to the real flat, so the studio, 3D and proposal follow without further changes.

**Tech Stack:** Plain ES modules with `.d.ts` beside them, React + TypeScript UI, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-09-tracing-and-real-flat-design.md` (mockup: Design canvas "RoomPitch plan and rooms mockup", boards 1b, 2 and 3).

## Global Constraints

- The tracing (`spaces[].outline`, `openings[].a/b`, image px) never changes because of a typed number.
- `WALL_TOL_M = 0.26` (from flat.js) is the distance within which two parallel edges count as the two faces of one wall.
- Two edges are parallel when their angles differ by ≤ 2°.
- A corner "differs" from the tracing when it is more than 0.02 m away.
- Every new UI string goes into `en` and `ar` in `src/studio/i18n.js`.
- Use the studio.css tokens (`--accent`, `--line`, …). Changed-from-tracing is drawn in orange `#d68910`, and the tracing's position as a dashed line.
- The flat stays one JSON document. Cloud save is unchanged (`projects.data`, kind `flat`).
- Commit on `plan-import`. Never merge to main.
- Verify every task with `npm test` (all pass). From Task 4 on, also run `npx tsc --noEmit` (exit 0).

## Review Focus

1. **Rotated plans** (`*_rot3`): rooms are not axis-aligned in the flat frame. Width × Length and shared-wall moves must work along the room's own axes. Test in Task 3.
2. **A flat with no scale**, or a v1 flat from the cloud: `realOf` and the screens must not throw. The first number sets the scale without asking. Tests in Tasks 1 and 5.
3. **A door on a moved shared wall:** it moves with the wall and stays one opening that both rooms see. Test in Task 3.
4. **Corrections, then a whole-plan rescale:** the corrections survive, scaled by the same factor. Test in Task 2.
5. **A tracing edit that changes a room's corner count after the real flat diverged:** that room's real polygon is rebuilt from the tracing, and the other rooms keep their corrections. Test in Task 2.

---

## File map

- Create `src/studio/plan/real.js`, `real.d.ts`: the real flat model.
- Create `src/studio/plan/correct.js`, `correct.d.ts`: size corrections.
- Modify `src/studio/plan/flat.js`, `flat.d.ts`:
  - `newFlat` v2;
  - `spaceRoom`, `writeBackOpenings` and `neighbours` read the real flat;
  - `stretchWall` / `setWallLengthCm` are no longer called by the UI.
- Modify `src/studio/plan/flat-store.js`, `flat-store.d.ts`: `validFlat` accepts v1 and v2; `upgradeFlat`.
- Create `src/studio/ui/plan/RealFlatView.tsx`: SVG drawing of the real flat. Used on all three screens.
- Create `src/studio/ui/plan/CorrectDialog.tsx`: the scale question, and the wall-line / confirmed-neighbour dialog.
- Modify `src/studio/ui/plan/PlanImport.tsx`: room-size panel, walls one by one on the real flat, rescale control, stacked layout.
- Modify `src/studio/ui/plan/FlatScreen.tsx`: real-flat overview.
- Modify `src/studio/ui/StudioApp.tsx` and `src/studio/ui/StudioScreen.tsx`: room alone, breadcrumb, prev / next, map.
- Modify `src/studio/i18n.js` and `src/studio/studio.css`.
- Tests:
  - Create `tests/plan-real.test.js` and `tests/plan-correct.test.js`.
  - Extend `tests/plan-space.test.js` and `tests/flat-store.test.js`.

---

### Task 1: Flat v2 and the derived real flat

**Files:** Create `src/studio/plan/real.js`, `real.d.ts`. Modify `src/studio/plan/flat.js` (`newFlat`), `flat.d.ts`, `src/studio/plan/flat-store.js` (`validFlat`, `loadFlat`), `flat-store.d.ts`. Test: `tests/plan-real.test.js`, `tests/flat-store.test.js`.

**Interfaces:**
- Produces, in `real.d.ts`:
  ```ts
  export type RealFlat = {spaces: {id: string, poly: Point[]}[], openings: {id: string, a: Point, b: Point}[], confirmed: string[]};
  export function realOf(flat: Flat): RealFlat;            // flat.real, else tracing × scale (empty spaces when scale is null)
  export function materialize(flat: Flat): Flat;           // flat with real = realOf(flat) (no-op if set)
  export function realSpace(flat: Flat, id: string): {id: string, poly: Point[]} | null;
  ```
- `Flat` (flat.d.ts) gains `v: 1 | 2`, `scaleAsked: boolean` and `real: RealFlat | null`. `newFlat` returns `v: 2, scaleAsked: false, real: null`.
- `flat-store`: `upgradeFlat(f): Flat`. A v1 flat becomes `v: 2, scaleAsked: false, real: null`. `loadFlat` returns `upgradeFlat(f)`. `validFlat` accepts v1 and v2. On a v2 flat with `real`, every `real.spaces[].poly` must have ≥ 3 finite points and `real.confirmed` must be a string array.

- [ ] **Step 1: Write the failing tests**

```js
test("realOf derives tracing × scale and keeps clockwise polys", () => {
  const f = {...newFlat({w:100, h:100}), scale:0.05, spaces:[{id:"a", outline:[[0,0],[0,40],[60,40],[60,0]]}], openings:[{id:"d", a:[60,10], b:[60,20]}]};
  const r = realOf(f);
  assert.deepEqual(r.spaces[0].poly, [[0,0],[3,0],[3,2],[0,2]]);
  assert.deepEqual(r.openings[0], {id:"d", a:[3,0.5], b:[3,1]});
  assert.deepEqual(r.confirmed, []);
});
test("realOf with no scale is empty, and materialize keeps a set real", () => {
  assert.deepEqual(realOf(newFlat({w:10, h:10})).spaces, []);
  const f = {...newFlat({w:10, h:10}), scale:1, real:{spaces:[{id:"x", poly:[[0,0],[1,0],[1,1]]}], openings:[], confirmed:["x"]}};
  assert.equal(materialize(f), f);
});
// flat-store.test.js
test("v1 flats load as v2 with no real flat", () => {
  const v1 = {v:1, image:{w:10, h:10}, scale:null, scaleFrom:null, H:2.8, spaces:[], openings:[]};
  assert.equal(validFlat(v1), true);
  assert.deepEqual(pick(upgradeFlat(v1), ["v", "scaleAsked", "real"]), {v:2, scaleAsked:false, real:null});
  assert.equal(validFlat({...upgradeFlat(v1), real:{spaces:[{id:"a", poly:[[0,0]]}], openings:[], confirmed:[]}}), false);
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL (realOf / upgradeFlat not defined).
- [ ] **Step 3: Implement.** `realOf` maps with `orientCW(outline).map(p => [x * scale, y * scale])`, rounded to 1e-6, the same way `toLocal` rounds. `pick` is a small helper inside the test file.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit:** `git commit -m "Flat v2: real flat in metres, derived from the tracing until it changes"`

### Task 2: Rescale, tracing sync, diff, overlaps, reset

**Files:** Modify `src/studio/plan/real.js`, `real.d.ts`. Test: `tests/plan-real.test.js`.

**Interfaces:**
- Produces:
  ```ts
  export function rescale(flat: Flat, factor: number): Flat;   // scale *= factor; real coords *= factor when real is set; tracing untouched
  export function syncTracing(prev: Flat, next: Flat): Flat;   // apply a tracing edit to next.real (no-op when real is null)
  export function realDiff(flat: Flat): Set<string>;           // space ids whose real poly differs from tracing × scale (> 0.02 m at any corner, or another corner count)
  export function realOverlaps(flat: Flat): [string, string][]; // pairs of real spaces whose polygons overlap by > 0.01 m²
  export function resetReal(flat: Flat): Flat;                 // real = null (scaleAsked kept)
  ```
- `syncTracing` rules:
  - A space in `next` but not in `real` is added as tracing × scale.
  - A space missing from `next` is removed from `real` and from `confirmed`.
  - Same id and same corner count: each corner moved in the tracing by d px moves its real corner by d × scale. Corners match by index after `orientCW`.
  - Corner count changed: that space's real poly becomes tracing × scale.
  - Openings follow the same rules by id.

- [ ] **Step 1: Write the failing tests**

```js
test("rescale keeps corrections, scaled", () => {
  const f = materialize(two());                         // two(): helper flat, rooms a (0..60 px) and b (60..120 px), scale 0.05
  const g = {...f, real:{...f.real, spaces:f.real.spaces.map(s => s.id === "a" ? {...s, poly:s.poly.map(([x, y]) => [x * 1.1, y])} : s)}};
  const h = rescale(g, 2);
  assert.equal(h.scale, 0.1);
  assert.deepEqual(h.spaces, g.spaces);                // tracing untouched
  assert.ok(Math.abs(h.real.spaces[0].poly[1][0] - 2 * g.real.spaces[0].poly[1][0]) < 1e-9);
});
test("a tracing edit that adds a corner rebuilds only that room", () => {
  const f = materialize(two()), moved = {...f, real:{...f.real, spaces:f.real.spaces.map(s => s.id === "b" ? {...s, poly:s.poly.map(([x, y]) => [x + 0.1, y])} : s)}};
  const next = {...moved, spaces:moved.spaces.map(s => s.id === "a" ? {...s, outline:[[0,0],[30,0],[60,0],[60,40],[0,40]]} : s)};
  const r = syncTracing(moved, next).real;
  assert.equal(r.spaces.find(s => s.id === "a").poly.length, 5);
  assert.deepEqual(r.spaces.find(s => s.id === "b").poly, moved.real.spaces.find(s => s.id === "b").poly);
});
test("a dragged tracing corner moves the same real corner by the same amount × scale", () => { /* corner 1 of a: +10 px x → real +0.5 m */ });
test("realDiff and realOverlaps", () => { /* b shifted 0.1 m left over a: diff = {b}, overlaps = [["a","b"]] */ });
test("resetReal drops real and keeps scaleAsked", () => { /* … */ });
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** in `real.js`. Overlap area comes from a convex-or-not polygon clip. Reuse `polyIoU`'s approach from `tests/helpers/poly.js`, moved into `src/studio/geometry.js` as `polyIntersectArea(a, b)` if it isn't there already.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit:** `git commit -m "Real flat: rescale, follow tracing edits, diff and overlaps"`

### Task 3: Size corrections and shared walls

**Files:** Create `src/studio/plan/correct.js`, `correct.d.ts`. Test: `tests/plan-correct.test.js`.

**Interfaces:**
- Consumes: `realOf`, `materialize` (Task 1), `WALL_TOL_M`, `outlineProblem` (flat.js).
- Produces:
  ```ts
  export type Correction = {kind: "room", spaceId: string, axis: "width" | "length", cm: number} | {kind: "wall", spaceId: string, i: number, cm: number};
  export type Affected = {id: string, name: string, before: [number, number], after: [number, number], confirmed: boolean}; // cm, box along the room's axes
  export type CorrectionPlan =
    | {ok: true, side: number, otherSide: number | null, runsPast: boolean, outsideMoved: boolean, affected: Affected[]}
    | {ok: false, reason: "noScale" | "notRect" | "tooSmall" | "noChange"};
  export function roomBox(flat: Flat, spaceId: string): {rect: boolean, width: number, length: number} | null; // cm; width = |edge 0|, length = |edge 1| of the CW real poly
  export function planCorrection(flat: Flat, c: Correction, opts?: {side?: number, whole?: boolean}): CorrectionPlan;
  export function applyCorrection(flat: Flat, c: Correction, opts: {side?: number, whole: boolean}): Flat; // materializes, adds spaceId to confirmed
  ```
- Rules, from the spec:
  - **Rect** means 4 corners with every corner angle within 2° of 90°. The room's axes are its own edge directions, so rotated plans work.
  - **Which side moves:**
    - `room`/`width` moves edge 1 or edge 3; `room`/`length` moves edge 2 or edge 0.
    - `wall` i moves edge i+1 when it is within 2° of perpendicular to edge i. Otherwise only this room changes (no neighbours), and corners past the end move as `setWallLengthCm` does.
  - **Interior side:** an edge is interior when another real space has a parallel edge whose perpendicular gap is ≤ `WALL_TOL_M` and whose projections overlap by > 0.05 m.
  - **Default side:**
    - the interior one;
    - if both are interior, the end side (edge 1 / edge 2);
    - if both are exterior, the end side, with `outsideMoved = true`.
    - `opts.side` overrides the default, and `otherSide` reports the alternative.
  - **Moving a side by δ along its outward normal n:**
    - This room's corners on the side move by δ·n.
    - A facing neighbour edge fully inside this room's side range (± `WALL_TOL_M`) has both its corners moved.
    - `runsPast` is set when any facing edge extends beyond the side's range by more than `WALL_TOL_M`. Then:
      - `whole: true`: every corner of every space lying on either face line of that wall (within `WALL_TOL_M` of the side's line or of the facing line) moves by δ·n.
      - `whole: false`: each facing edge that runs past gets four new corners, forming a step: at the two projections of this room's ends onto it, and those two moved by δ·n.
  - **Openings:** a `real.openings` segment whose ends are both within `WALL_TOL_M` of a moved edge moves by δ·n. Others stay.
  - **Validation:**
    - `tooSmall` when any affected room's box dimension would be < 30 cm or its poly fails `outlineProblem`.
    - `noChange` when |δ| < 0.5 cm.
    - `noScale` when `flat.scale` is null.
    - `notRect` for a `room` correction on a non-rect room.
  - `affected` lists every space whose box changed, this room first, each with `confirmed` from `real.confirmed`.

- [ ] **Step 1: Write the failing tests.** Fixtures are made in the test from rectangles in metres, using a `flatOf(rooms, openings)` helper that builds a v2 flat with scale 1 and `real` set.

```js
test("widening a room moves the shared wall; the neighbour shrinks", () => {
  // A [0,0]-[3,3], B [3.2,0]-[6,3] (0.2 m wall between)
  const f = flatOf({A:[0,0,3,3], B:[3.2,0,6,3]});
  const p = planCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:340});
  assert.equal(p.ok && p.runsPast, false);
  assert.deepEqual(p.affected.map(a => [a.id, a.after]), [["A", [340, 300]], ["B", [240, 300]]]);
  const g = applyCorrection(f, {kind:"room", spaceId:"A", axis:"width", cm:340}, {whole:true});
  assert.deepEqual(g.spaces, f.spaces);               // tracing untouched
  assert.deepEqual(g.real.confirmed, ["A"]);
});
test("both sides exterior: the right side moves and outsideMoved is set", () => { /* lone room */ });
test("a corridor wall running past: whole moves every room on the line; part makes a step", () => {
  // A [0,0]-[3,3], B [3.2,0]-[6,3], corridor C [0,3.2]-[6,4.4]; lengthen A by 40 cm
  const c = {kind:"room", spaceId:"A", axis:"length", cm:340};
  assert.equal(planCorrection(flatOf(rooms3), c).runsPast, true);
  const whole = applyCorrection(flatOf(rooms3), c, {whole:true});
  assert.deepEqual(boxes(whole), {A:[300, 340], B:[280, 340], C:[600, 80]});
  const part = applyCorrection(flatOf(rooms3), c, {whole:false});
  assert.equal(realSpace(part, "C").poly.length, 8);
  assert.deepEqual(boxes(part).B, [280, 300]);
});
test("a door on the moved wall moves with it", () => { /* opening on A|B wall shifts by 0.4 m */ });
test("rotated rooms: width follows the room's own axes", () => { /* the A/B pair rotated 3° */ });
test("confirmed neighbour is reported; too small is refused; not rect is refused", () => { /* … */ });
test("wall one by one on an L-shaped room changes only that room when the next edge is not perpendicular", () => { /* … */ });
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** `correct.js` along the rules above. Work in the real flat only, and never touch `spaces[].outline`.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit:** `git commit -m "Corrections: room size and wall length on the real flat, shared walls move as one"`

### Task 4: Studio rooms from the real flat

**Files:** Modify `src/studio/plan/flat.js` (`spaceRoom`, `writeBackOpenings`, `neighbours`), `flat.d.ts`, `src/studio/plan/flat-store.js` (`designSaved`). Test: `tests/plan-space.test.js`, `tests/flat-store.test.js`.

**Interfaces:**
- Consumes: `realOf`, `materialize`, `realSpace`.
- `spaceRoom(flat, id)` keeps its return type. It is built from `realSpace(flat, id).poly`, already in metres: origin is the poly's min corner, and `form` takes the bbox in cm. Openings come from `realOf(flat).openings`, with `onWall` tolerance `WALL_TOL_M` in metres. `heightCm` and `sillCm` are read from `flat.openings` by id.
- `writeBackOpenings(flat, id, openings)` writes to `real.openings` (materializing first). Ids are kept, and the tracing's `flat.openings` are untouched, except that a new opening from the studio is also appended to `flat.openings` with `a`/`b` = real ÷ scale, so its height and sill have a home.
- `neighbours` is kept but no longer used by `StudioApp` (Task 7).

- [ ] **Step 1: Write the failing tests:**
  - **spaceRoom follows a corrected real flat:** after `applyCorrection` widens A to 340 cm, `spaceRoom(f, "A").form.lengthCm === 340`, and the door on the moved wall keeps its width.
  - **writeBackOpenings leaves the tracing alone:** `flat.openings[0].a` is unchanged, and `real.openings` has the new offset.
  - **The existing plan-space tests still pass:** a derived real flat gives the same rooms as before.
- [ ] **Step 2: Run `npm test`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: all pass, exit 0.
- [ ] **Step 5: Commit:** `git commit -m "Rooms open from the real flat; studio doors go to the real flat"`

### Task 5: Fix-the-plan screen

**Files:**
- Create `src/studio/ui/plan/RealFlatView.tsx` and `src/studio/ui/plan/CorrectDialog.tsx`.
- Modify `src/studio/ui/plan/PlanImport.tsx`, `src/studio/i18n.js`, `src/studio/studio.css`.

**Interfaces:**
- `RealFlatView` props: `{flat: Flat, highlight?: string | null, diff?: boolean, onPick?: (id: string) => void, compact?: boolean}`.
  - Draws `realOf(flat)` in an SVG with viewBox = the real bbox plus a 0.3 m margin.
  - Walls are strokes of the poly, 0.15 m wide (`vectorEffect` off). Names and `w × l m` are drawn when `compact` is not set.
  - With `diff`: rooms in `realDiff` get the orange fill and outline, and their tracing × scale poly is drawn dashed. Overlapping pairs from `realOverlaps` are filled with `--danger-soft`.
- `CorrectDialog` props: `{kind: "scale" | "line", plan?: CorrectionPlan, onWhole: () => void, onPart: () => void, onCancel: () => void}`.
  - `scale`: buttons "The whole plan" / "Only this room/wall".
  - `line`: buttons "Move the whole wall" / "Only this room's part". It lists `affected`, and marks confirmed rooms as "confirmed — will change".
  - A plan without `runsPast` but with a confirmed neighbour uses `line` with only Apply / Cancel.
- `PlanImport` changes:
  1. **Number edits (`onNumber`).** `onNumber(c: Correction)` replaces `typeWall`. Precedence:
     1. **No scale yet:** the scale comes from that wall's or that box side's tracing length in px (`scaleFromWall`). Set `scaleAsked = true`, `scaleFrom = "wall"`, and ask nothing.
     2. **`!scaleAsked`:** open `CorrectDialog kind="scale"`.
        - "Whole plan" applies `rescale(flat, typed / shown)` and sets `scaleAsked = true`, `scaleFrom = "wall"`.
        - "Only this" sets the same two flags, then continues to step 3.
     3. **Otherwise:** run `planCorrection`.
        - `ok:false`: show the reason in the status line.
        - `runsPast`, or any affected room after the first that is confirmed: open `CorrectDialog kind="line"`.
        - Otherwise: apply directly.
  2. **The room panel.** For the selected space: Width / Length `NumField`s in cm from `roomBox`, hidden when `!rect`, then a "Walls one by one (n)" disclosure listing the real wall lengths. When the plan's `otherSide` is not null, a "move the other side" link re-applies the last correction with `side: otherSide`.
  3. **The rescale control.** In the scale card, "Rescale the whole plan…" replaces the `scaleNext` checkbox and the `lengthSets` state. It arms the next number edit to take the "Whole plan" path, then disarms.
  4. **Tracing edits.** `change(f)` becomes `setFlat(syncTracing(flat, withSizeScale(f)))`.
  5. **Layout.** The preview column shows `PlanEditor`, then below it `<RealFlatView flat diff highlight={selSpace?.id} onPick={id => setSel({kind:"space", id})}/>`. The default is stacked when `image.w >= image.h` and side by side otherwise, with a toggle button. The choice is kept in `localStorage` key `rp_plan_layout`, wrapped in try/catch.
  6. **Overlaps.** When `realOverlaps(flat).length`, a notice offers "Reset the real flat to the tracing" (`resetReal`).
- i18n keys, en and ar:
  - `scaleQ`, `scaleQWhole`, `scaleQThis`
  - `lineQ`, `lineWhole`, `linePart`, `confirmedWillChange`
  - `roomWidth`, `roomLength`, `wallsOneByOne`, `otherSide`, `rescaleWhole`
  - `realFlat`, `tracing`, `layoutToggle`
  - `overlapNotice`, `resetReal`
  - `tooSmall`, `notRect`, `outsideMoved`

- [ ] **Step 1: Write the failing test** for the one pure helper this task adds to `real.js`: `planLayout(image: {w, h}): "stacked" | "side"`.
  ```js
  assert.equal(planLayout({w:1200, h:800}), "stacked");
  assert.equal(planLayout({w:785, h:768}), "stacked");
  assert.equal(planLayout({w:700, h:900}), "side");
  ```
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement the helper, the components and the PlanImport changes** listed above.
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: all pass, exit 0.
- [ ] **Step 5: Manual check (`npm run dev`):**
  - On arcmax, typing a wall length on a room asks the scale question once, and "Whole plan" moves nothing on the tracing.
  - Widening a bedroom shows orange in the real flat and dashed at the old position.
  - A corridor case opens the line dialog.
- [ ] **Step 6: Commit:** `git commit -m "Fix the plan: tracing above the real flat, scale question, room size and shared-wall dialogs"`

### Task 6: Whole flat from above

**Files:** Modify `src/studio/ui/plan/FlatScreen.tsx`, `src/studio/i18n.js`, `src/studio/studio.css`.

**Interfaces:**
- Consumes `RealFlatView` (Task 5) and `roomBox` (Task 3).
- The plan image `<svg>` is replaced by `<RealFlatView flat onPick={onOpenSpace}/>`, with status colours by class `st-todo` / `st-doing` / `st-done` on each room group.
- The list shows `w × l m`: from `roomBox` for rect rooms, otherwise the area from the real poly.
- Props stay the same. `imageUrl` is no longer needed for drawing; keep the prop so callers don't change.
- New i18n key: `flatClickRoom`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npm test` and `npx tsc --noEmit`. Expected: pass, exit 0.
- [ ] **Step 3: Manual check.** After "Start designing", the flat shows as a clean drawing without the image, and clicking a room opens it.
- [ ] **Step 4: Commit:** `git commit -m "Flat screen: the real flat from above"`

### Task 7: Inside one room

**Files:** Modify `src/studio/ui/StudioApp.tsx` (`openFlatSpace`), `src/studio/ui/StudioScreen.tsx`, `src/studio/i18n.js`, `src/studio/studio.css`.

**Interfaces:**
- `openFlatSpace` calls `setContext([])` in place of `setContext(neighbours(...))`.
- `StudioScreen` gets the optional prop `flatNav?: {flat: Flat, spaceId: string, onOpen: (id: string) => void, onFlat: () => void} | null`, passed by `StudioApp` when a flat space is open (null otherwise).
- With `flatNav`, the header shows, in place of the single `flatBtn`:
  - a "Whole flat" back button;
  - the flat › room name;
  - previous / next buttons in `flat.spaces` order, wrapping, hidden when there is only one space.
- The studio also shows a small map panel: `<RealFlatView flat highlight={spaceId} compact onPick={onOpen}/>`, about 280 × 180, placed beside the library.
- Opening another room goes through the existing `openFlatSpace`, which saves first through `redirectSaves`.
- i18n keys: `wholeFlat`, `prevRoom`, `nextRoom`, `whereYouAre`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npm test` and `npx tsc --noEmit`. Expected: pass, exit 0.
- [ ] **Step 3: Manual check:**
  - The room opens alone, with no grey neighbours in 3D.
  - Next / previous and a map click change the room, and the furniture placed in the first room is still there when you come back.
- [ ] **Step 4: Commit:** `git commit -m "Room view: the room alone, with a map of the flat and previous / next"`

### Task 8: Whole-branch check

- [ ] **Step 1:** Run `npm test` and `npx tsc --noEmit`. Expected: all pass, exit 0.
- [ ] **Step 2:** Grep for UI callers of `stretchWall`. Expected: none outside `flat.js` and the tests.
- [ ] **Step 3:** Grep `i18n.js` for each new key in both `en` and `ar`.
- [ ] **Step 4:** Push `plan-import`.
