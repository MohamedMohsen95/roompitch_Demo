- A suggestion whose bounding box is > 30 % covered by a drawn room or a better suggestion is dropped.

## Review of 3a784d7 — to fix next
1. assemble.js:134 — fits matched back by name only; two rooms with the same name both take the first one's size. Fix: fitRooms returns entry index i, use toFit[f.i].
2. readPlan.ts:73,83 + read-worker.js:17 — AI text/point calls only when quality.ok && candidates > 0, so size-fit never runs in the app on plans like east (noThickness). Fix: call them whenever hLines exist / quality fails for a reason other than noPaper.
3. assemble.js:142-147 — overlap divides by the suggestion's box only; a big fit can cover a small sure room. Fix: intersection over the smaller box (or polygon IoU).
4. assemble.js:131 — when the scale comes from the fit, step-4 size checks already ran without a scale. Fix: re-check named rooms after 4b.
Minor: after "Read again", a suggestion can inherit an old space's design; removing it loses the design.
