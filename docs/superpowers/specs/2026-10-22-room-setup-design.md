# Room setup: build the room by hand or from photos

Date: 2026-10-22 · Status: draft for review · Branch: `room-setup` (based on `studio-pdf-i18n`)

## Why

Today the Room Studio always starts from the same 5 × 4 m rectangle with one door on the south wall and one window on the north wall. Real rooms have other shapes, several doors and windows, and openings in other places. A designer who visits the site, or whose client sends photos, has no way to get the real room into the studio.

The designer usually gets the room in one of two ways:

- **Site visit:** they measure the room themselves.
- **Client photos:** the client sends photos of the room.

Plans from an architect are not the usual input, so plan reading is out of scope here.

## What we are building

A new **first screen**, "New room", shown when the tool opens. The designer sets up the room there, then moves on to the existing studio (the second screen), which now uses that room.

### Screen 1: New room

Two clear choices:

1. **"I'll build the room myself"** (no photos)
2. **"I have photos of the room"**

**Path 1, build by hand**

1. Pick a shape: **rectangle** or **L-shape**.
   - Rectangle: length and width.
   - L-shape: overall length and width, plus the size of the cut-out corner and which corner it is.
2. Ceiling height.
3. The screen shows the resulting walls as a numbered list with their lengths (Wall 1, Wall 2, …), matching numbers drawn on the preview.
4. Add any number of **doors** and **windows**. For each: which wall, distance from that wall's start corner, width, height, and for windows the sill height. They can also be dragged along their wall in the preview.
5. A live 2D preview of the room updates as values change, and openings that don't fit (past the wall's end, taller than the ceiling, overlapping) are flagged and blocked.
6. **"Start designing"** opens the studio with this room.

**Path 2, from photos**

1. Upload one or more photos, ideally one per wall, each showing the whole wall.
2. Choose the shape and type the measurements, exactly as in path 1 (measurements are required in this version).
3. For each photo, the designer picks which wall it shows (a dropdown of the numbered walls, or clicking the wall in the preview).
4. **"Find doors and windows"** sends each photo to an AI vision model on Cloudflare Workers AI. It returns the doors and windows it sees, each with its position and size as fractions of the visible wall. The app converts those to metres using the wall's known length and the ceiling height.
5. The designer lands on the same form as path 1 with the openings filled in, and reviews and corrects them before "Start designing". Openings found by the AI are marked as such until the designer edits or confirms them.
6. If the AI fails or returns nothing usable, the designer gets a clear message and adds the openings by hand. The flow never dead-ends.
7. The photos are kept with the room so later work (render background, PDF) can use them. They're not used anywhere else in this version.

### Screen 2: the studio

- Works with any room from screen 1: the plan, the 3D view, wall finishes, furniture placement, the estimate, the AI render prompt and the PDF all use the real walls and openings.
- Each wall gets its own finish, as today, but walls are numbered instead of north/east/south/west.
- Furniture stays inside the room outline, including the L-shape's cut-out corner.
- Wall areas in the estimate subtract every door and window on that wall.
- A **"Room setup"** button in the top bar goes back to screen 1 to change the room. Furniture and finishes are kept. Pieces that end up outside the new outline are moved back inside.

### Opening the tool

- With no saved room, the tool opens on screen 1.
- With a saved room, screen 1 also offers **"Continue last room"**.

## Goals

- A designer on site can enter a real rectangular or L-shaped room with its doors and windows in about two minutes.
- With photos and measurements, the AI places most openings close enough that the designer only adjusts them.
- Everything already working in the studio keeps working: finishes, furniture, replace and delete, prices, estimate, PDF, render, Arabic and English.

## Non-goals (this version)

- Photos without any measurements, where the AI would estimate the room size itself.
- Scanning the room with a phone (LiDAR / RoomPlan).
- Reading floor plans.
- Free-form room shapes beyond rectangle and L-shape. The room model below should still allow them later.
- Sloped ceilings, columns, niches, and rooms with more than one level.
- Accounts or cloud saving: the room is saved in this browser only.

## Anti-goals

- The AI result must never go straight into the design unreviewed. The designer always sees it on the form first.
- Measurements the designer typed must never be changed by the AI.
- Moving to the new room model must not break existing features.

## Decisions made with Mohamed

- Two paths on a first screen (by hand / with photos), then the studio as the second screen.
- Photo analysis uses **Cloudflare Workers AI** first, to see how good it is. A stronger model (Gemini was suggested) is a later option if results are poor.
- Measurements are typed by the designer in both paths.
- Old pages stay in the repo untouched, but all work happens on the studio.

## Constraints

- Same stack as the studio: Vite, three.js, plain ES modules under `src/studio/`, no UI framework.
- AI calls go through the server (`api/`), never from the browser with a key. The existing `ACCESS_CODE` check applies.
- Cloudflare Workers AI is the provider. Candidate vision models the builder should test against real room photos: `@cf/meta/llama-4-scout-17b-16e-instruct`, `@cf/mistralai/mistral-small-3.1-24b-instruct`, `@cf/google/gemma-3-12b-it`, `@cf/meta/llama-3.2-11b-vision-instruct`. Pick by results; the model id is a setting (`CF_VISION_MODEL`).
- Every new piece of text exists in English and Arabic (`i18n.js`), and screen 1 works right-to-left.
- Works on a tablet (touch) as well as a laptop, since screen 1 is meant for site visits.

## Room model (my call, for the builder to refine)

- Units are metres. The room is a closed polygon of corner points in plan, listed in one direction. Wall *i* runs from corner *i* to corner *i+1*.
- `S.walls` becomes an array of `{finish}` indexed like the walls, replacing `{n, e, s, w}`.
- Openings: `{id, type: "door" | "window", wall, offset, width, height, sill}`, where `offset` is the distance from the wall's start corner to the opening's near edge, and `sill` is 0 for doors.
- Rectangle and L-shape are generators that produce the polygon from the form values. The studio only ever reads the polygon.

## Saving (my call)

- The room and the design are saved in this browser so a reload doesn't lose them.
- Photos go in IndexedDB (they're too big for localStorage). The rest goes in localStorage.

## Smaller calls I made (check while reading)

- A brand-new room starts empty: no furniture, plain white paint on the walls and oak parquet on the floor. "Continue last room" keeps everything.
- Measurements are typed in metres with up to two decimals, in both languages.
- Up to 8 photos per room. Each photo is tagged with one wall; if it shows a corner with two walls, the AI only reports openings on the tagged wall, and the screen tells the designer one wall per photo works best.
- Doors are drawn swinging into the room.

## Left to the builder

- Exact screen 1 layout and how the shape and opening controls look.
- The prompt and JSON shape asked from the vision model, how photos are resized before sending, and how a reply that isn't valid JSON is handled.
- How the 3D walls show openings (cut holes, or panels in front, as now).
- How the render prompt describes numbered walls so the AI understands them.
- How the plan labels wall numbers and dimensions without clutter.
- Module layout for the new code.

## How we'll know it works

- Build a rectangle with 2 doors and 2 windows, and an L-shaped room, by hand. Check that the plan, 3D view, estimate wall areas and PDF all match.
- Run the photo path on at least three real room photos and note, per opening, whether the AI found it and how far off its position was. This tells us whether Cloudflare is good enough or we need Gemini.
- Switch to Arabic and repeat a pass on screen 1.
- Reload the page and confirm the room and design come back.
