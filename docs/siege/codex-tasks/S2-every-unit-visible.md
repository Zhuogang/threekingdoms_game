# Codex task S2 — every living unit must be visible

Package S is in the working tree, uncommitted. The rules are right. The planner reviewed screenshots (`.artifacts/siege/look-probe.mjs` makes them) and found a visual failure, partly from R, that makes S unusable as it stands: **a unit a player cannot see is a bug, whatever the rules say.** No rule changes in this task.

## What the screenshots show

1. **Units on the walkway are nearly invisible.** R's figure scale of 0.54 and foot anchor of 0.92 leave only spear tips above the parapet, with the disc and health bar drawn on the wall face. Only gate-top units look right.
2. **Units just inside the wall are invisible.** The wall is 3 levels high, so ground cells in the row behind it (y = 15 on the south wall) are entirely behind it. With 下城 this is where a unit lands, so it vanishes. Even when selected, with the wall faded, the figure barely shows.
3. **Clicking that row is unreliable.** The upper half of a ground cell at y = 15 overlaps the walkway cell at y = 16 on screen, and `pickCell` tries the highest plane first. A click at the exact centre of the green rect fell into the wall cell, and the game said "目的地受阻或超出移动范围" while the player was clicking a green cell. This is what fails `room-to-move.spec.ts:52`.
4. **Figures are a little too small.** 0.54 went further than the overlap required.

## Changes

1. **Walkway units show their whole figure.** A unit on a wall or gate-top cell paints after the parapet of its own run, and stands so that the figure rises from the walkway. It no longer hides behind the crenellations. Gate-top units already look right; keep them looking that way. Preparation sprites and hoisted rigs keep their current rules (a hoisted millstone still reads as hanging in front).
2. **Units behind a wall show their figure.** Any living unit, of either side, selected or not, whose figure is covered by a wall or tower slice gets its full figure drawn above that slice, at about 85% opacity and with its disc and health bar on top. This is the existing silhouette path (`selectionSilhouettes`, `occluders`, `drawUnit`). Strengthen it: it should read as the unit in its colours, not a ghost. It must also clear a raised ladder's top. It stays inside the sprite cap, and it must not be budget-starved for a unit that is on screen; check the `worst` scene.
3. **Picking uses every plane.** Add `pickCandidates` next to `pickCell` in `src/siege/render/scene.ts`, returning every cell that stands at the point, highest first. `pickAt` in `SiegeMapView.tsx` chooses in this order:
   1. A candidate that is green for the selected actor.
   2. A candidate with a living unit on it (a unit behind the wall is reachable through the silhouette drawn over the wall).
   3. The first candidate.

   Hover uses the same choice. `resolveMapClick` stays pure and its table is unchanged: this only decides which cell it gets. Add tests for a green ground cell at y = 15 under a wall cell, including its exact centre and both halves.

4. **Figure scale.** `UNIT_FIGURE_SCALE` to 0.6. Relax the geometry test to at most 72×50 px at 100%: a few pixels of neighbour overlap in a full formation is acceptable. Keep the rule that a `rect` centre picks its own cell.

## Specs that describe the old rules

Fix these. In each case the code is right and the spec is out of date:

- `climb-guide.spec.ts:328`: with an ally on top that has not moved, the guide is now `ready` with `makeWayId`, and its sentence is `climbMakeWay`. Keep the "click the gold frame without Move" intent.
- `climb-guide.spec.ts:403`: the pre-check that (20,20) is not green for 姜维 is obsolete, since he can pass 魏延. Remove it; the double-click assertion is what matters.
- `map-clicks.spec.ts:228`: after the first click 魏延 is at the base and `ready`, so no frame remains there. Use `clickLogicalCell` for the second click.

## New tests

- `tests/e2e-siege/visible.spec.ts`, 1280×720, at 100% and 75%, with the fixture from `.artifacts/siege/look-probe.mjs` (units on the walkway; on the row behind the wall; on a ramp; just inside the gate; a Wei unit behind the wall), and with no unit selected:
  - For every living unit on screen, its figure node paints after every wall, parapet or tower slice that overlaps it. Compare document order, including the silhouette node when that is what's drawn.
  - Its opacity is at least 0.8.
  - Clicking the centre of each unit's `map-unit-*` rect selects that unit.
  - Screenshots saved to `.artifacts/siege/screens/visible-100.png` and `visible-75.png`.
- `room-to-move.spec.ts:52` must pass unchanged: step down, walk to just inside the gate, open it, walk through.

## Constraints

No rule, tuning or AI change, so the simulation must match `.artifacts/siege/sim-s.json` for every game: compare with `tools/siege-compare.mjs`. Do not touch `src/v03` or generated art. Keep Q's render separation: selecting a unit must not re-render static or unit layers. Your sandbox cannot start Chromium; the planner runs Playwright and reviews the screenshots. Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege tools`, and `npx vitest run tests/siege --maxWorkers=1`. Do not commit. Report briefly.
