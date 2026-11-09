# Tracing and real flat — design

Date: 2026-11-09 · Branch: `plan-import` · Mockup: the Design canvas "RoomPitch plan and rooms mockup" (boards 1b, 2, 3)

## Why

Today a flat read from a floor plan has one geometry: `space.outline` in plan-image pixels, plus one scale
(metres per pixel). Wall lengths shown in the plan editor are `outline × scale`. When the AI read a wrong size,
or the plan has no sizes, the scale is wrong, every number is wrong, and correcting a number calls
`stretchWall` / `setWallLengthCm`, which moves corners on the image. The walls then leave the drawing (seen on
arcmax: scale ≈ 4× too small, "Wall 1 = 105 cm"; typing 140 moved the wall off the plan).

Mohamed's ask, in his words: draw the walls exactly on the floor plan, and have a second drawing under it that
changes when he changes sizes; that second drawing is the one we continue with and put the decor in. Numbers
he types correct a mistake in the plan (a wrong number, or no numbers at all); they do not redesign the flat.

## Goals

1. **The tracing never moves because of a number.** Outlines on the plan image change only when the user drags
   corners / uses the editing tools on the tracing.
2. **Scale correction in one step.** The first time the user changes a number, one question: "Is the whole plan
   off, or only this wall?" Whole plan → the scale changes by new/old, every number in every room updates,
   nothing moves. Asked once per flat.
3. **A real flat, in cm.** A second geometry, built from the tracing × scale. Corrections of a single wall or a
   room's width × length change only the real flat. It is what the room studio, the flat overview, the 3D view
   and the proposal use.
4. **Shared walls behave like one wall.** Changing a room's size moves the interior wall it shares with its
   neighbour, so the neighbour grows or shrinks; exterior walls stay. If the neighbour's size was confirmed
   before (typed or matching its written size), warn before applying.
