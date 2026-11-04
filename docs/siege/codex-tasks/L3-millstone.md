# Codex task L3 — the hoisted millstone must read

Planned and validated by Claude; implemented by Codex. Small render fix in `src/siege/render/`. See
`?siege-map&scene=preparations` and `.artifacts/siege/screens/render-preparations-150.png`.

## Problem

A hoisted millstone is the player's warning not to ram, and it cannot be seen. On the gate top, the crane is hidden behind the
tower, and the stone is a white disc behind the unit standing there. Meanwhile an unhoisted stone is a bright white dome on the
walkway, which reads as nothing in particular.

## Fix

1. **Hoisted**: the crane's arm reaches out over the parapet, and the stone hangs from its pulley in front of the wall face (or the gate
   tower's front), clear of any unit on that cell. Draw crane and stone in front of the unit and the tower's slices, so they are never
   hidden, and add a short drawn rope from the pulley to the stone. S4-07's stone is painted flat from above. It may be drawn as it is.
   Check it on both a gate-top cell and a plain wall cell over a gate approach, since rule §5.7 allows both.
2. **Unhoisted**: draw nothing. A dropped stone is gone, and hoisting again costs an action, so the state needs no marker.
3. Keep the preview scene showing the hoisted case on both kinds of cell, and update its caption. Drop the unhoisted sample.

## Constraints

No rule, AI or art changes (another job is revising `src/siege/rules` and `src/siege/ai`). No `git commit`. Depth ordering stays consistent
at all three zoom levels, and selection of the unit on that cell still works: the crane and stone must not take its clicks.

## Checks to run and report

`npx vitest run tests/siege/renderV02.test.ts tests/siege/mapPieces.test.ts`, `npx tsc --noEmit -p .`,
`npx prettier --check src/siege/render tests/siege tests/e2e-siege`. Update `render-v02.spec.ts` if it depends on these.
