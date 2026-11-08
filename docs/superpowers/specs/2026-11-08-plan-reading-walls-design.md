# Reading floor plans from their walls — design

Date: 2026-11-08 · Branch: `plan-import` (builds on the plan import in `2026-10-29-plan-import-design.md`)

## Why

The first version asks one vision model (Llama 4 Scout on Cloudflare) to draw every space's outline as fractions of the image. On real plans the names come back right but the outlines don't: they overlap, sit off the walls, cover two rooms at once, and the written sizes are missed (Mohamed's test: 5 spaces found, all outlines wrong, "No sizes could be read" on a plan that has room areas and dimension chains). Vision models of this kind are good at reading and naming, bad at placing things to the pixel. Correcting their outlines takes the designer longer than tracing from scratch.

A throwaway experiment (no AI; walls read with plain image processing; one seed point per room) on four of Mohamed's plans showed:

- On clean plans with dark walls, rooms come out on the inside faces of the walls, split at the doors: 3 bedrooms, 2 toilets and the study on the Arcmax plan; bathroom, bedroom, living room and hall on the RoomSketcher-style plan that the AI had got wrong; most rooms on the black-and-white plan.
- It fails on a small, low-contrast plan with thin coloured walls (the "Den / Patio" plan): the walls aren't found at all.
- Terraces and balconies with no walls around them are not found.
- A dark rug and bold text can be taken for walls.

## What we're building

The AI stops drawing outlines. The program finds the walls in the image itself and fills each room from a point inside it, so outlines sit on the walls. The AI only does what it is good at: reading the room names and the written sizes, and pointing at where each name is written.

When the program isn't sure about a room it leaves it out (empty) instead of drawing something wrong, and the designer draws it with the tools. Mohamed's words: leave it empty and give me the tools to build it.

Walls being right matters most. Doors and windows matter too, but come second.

Plans can be anything: exported from software, scanned, a phone photo of a printout, hand-drawn. The automatic part is expected to work on the clean ones; on the rest the designer gets an empty or partial result and builds it with the tools, which must be good.

## Goals

1. **Walls from the image.** Find wall pixels (dark, line-like, thicker than furniture and text lines), estimate the wall thickness, and bridge door and window gaps along each wall's own line, never across a room. Find the flat's footprint (inside vs outside), bridging long glass runs on the outside.
2. **Rooms from points.** From one seed point per room, split the inside of the flat into rooms between the walls, with boundaries at the narrow necks (doors). Turn each region into a clean outline: corners snapped to 0°, 45° and 90°, collinear corners merged, tiny steps removed.
3. **AI reads and points.** The AI reads the room names, any written room sizes ("12'-0" x 14'-6""), any written areas ("64 sq ft", "12 m²") and, where the model allows, the dimension chains. **Moondream 3.1** on Workers AI (`@cf/moondream/moondream3.1-9B-A2B`, its `point` task) gives the position of each name in the image. Those positions are the seed points. The model for reading text is the existing plan model setting (`CF_PLAN_MODEL`, falling back to `CF_VISION_MODEL`); Moondream gets its own setting.
4. **Only confident rooms are shown.** A room is left out (with its name kept in a list "found on the plan but not drawn") when:
   - its region reaches the outside;
   - it is implausibly small or large;
   - its area disagrees clearly with its written size or area once the scale is known;
   - its outline has a problem (`outlineProblem`).
5. **Scale without asking, when possible.** Use written room sizes (already done), and also written areas: area in m² ÷ region area in px² gives a scale. If nothing can be read, ask for one wall length, as now.
6. **Doors and windows from the wall gaps.** The gaps that were bridged in goal 1 are opening candidates, with their exact width. A gap between two rooms is a door. A gap in the outside wall is a window, except where the program sees a door swing arc. Openings found this way are marked as found automatically, as AI ones are now.
7. **Tools for the designer.** These work whatever the AI did:
   - **Click to fill:** in a new tool, a click inside a room fills it from the walls. When the fill reaches the outside or is unreasonably large, nothing is added and a short message says to draw it by hand.
   - **Door and window on a gap:** with the door or window tool, clicking on or next to a gap in a wall places the opening exactly across that gap. Dragging along a wall, as now, still works where there is no gap.
   - **Existing tools stay:** tracing a space, dragging, adding and removing corners, typing wall lengths, and editing names and sizes.

## Non-goals

- AutoCAD files (DWG/DXF), as before.
- Finding terraces and balconies with no walls. The designer draws them.
- Making hand-drawn plans and photos of printouts work automatically. They must not produce wrong rooms; they may produce none.
- Changing AI provider. Cloudflare stays; models can be swapped later and compared.
- Furniture recognition.

## Anti-goals (a failure even if it "works")

- Showing an outline that is clearly wrong, for example covering two rooms or sitting off the walls. An empty space is better than a wrong one.
- Making the designer wait: the wall reading must not freeze the page.
- Spending the free daily AI allowance faster than needed. One text-reading call per plan, plus Moondream point calls (one per distinct name). Estimate: about 400–600 neurons for an 8-room plan.

## Constraints

- Everything from the first plan-import design still holds: cm in the interface, the flat model in plan pixels, one ceiling height, English and Arabic, RTL and touch, and the flat/space/studio flow.
- Free Cloudflare tier for now: 10,000 neurons per day, shared with the renders.
- No new server runtime. Vercel functions are Node. The image processing runs in the browser (in a worker), so it costs nothing per plan.
- No npm registry access from the build agent's environment. Pure JS modules tested with `node --test` are preferred to large dependencies. OpenCV.js was considered and is left to the builder's judgment against its download size.

## Decided

- The AI no longer outlines spaces; outlines come only from walls plus points, or from the designer.
- Uncertain rooms are left empty, never shown as guesses.
- Moondream 3.1 for pointing; it is on the free allocation.
- Plans and sizes: the reading from the first version (`units.js`, `scaleFromSizes`) is kept and extended with areas.
- Test plans: the four plans from the experiment go into `tests/fixtures/plans/`, along with the experiment's seed points as reference.

## Left to the builder

- The exact image-processing steps and thresholds (the experiment, `docs/superpowers/specs/assets/2026-11-08-wall-reading-spike.py`, with its results in `…-spike.png`, is a starting point, not a spec), and whether it runs as pure JS or OpenCV.js.
- How to tell the dark rug or a bold text block from a wall.
- The exact confidence thresholds.
- How names that occur several times ("BEDROOM" ×3) are matched to points. Moondream returns every match for a phrase.
- How the old AI-outline path is retired (deleted or kept behind a setting).

## How we'll know it works

On the four test plans, with the AI's names and points (or the experiment's points when the AI is off):

- **Arcmax plan:** 3 bedrooms, 2 toilets and the study drawn on their walls. Living/dining is either drawn correctly or left empty, never cut by the rug.
- **RoomSketcher-style plan:** bathroom, bedroom, living room and hall drawn; terrace left empty; scale found from the written areas.
- **Black-and-white plan:** the bedrooms, baths, walk-in closet and living/kitchen drawn, or individually left empty; none wrong.
- **Faint "Den / Patio" plan:** nothing wrong drawn. Click to fill doesn't produce wrong rooms. Every space can be built with the tools.
- Doors between drawn rooms appear across their gaps.
- The page stays responsive while reading a 2,500-px plan.
