# Reading floor plans from their walls — design

Date: 2026-11-08 · Branch: `plan-import` (builds on the plan import in `2026-10-29-plan-import-design.md`)

## Why

The first version asks one vision model (Llama 4 Scout on Cloudflare) to draw every space's outline as fractions of the image. On real plans the names come back right but the outlines don't. They overlap, sit off the walls and cover two rooms at once, and the written sizes are missed. In Mohamed's test the model found 5 spaces, drew every outline wrong, and reported "No sizes could be read" on a plan that has room areas and dimension chains. Vision models of this kind are good at reading and naming, and bad at placing things to the pixel. Correcting their outlines takes the designer longer than tracing from scratch.

A throwaway experiment ran on four of Mohamed's plans: no AI, walls read with plain image processing, and one hand-placed seed point per room, split with a watershed. The code is at `assets/2026-11-08-wall-reading-spike.py` and the results at `assets/2026-11-08-wall-reading-spike.png`. What it showed:

**Where it worked:**
- The walls of clean, dark-walled plans are found well.
- Rooms fully closed by walls and doors come out on the inside faces of their walls:
  - Arcmax plan: the two left bedrooms, both toilets and the study.
  - RoomSketcher-style plan, the one the AI got wrong: bathroom, bedroom and living room.
  - Black-and-white plan: the baths and the walk-in closet.

**Where it failed:**
- The watershed split is the weak step. Where two areas are joined by a wide opening, it cuts them along an arbitrary slanted line:
  - Arcmax: living/dining took in the right bedroom, the hall and the kitchen as one blob.
  - Black-and-white plan: the master bedroom merged into living/kitchen.
- The small, low-contrast plan with thin coloured walls (the "Den / Patio" plan) has no walls found at all.
- Terraces and balconies with no walls around them are not found.
- A dark rug and bold text can be taken for walls.

An independent review (a different model) re-ran the experiment on altered copies of the plans:
- **Rotated 3°:** most rooms are lost.
- **Noise, blur and heavy JPEG** (scan-like): about half the rooms are lost on the thin-walled plan.
- **Low resolution:** survivable.

## What we're building

The AI stops drawing outlines. The program finds the walls in the image itself. It closes the doors and windows in them as short lines, and each enclosed area becomes a room candidate, so outlines sit on the walls. The AI does only what it is good at: reading room names and written sizes, and pointing at where each name is written.

When the program isn't sure about a room, it leaves it out instead of drawing something wrong, and the designer draws it with the tools. In Mohamed's words: leave it empty and give me the tools to build it.

Walls being right matters most. Doors and windows matter too, but come second.

Plans can be anything: exported from software, scanned, a phone photo of a printout, or hand-drawn. The automatic part is expected to work on clean ones. On the rest, the designer gets an empty or partial result and builds it with the tools, which must be good.

## Goals

### 1. Straighten, then find the walls

**Straighten first.** Estimate the dominant wall angle and rotate the image so the walls are horizontal and vertical. Outlines are mapped back to the original image afterwards.

**Find the walls.** Walls are pixels that:
- contrast with the background, measured by colour distance from the paper colour, not by grey level alone;
- are line-like;
- are thicker than furniture and text lines.

Estimate the wall thickness.

