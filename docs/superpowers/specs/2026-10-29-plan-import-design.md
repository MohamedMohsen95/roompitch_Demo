# Plan import: start a room or a whole flat from a 2D floor plan

Date: 2026-10-29 · Status: draft for review · Branch: `plan-import` (from `main` 9f3db11)

## Why

Designers are often handed a floor plan: a marketing plan, an architect's PDF, an AutoCAD export. Today they must re-type every room by hand on the "New room" screen. Mohamed's three examples (in the conversation, 2026-10-29) show what real plans look like:

- They are **whole flats**, not single rooms.
- Sizes are written **per room** ("12'-0" X 29'-10"", "13' x 16'"), usually in **feet and inches**. One example has **no sizes at all**.
- Living, dining and kitchen are often **one open space** with no wall between them.
- Rooms are often **not rectangles or L-shapes**: cut corners, closets set into walls.
- Furniture, fixtures, logos and title blocks are drawn on top.

## What we are building

A third choice on "New room": **"I have a floor plan"**.

### 1. Upload
- An image (JPG, PNG, WebP…) or a PDF. A PDF with several pages asks which page.
- The page is shown large, so everything after happens on top of the plan itself.

### 2. Reading (AI first pass)
- The plan image goes to an AI vision model on **Cloudflare Workers AI** (the same keys as today). It returns, as best it can:
  - **spaces**: an outline per space and its name if written; open areas (living + dining + kitchen) come back as **one space**;
  - **doors and windows**: where they sit;
  - **written sizes** and which space they belong to.
- Feet-and-inches, metres and centimetres are all understood and converted to **centimetres**.
- Furniture, fixtures and text that isn't a size are ignored.
- The model is swappable later (Mohamed will compare Cloudflare and Gemini once the feature works). Nothing outside the server call depends on which model is used.

### 3. Review on top of the plan
The AI's result is drawn over the plan, and the designer fixes it:
- drag a corner; add or remove a corner on a wall; draw a new space by clicking its corners; delete a space;
- add, move, resize or delete a door or window;
- rename a space;
- see every wall length in cm and type a new one.

Walls snap to horizontal/vertical (and 45°) so traced outlines come out square. If the AI fails or finds nothing, the designer gets an empty plan to trace by hand. The flow never dead-ends.

### 4. Scale
- If sizes are written, the app uses them to work out the plan's scale (cm per pixel), and shows the result per space so wrong readings stand out.
- If no size is written, the app asks the designer to pick one wall and type its length; everything else follows from that.
- Every length stays editable either way.

### 5. Ceiling height
One height for the whole flat (default 280 cm), editable.

### 6. One room or a flat
- **One space:** "Start designing" goes straight to the studio, as today.
- **Several spaces:** the **flat screen** opens.

### 7. The flat screen
- The plan with each space outlined and named, and its status: **not started**, **in progress** (has a design), **done** (the designer marks it).
- Click a space to design it in the studio. A **"Flat"** button in the studio comes back here.
- Every space is its own design (finishes, furniture, estimate, renders, PDF) inside **one project**.

### 8. Neighbouring spaces in 3D
While designing one space, the spaces around it appear in the 3D view as **context**: their walls and floor in a plain grey, seen through doors and openings, not selectable or editable, not in the estimate or PDF.

## Goals
- From one of Mohamed's example plans to designing the living space in a few minutes, mostly by correcting rather than drawing.
- Sizes in the studio match the plan's written sizes to within a few cm after review.
- A flat stays one project: the designer moves between its spaces without losing work.

## Non-goals (this version)
- Reading AutoCAD files directly (DWG/DXF). They are exported to PDF or an image first.
- Reading per-wall dimension lines on technical drawings. Only written room sizes and one typed length are used for scale.
- Curved walls, columns, sloped ceilings, more than one floor, different ceiling heights per space.
- Bringing the plan's drawn furniture into the design.
- Designing the whole flat at once in one 3D view.
- A combined estimate or PDF for the whole flat.

## Anti-goals
- The AI result never reaches the studio without the designer seeing it on the plan first.
- Lengths the designer typed are never changed by the AI.
- Existing single-room projects and the manual and photo paths keep working unchanged.

## Decisions made with Mohamed
- Plan import is a third option on "New room", next to "build it myself" and "I have photos".
- Accept images and PDFs (including AutoCAD exports).
- Sizes may be missing: ask for them; when they are read, the designer can still change them.
- A whole flat is split into spaces under one project; the designer picks a space and designs it on its own.
- Connection between spaces matters: open areas are one design space; closed rooms are separate designs with their neighbours shown as context in 3D. (Proposed by Claude, agreed by Mohamed.)
- The designer reviews and corrects the AI's reading on top of the plan.
- Cloudflare Workers AI for now; compare models later.
- Ignore drawn furniture; feet and inches convert to cm.

## Constraints
- The current stack: React + TypeScript UI (`src/studio/ui/`), plain JS room logic (`src/studio/*.js`) with Node tests, three.js, Vite, Supabase, Vercel functions in `api/`.
- AI calls go through `api/` with the existing `ACCESS_CODE` rule; the model id is a setting (`CF_PLAN_MODEL`, falling back to `CF_VISION_MODEL`).
- Every new string in English and Arabic; screens work right-to-left.
- Works on a laptop and a tablet (touch for dragging corners).
- **Supabase is shared and live.** Any schema change (for example allowing a new project kind) is a migration that changes the live database: it must be agreed with AlioSayed and pushed by whoever owns migrations.

## How it fits the current code (my calls, for the builder to refine)
- **Rooms of any shape.** `geometry.js` already works on any outline (walls, areas, fitting furniture, openings); only the "New room" form is limited to rectangle and L. A space from a plan is a free outline; its form keeps `shape: "plan"` and the outline itself.
- **One coordinate system for the flat.** Space outlines and openings are stored in flat coordinates (metres from the plan's top-left). When a space opens in the studio it is shifted so its own bounding box starts at 0, as the studio expects, and shifted back on save.
- **Openings belong to the flat, not to a space.** A door between the bedroom and the hall is stored once as a segment; each space gets the openings that lie on its own walls. Moving it in one space moves it for both.
- **Project data.** A flat is one row in `projects` with a new kind `"flat"`; its `data` holds the plan image path, the scale, the ceiling height, the spaces (name, outline, status, and the space's studio design in the same shape room-store saves today) and the openings. The plan image goes in Supabase storage under the project, like photos. Without Supabase the flat is kept in the browser like rooms are today.
- **PDF pages** are turned into images in the browser (pdf.js), so the server only ever sees an image.
- **Snapping**: 90° and 45°, and corners snap to nearby corners of other spaces so shared walls line up.

## Left to the builder
- The prompt and JSON shape asked of the vision model, image size sent, and how a poor or partial answer is merged with what the designer has already traced.
- How sizes like "10'-6" X 7'-11"" are matched to a space and turned into one scale (median over spaces, flag outliers).
- Exact editing gestures on the plan, and how corners are added/removed on touch screens.
- How neighbouring spaces are drawn in 3D and how far around the current space to include them.
- How the "done" status is set and shown.
- Module layout.

## How we'll know it works
- Each of Mohamed's three example plans: upload → reviewed flat in a few minutes. Record per plan what the AI got right (spaces, openings, sizes) and what had to be fixed. This also tells us when to try another model.
- The example with no sizes: scale from one typed wall gives other rooms within a few percent of the real sizes shown on the other two plans' style.
- Living/kitchen open space comes out as one design space; a bedroom shows the hall through its door in 3D.
- Moving between three spaces, reloading, and reopening the project keeps each space's design.
- Arabic pass on the new screens; tablet pass on corner dragging.
