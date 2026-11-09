# Drawing and erasing walls on the plan — design

Date: 2026-11-09 · Branch: `plan-import` · Builds on: `2026-11-09-tracing-and-real-flat-design.md`

## Why

On real plans the wall reading is sometimes wrong in two ways Mohamed hits:

1. A room outline crosses a place where there is **no wall** (ex4: the dashed orange line between M BATH and
   the hall). Today every outline edge is a wall, so in 3D that open side becomes a solid wall.
2. A wall the program **did not see**, so a room doesn't close and "Fill room" fails or spills into the next
   room. He wants to draw that wall himself, not always to the end: he may leave a gap between it and the next
   wall, and that gap is an opening.

His words: drawing and erasing tools next to "New space": draw a wall that isn't complete (one line), draw a
room, erase part of a wall.

## Goals

1. **Draw wall** tool: a straight line from point to point on the tracing. It counts as a wall drawn in the image:
   "Fill room", "Read again" and the gap finder all see it.
2. **Erase** tool: drag along part of a wall (from the image or one he drew); it counts as no wall there.
3. **Draw room** stays as today ("New space": click corners).
4. **Open parts ("opening" type `open`):** a part of a room's outline with no wall behind it is an opening of a
   new type `open` — no door, no frame, floor to ceiling. Shown dashed on the tracing and the real flat; in 3D,
   simply no wall there.
   - Erasing across a room's edge marks that part of the edge `open` (the outline itself does not change, so
     the room keeps its size).
   - A gap left between a drawn wall and the next wall, when a room is filled across it, becomes `open`.
   - Drawing a wall over an `open` part removes that part of it.
   - An `open` part can be selected, resized (drag its ends) and removed like a door or window.
5. The drawn walls and erased parts are saved with the flat and applied again on "Edit plan" / "Read again".

## Non-goals

- The program finding open parts by itself from the image (beyond what follows from his edits).
- Free-standing walls inside a room in 3D (a short partition). A drawn wall only shapes rooms.
- Curved walls.

## Anti-goals

- An erase or a drawn wall that moves or resizes a room outline by itself.
- A drawn wall lost when the plan is read again.
- `open` parts that show a door, a frame or a wall in 3D, or that are priced as a door in the estimate.

## Data

- `Flat.edits?: {id: string, kind: "wall" | "erase", a: Point, b: Point}[]` — image px, in drawing order.
- `PlanOpening.type` gains `"open"` and `fromEdit?: boolean` (tracing); the real flat's openings follow by id as today.
  `heightCm` = the flat's ceiling, `sillCm` = 0.
- Studio `Opening.type` gains `"open"`: `height = H`, `sill = 0`.

## How the edits reach the wall reading

**My call:** edits are applied to the wall masks **after** `readWalls`' filters (not painted into the image), so a
drawn wall always counts — diagonal or short — and an erase always removes. In order, per edit:
- `wall`: the line, `thick` wide, is OR-ed into `walls`, `closed` and the footprint's outer mask; a gap between
  either end of it and the nearest wall straight ahead (along the line) of up to 1.5 m (or `doorLen` px with no
  scale) is closed in `closed` and recorded as a bridge marked `drawn: true`.
- `erase`: a band 1.6 × `thick` wide is cleared from `walls` (so no wall is drawn there). What it does to the
  room boundary (`closed`) is in the open question below.
- Then the room candidates are computed again. New worker message `{type: "edit", gen, edits}` re-applies all
  edits to the stored first reading and recomputes the candidates; it returns `{quality, thick, candidates}` like
  `read`. Called after each edit (on mouse-up). `readPlan` takes the edits too, so "Read again" and "Edit plan"
  see them.

## Open parts

**My call:** open parts that come from edits are **worked out again** every time the edits or the spaces change,
not stored as history. Each such opening carries `fromEdit: true`; one the user resized or added by hand is an
ordinary `open` (`fromEdit: false`) and is kept.
- Rules, run over the current spaces after every edit, fill, "Read again" and on "Edit plan":
  - every space edge an `erase` stroke runs along (parallel within 10°, within 1.5 × `thick` px) gets an `open`
    over the stroke's projection onto the edge (touching or overlapping ones merged);
  - every `drawn: true` bridge lying on a space edge becomes an `open` there;
  - an `open` (of any kind) covered by a `wall` edit loses the covered part (split in two if needed).
- So removing a drawn wall or an erase and re-reading removes the open parts it caused; "Read again" gets them
  back instead of turning those gaps into doors or windows (`assemble` skips bridges marked `drawn` and bridges
  under an erase).
- In the real flat and the studio, `open` behaves like any opening: moves with its wall, belongs to both rooms
  when on a shared wall.

## Screens

- Plan editor tools: Select · Fill room · **Draw room** (today's "New space", renamed) · **Draw wall** ·
  **Erase** · Door · Window. Hints under the toolbar as today, one line each.
- Drawn walls show as a solid line in the accent colour over the image; erased parts as a light hatched band;
  both selectable with Select and removable (Delete key or a Remove button), which re-reads.
- `open` openings: dashed segment in the tracing and the real flat; listed with doors and windows as "Opening".
- 3D: an `open` opening cuts the wall over its full height with no lining, casing, leaf or glass.
- Estimate / proposal / render prompt: `open` adds no door or window line; the render text calls it
  "open to the next space".

## Constraints

- Same as the tracing/real-flat spec: tests with `node --test`, `.d.ts` beside JS, `en` + `ar` strings, studio.css
  tokens, no merge to main without asking.

## Left to the builder

Exact hatch look, snapping the drawn wall to horizontal/vertical (Shift turns it off, as for corners — my call),
cursor shapes, and how the eraser's band width shows while dragging.