**Not walls.** These are removed by stated rules (the thresholds are the builder's), not left to chance:
- filled dark blobs, such as a rug or a bedspread;
- text;
- dimension lines and grid bars outside the walls.

**Hatched walls count as walls.**

**Furniture is never drawn.** Furniture, fixtures and any lines inside rooms never become walls, spaces or openings, and nothing from the image is placed as furniture in the studio. An area enclosed by furniture lines (a bed, a counter, a wardrobe) is not a room candidate.

**Quality gate.** If the image doesn't look like a clean plan, skip automatic rooms and go straight to the tools. Signs of an unclean plan:
- no consistent wall thickness;
- no dominant angle;
- too little wall found.

### 2. Rooms as enclosed areas

**Doors and windows close as lines.** Bridge each gap in a wall along that wall's own line, never across a room. Each bridge is kept as an opening candidate: a segment with its width.

**The flat's footprint.** The footprint is what is inside the outer walls. Long glass runs on the outside are bridged for this step only.

**Room candidates.** A room candidate is a connected free area inside the footprint. There is no watershed and no splitting by shape.

**Clean outlines.** Turn each candidate into a clean outline:
- corners snapped to the dominant directions and their 45°;
- collinear corners merged;
- tiny steps removed.

### 3. The AI reads and points

**One text-reading call.** The plan model (`CF_PLAN_MODEL`, falling back to `CF_VISION_MODEL`) reads:
- the room names;
- any written room sizes ("12'-0" x 14'-6"");
- any written areas ("64 sq ft", "12 m²").

**Pointing.** For each distinct name, **Moondream 3.1** on Workers AI (`@cf/moondream/moondream3.1-9B-A2B`, `point` task) returns where it is written. A name that occurs several times returns every occurrence. Moondream gets its own model setting.

**Optional check: Moondream `detect` boxes.** The builder tries them on the test plans. Keep them only if they catch wrong candidates (goal 4) without much cost.

**Dimension chains are not used in this version.**

### 4. Naming candidates, and only confident rooms shown

**Placing the points.** Each pointed name falls into one candidate. A point that lands on a wall or text moves to the nearest free candidate. A point outside the footprint is unplaced.

**How a candidate is named:**
- **Exactly one name:** that name.
- **Several names:** an open area. It becomes one space with the names joined ("Living / Dining / Kitchen"), as decided in the first design. This happens only if the candidate also passes the checks below. Otherwise it is left out, because two rooms merged through an unclosed door look the same.
- **No name:** drawn too (Mohamed: plans often have no labels, and leaving those rooms out would be a flaw), under the same checks plus two more:
  - it is room-sized, not a closet, shaft or the gap between two walls (larger than about 2 m² once the scale is known, or the same share of the flat before);
  - it has at least one bridge (door or opening) to another candidate.

  It gets a temporary name ("Space 1"), is marked "found without a name", and the designer names it: type a name or pick one from `unplaced`. Enclosed areas that fail these checks are not drawn, but click-to-fill adds them on request.

**A candidate is drawn only if all of these hold:**
- it doesn't reach the outside;
- its area is plausible (larger than about 1 m² once the scale is known, and not most of the flat unless it is the only room);
- it is compact, with area ÷ convex-hull area above about 0.6, so slanted blobs and leaks fail;
- its outline has no problem (`outlineProblem`);
- its area agrees with its written size or area, within a tolerance, once the scale is known;
- it agrees with its `detect` box, if goal 3's check is kept.

**Names not drawn.** Names found on the plan but not drawn are kept in the flat as `unplaced: [{name, sizeText}]`, saved with it. When the designer draws a space (click-to-fill or tracing), they can pick one of these names. The name and its written size then attach to the new space and leave the list.

### 5. Scale without asking, when possible

Candidates are written room sizes (as now) and written areas (scale = √(m² ÷ px²) of the room's candidate). The scale is taken only from **at least two rooms that agree within about 10 %**, with outliers flagged, as `scaleFromSizes` already does. A single room is not enough. Otherwise, ask for one wall length, as now.

The order matters. The scale comes first, from the rooms that agree. Only then is goal 4's size check applied, so a bad scale can't reject good rooms.

### 6. Doors and windows from the bridges

Every bridge from goal 2 is an opening candidate with its exact width:
- **Between two candidates:** a door.
- **On the outside wall:** a window.

Door swing arcs are not detected in this version. A door to the outside will therefore show as a window, and the designer fixes its type.

Bridged openings are marked as found automatically, like the AI ones now, and the designer confirms or deletes them. Only openings on the walls of drawn spaces are created.

### 7. Tools for the designer

These work whatever the AI did, and with the AI off.

**Click to fill:** in a new tool, a click inside an enclosed area adds it as a space. If the area fails the reach-the-outside, plausibility or compactness checks, nothing is added. A short message says to draw it by hand.

**Door and window on a gap:** with the door or window tool, clicking on or next to a bridged gap places the opening exactly across it. Dragging along a wall, as now, still works where there is no gap.

**Existing tools stay:** tracing a space, dragging corners, adding and removing corners, typing wall lengths, and editing names and sizes.

**With the AI off or out of allowance:** rooms are still drawn from the walls, all unnamed (with temporary names), and the walls, the gaps and the tools all work.

## Non-goals

- AutoCAD files (DWG/DXF), as before.
- Finding terraces and balconies with no walls. The designer draws them.
- Making hand-drawn plans, photos with perspective, or very faint plans work automatically. They must not produce wrong rooms; they may produce none.
- Changing AI provider. Cloudflare stays, and models can be swapped later and compared.
- Reading dimension chains for scale.
- Detecting door swing arcs.
- Furniture recognition.
- A learned segmentation model (the best long-term route, but it needs a server runtime).

## Anti-goals (a failure even if it "works")

- Showing an outline that is clearly wrong, such as one covering two rooms, cutting across a room, or sitting off the walls. An empty space is better than a wrong one.
- Making the designer wait. Reading the walls must not freeze the page.
- Spending the free daily AI allowance faster than needed. One text-reading call per plan, plus one Moondream point call per distinct name (and `detect` only if kept). Estimate: about 400–600 neurons for an 8-room plan.

## Constraints

- Everything from the first plan-import design still holds:
  - cm in the interface;
  - the flat model in plan pixels;
  - one ceiling height;
  - English and Arabic, RTL and touch;
  - the flat → space → studio flow.
- Free Cloudflare tier for now: 10,000 neurons per day, shared with the renders.
- No new server runtime; Vercel functions are Node. The image processing runs in the browser (in a worker), so it costs nothing per plan.
- The build agent's environment has no npm registry access. Pure JS modules tested with `node --test` are preferred over large dependencies. OpenCV.js is left to the builder's judgement, weighed against its download size.

## Decided

- The AI no longer outlines spaces. Outlines come only from walls plus names, or from the designer.
- Uncertain rooms are left empty, never shown as guesses.
- An enclosed area holding several names is one space with joined names, if it passes the checks.
- An enclosed area with no name is drawn too, if it passes the stricter checks, with a temporary name the designer can change.
- Nothing in the image is ever drawn as furniture or as walls made from furniture.
- Moondream 3.1 for pointing; it is on the free allocation.
- Reading sizes keeps `units.js` and `scaleFromSizes`, extended with areas and the two-room rule.

## Left to the builder

- The exact image-processing steps and thresholds, and pure JS vs OpenCV.js. The experiment is a starting point, not a spec, and its watershed step is replaced.
- The exact confidence thresholds, within the rules above.
- How repeated names are matched to candidates, beyond one name per point.
- How the old AI-outline path is retired: deleted, or kept behind a setting.
- Whether the AI calls are made from the browser (two calls) or chained on the server, within the 60 s function limit.
- The order of work. Suggested: first the wall reading and candidates as pure modules against the fixtures (with the experiment's seed points), then the AI calls, then the tools.

## How we'll know it works

The fixtures in `tests/fixtures/plans/` are:
- the four plans;
- rotated (3°) and scan-like (noise, blur, JPEG) copies of each;
- the experiment's seed points, to use in place of the AI.

Required on every fixture: **no wrong outline is drawn.** Every drawn space is on its walls and covers one room or one open area. Pure-module tests check this against hand-marked reference outlines (within a few px).

Targets (missing ones are acceptable but counted):
- Unnamed rooms on a copy of each plan with its labels erased come out as on the original, with temporary names.
- No space's outline follows furniture.
- **Arcmax plan:** 3 bedrooms, 2 toilets and the study drawn. Living/dining/kitchen either drawn as one open area or left empty.
- **RoomSketcher-style plan:** bathroom, bedroom, living room and hall drawn. Terrace left empty. Scale found from the written areas.
- **Black-and-white plan:** bedrooms, baths, walk-in closet and living/kitchen drawn.
- **Rotated copies:** the same rooms as the originals.
- **Faint "Den / Patio" plan:** the quality gate sends it to the tools, or nothing wrong is drawn. Click-to-fill doesn't produce wrong rooms. Every space can be built with the tools.

Also:
- Doors between drawn rooms appear across their gaps.
- The page stays responsive while a 2,500-px plan is read.
- Moondream's pointing is checked on all four plans with Mohamed's keys before the AI step is wired into the flow.

## Addendum (2026-11-08, after Mohamed's first test): suggestions and written sizes

On plans whose walls are mostly drawn as two thin lines (the black-and-white plan), the walls merge into one
area and nothing was drawn. Mohamed's verdict was that empty is not acceptable. Two changes, approved by
him in chat:

1. **Rooms from their written sizes.** When a name has a written size ("11'-0" X 12'-6"") and a point,
   the program looks for a rectangle of that size around the point whose four edges run along lines in
   the image. The lines may be thin, hollow or solid. Without a scale, it tries a range of scales and
   keeps the one that fits the most rooms best, and that scale becomes the flat's scale when at least two
   rooms fit well.
2. **Suggestions instead of empty.**
   - Rooms the program is not sure of are shown as suggested spaces: dashed, in another colour, with
     "Confirm" and "Remove". This covers size-fitted rectangles, and named wall areas that failed only
     the soft checks (shape, size agreement, a border that isn't a wall or a neck).
   - "Start designing" waits until every suggestion is confirmed or removed.
   - Rooms the program is sure of are drawn as before.
   - Clearly wrong areas are never suggested: two private rooms merged, an area reaching outside, or
     most of the flat.

The anti-goal stands: nothing unconfirmed and wrong becomes part of the design. A suggestion is visibly
not final until the designer confirms it.