5. **Room size first, walls second.** Each room: Width × Length fields; "Walls one by one" opens per-wall
   lengths (today's list) for the rare case.
6. **Fix-the-plan screen:** tracing on top, real flat below (stacked). Tall plans (h > w) put them side by side;
   a small toggle switches. Changes from the tracing show in the real flat in orange, with the tracing's wall
   position dashed.
7. **Whole flat from above:** after "Start designing", the flat screen shows the real flat as a clean drawing
   (no plan image): each room with name, size (m), status; click a room to go in. "Fix the plan" goes back.
8. **Inside one room:** the room alone (neighbours no longer drawn around it), a small map of the flat with the
   room highlighted (click another room to jump), "Whole flat" back button, previous / next room.

## Non-goals

- Redesigning the flat (removing walls, merging rooms, moving the exterior). Corrections only.
- Changing how plans are read (walls.js, rooms.js, assemble.js, sizefit.js stay as they are).
- New cloud schema: the flat stays one JSON document in `projects.data` (kind `flat`).

## Anti-goals (a failure even if it works)

- Any number edit that moves a line on the plan image.
- A correction that leaves overlapping rooms or a gap between two rooms that shared a wall.
- Asking the scale question more than once per flat, or asking it on a plan with no scale at all (there the
  first number simply sets the scale).

## Data model

`Flat` goes to `v: 2`. Existing fields keep their meaning (`spaces[].outline` and `openings[].a/b` are the
**tracing**, image px). New:

```ts
type Flat = { v: 2, ...v1 fields,
  scaleAsked: boolean,                 // the "whole plan or this wall?" question was answered
  real: RealFlat | null                // null = not diverged yet: derived as tracing × scale on read
};
type RealFlat = {
  spaces: {id: string, poly: Point[]}[],          // metres, flat frame (image origin × scale), clockwise
  openings: {id: string, a: Point, b: Point}[],   // metres; heightCm/sillCm stay on flat.openings
  confirmed: string[]                              // space ids whose size the user typed or confirmed
};
```

- `realOf(flat): RealFlat` — `flat.real` if set, else tracing × scale. Every consumer (spaceRoom, overview, room
  map, proposal) reads through it. `spaceRoom` builds the studio room from `realOf(flat)` instead of
  `outline × scale`.
- Scale change (the "whole plan" answer, or any later scale change): if `real` is null, nothing to do; else
  scale every real coordinate by new/old (keeps per-wall corrections).
- Tracing edit (drag a corner, add a space, fill a room, a door) while `real` exists: apply the same edit to the
  real flat (moved corner moved by the same displacement × scale; a new space added as tracing × scale; a
  removed space removed). **Builder's call** how to map a corner edit onto a real polygon whose corners moved;
  the simple rule (same corner index, same displacement) is acceptable.
- v1 flats load as v2 with `real: null, scaleAsked: false` (`validFlat` accepts both; save writes v2).
- Doors and windows changed in the room studio go to `real.openings` only (**my call**); the tracing keeps what
  was read or drawn on the plan. `writeBackOpenings` gets a real-flat version; a shared door keeps one id in
  `real.openings`, so both rooms see it.
- A tracing edit after divergence that adds or reshapes a space enters the real flat as tracing × scale
  (**my call**); if it then overlaps a real room, the real-flat view marks it and offers "Reset the real flat to
  the tracing" (drops `real`, keeps `scaleAsked`).
- `space.design` keeps local metres as today; `openSpace` already overwrites poly/openings from the flat, so a
  corrected room opens with its new walls. Furniture now outside the room: the existing "dropped pieces" hint.

## Corrections

**The question.** On the first number edit in a flat with a scale and `scaleAsked === false`: a small dialog,
"Is the whole plan's size off, or only this wall/room?" with two buttons. Either answer sets `scaleAsked`.
Cancel = no change, no flag. No scale yet → the typed number sets the scale (`scaleFromWall`), `scaleAsked = true`,
no question.

**Whole plan.** `scale *= typed / shown`; numbers everywhere update; nothing moves.

**After the question** (**my call**): either answer sets `scaleFrom = "wall"`, so `withSizeScale` no longer
recomputes the scale from written sizes and typed numbers can't drift. Every later number edit is a local
correction. The scale card keeps one control, "Rescale the whole plan…", which takes one known length and
rescales (replaces today's "the next length sets the scale" checkbox).

**Room width × length** (only this room). Width/length are the room's bounding box in the real flat. Changing
width moves one vertical side, changing length one horizontal side:
- pick the side that is an **interior** wall (has a neighbour's parallel edge across it within `WALL_TOL_M`);
  if both are interior, move the right / bottom one (**my call**) and show a small "move the other side" link;
  if both are exterior (the room spans the flat), move the right / bottom side and say the outside changed.
- moving a side moves, in the real flat, every corner of this room on that side **and** the facing corners of
  each neighbour across it (same displacement), so the shared wall moves as one and the neighbour resizes;
- **when the wall line runs on past this room** (a neighbour's facing edge is longer than this room's side, so
  other rooms also sit on that line), the user is asked **every time** (Mohamed's decision): "Move the whole
  wall" — every corner on that line moves, so every room along it changes (each listed in the dialog) — or
  "Only this room's part" — the neighbour gets two new corners at this room's ends, forming a step, and the
  rooms past it stay. Cancel = no change. The confirmed-neighbour warning goes in the same dialog, not a second
  one;
- openings on the moved wall move with it; openings on walls that stretch keep their distance from the fixed end.
- if a neighbour that would change is in `confirmed`, warn ("Living / Dining is 400 × 520, confirmed — it will
  become 360 × 520") with Apply / Cancel.
- the edited room joins `confirmed`. `confirmed` is only what is stored: rooms whose size the user typed or
  confirmed (**my call**; no automatic "matches its written size" check).
- **Width × Length only for rectangular rooms** (4 corners, right angles) (**my call**); other rooms show their
  size read-only and open "Walls one by one".

**Wall one by one.** Today's per-wall list, now on the real flat: changing wall i's length moves its end corner
(and everything past it along the wall's direction, as `setWallLengthCm` does), plus the neighbours' facing
corners as above. Same warning rule.

**Undo.** One undo step per applied correction (the plan editor's existing undo, if it has one; otherwise
**builder's call** whether a simple last-change undo is needed).

## Screens (see mockup)

- **Fix the plan** (PlanImport / PlanEditor): left panel per selected room: name, written size, Width × Length,
  "Walls one by one (n)"; the scale card says where the scale came from. Right: tracing (image + outlines,
  today's editor tools work here) above the real flat drawing (read-only view, orange = differs from tracing by
  more than 2 cm at any corner, dashed = the tracing's position). Layout: stacked when image w ≥ h, side by
  side otherwise, with a toggle.
- **Whole flat** (FlatScreen): replaces the image view with the real flat drawn as walls (thickness from
  `read.thick` × scale or 15 cm default — **builder's call**), names, sizes in m, status colours; rooms list at the
  side; click → open room. "Fix the plan" button.
- **Room** (StudioScreen when opened from a flat): `setContext([])` instead of `neighbours(...)`; header gets
  "Whole flat" back, breadcrumb, previous / next room (in the flat's space order); a small flat map panel (real
  flat, this room highlighted, click to jump; saves the current room first as it does today).

## Constraints

- Plain JS modules under `src/studio/plan/` with `.d.ts` beside them, tests with `node --test` like the rest.
- i18n: every new string in `en` and `ar` in `src/studio/i18n.js`.
- Visual language of the existing app (studio.css tokens); the mockup is a guide, not pixel spec.
- Don't merge to main without asking.

## Left to the builder

File split (e.g. `real.js` for realOf / corrections), component structure, exact dialog wording, map size,
exact colours, and the points marked "builder's call" above.
