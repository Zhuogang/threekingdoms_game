# Codex task V2 — the coarse board on the painting

Planned and validated by Claude; implemented by Codex. Second of three packages. V1 (`32c17f7`) moved rules to the 17×14 board and left a temporary `src/siege/render/coarseBridge.ts`. This package removes it and makes the game playable and readable. **No rule changes.** If a rule looks wrong, say so in your report and leave it.

The user's complaints this exists to end: "各种重叠，选不中", "占位", units hidden behind the wall. I've already mocked this up: full-size soldiers in a rank along the parapet look right, so the wall does not need repainting. Saves don't matter: don't spend anything on them.

## One geometry module

Add `src/siege/render/boardGeometry.ts`. It's the only place that turns a board position into screen pixels. Delete `coarseBridge.ts`. After this package, no render, UI or dev code does arithmetic with `FRAME.cw`, `FRAME.cd` or `project()` on a board coordinate. Art code in fine coordinates (footprints, patches, camp pieces, `CHENCANG_ART_LAYOUT`) stays as it is.

It exports, for a `SiegePosition`:

- **`planeRect(p)`**: the standing surface on screen, the fine span of the cell projected at its plane. Wall level, gate top and a built inner wall use their `cellHeight`. Ground and ramp cells use height 0 here, so a ramp reads as ground, not as a step in the air.
- **`hitRect(p)`**: the area of the screen that belongs to this position. **Hit rects of all standing positions are pairwise disjoint.** That is the whole point, so a click has exactly one answer. Rules for building them:
  - The south wall top (row 7, at 3 levels) covers the bottom of row 6 on screen. Row 6's hit rect is trimmed to end where the wall top starts (fine y 14.5). Likewise row 0 ends where the north wall starts (fine y 2.5), and the north trench row, hidden behind the wall, has none.
  - A south wall cell's hit rect also runs down over its front face, to the top of row 8, so clicking the wall means the wall. The same for the corners. Do the same for the north wall's inner face down to row 3.
  - The south gate cell `(8,7)`: top level takes the top surface, ground level takes the front of the gate passage on the face below it. The same rule for the others, where the passage is visible; where it isn't, a gate cell's ground level gets a small rect at the passage's inner mouth. Say what you chose.
  - Side walls (cols 4, 12) get their top only.
- **`anchor(p)`**: the centre of the formation, screen coordinates. Default is the centre of `planeRect` clipped to `hitRect`. Overrides where the painting demands it, kept in one table:
  - Row 6: placed in its visible part.
  - Ramp cells: on the painted ramp. Check `(5,4)`, `(11,4)`, `(7,3)`, `(9,3)` and the row 6 ones against the picture.
  - `(9,4)`, `(10,4)` (courtyard): on the paved court, not on the hall roof.
- **`depthOf(p)`**: the painter's key, in fine rows, so a unit sorts by where its feet are.
- **`positionAt(state, sx, sy)`**: the inverse of `hitRect`, returning the position or null. Levels come from the state: a built inner wall, a broken gate.

`src/siege/render/picking.ts` becomes `positionAt` plus nothing else. Since a cell now holds one unit and hit rects don't overlap, `preferGreen` and the nearest-green logic have no job: remove them. Update `src/siege/ui/mapClick.ts` and its callers to match. `resolveMapClick` still decides what the click means.

A click on a unit's figures that extends beyond its cell, soldiers standing up over the cell behind, belongs to the cell under the cursor. The exception is the nameplate below.

## Formations

- Soldiers are full size: `UNIT_FIGURE_SCALE` goes away.
- `formationFor(position, troops)` fits the figures to `planeRect`: the number comes from troops as `formationOffsets` does today, capped by what fits. Wall cell along the parapet (192×48): one rank, or two staggered if the count needs it, up to 6. Side wall (64×144): two files, up to 6. Corner or a 64×48 cell: up to 3. Ground cell: up to 9 in staggered ranks. Feet stay inside `planeRect`, with margin.
- Face the enemy by default, as today. The hero or flag figure stays in the formation.
- Climbers on a ladder, storming and mound figures keep their art, placed from the new geometry. Check them in a screenshot.

## Nameplates

Each living unit gets a small plate above its formation: portrait if it has one, otherwise a side-coloured badge, troops, morale. Size about 92×26 at 100%. It's the plate that keeps a unit findable and clickable when the painting covers it, and it's always drawn above art. **Clicking a plate selects that unit**, whatever the plate lies over. It doesn't swallow a click meant for a move or attack target: with 移动 or an attack armed, it acts as a click on that unit's own cell. Keep plates from overlapping each other in the common case by placing each at the unit's own anchor, offset upward; on the south wall the plates sit over the yard, which is fine. Show moved/acted state on it, dimming, so "who still has something to do" can be read at a glance. Keep the existing wounded or low-morale marks if they exist. Reuse existing bars or badges rather than drawing the same information twice.

## Occlusion: outlines, not soldiers on the roof

Figures always stay in true depth order. No unit is ever drawn on top of a roof. Replace the `CoveredUnits` 85% overlay: **the parts of a unit hidden by an occluder are shown as a flat yellow silhouette** (about `#ffd23c`, 70% opacity), as in the reference recording.

Suggested method, simplest first: in a layer above the occluders, draw the same figures through one shared SVG filter that floods their alpha with the colour, only for units whose figure rect intersects an occluder that sorts in front of them, and clip that layer to the occluder's own shape if the masks make that cheap; if not, draw the silhouette for the whole formation, and tell me. A unit standing on a gate top is the main case: the tower roof sits behind and around it, so it must read as a silhouette at the tower, with its plate above.

Measure this: it must not bring back long tasks. One filter on a handful of groups, not one per soldier. Keep nodes stable between frames, as the existing layers do.

## Everything else that places things on the board

Move all of this to `boardGeometry`, one call site at a time, and check each in the scene preview:

- Reachable, attack, fill and selection overlays in `MapOverlays` and `SiegeMapView.tsx` around lines 503, 814, 1313, 1421: draw `planeRect` for the cell. Add a **thin outline on the hovered standing cell**, always, with `hitRect` logic, so the player sees what a click would hit before clicking.
- Battle effects `SiegeMapView.tsx:1560`, `v02Effects.tsx`, move and engine animation (`:940`), camera focus (`:239`, `:259`), `nightReplay.ts`, `src/siege/ui/fireRange.ts` if it draws anything, `spriteBudget.ts`.
- `engineSprite`, `engineFootprint`: an engine stands at its cell's anchor. The footprint is its one cell, plus a raised ladder's top. A raised ladder's feet go on its base cell in row 8 and its top on the wall cell's parapet, centred in the column. If the art's length doesn't reach, tell me; don't stretch it silently. `climbableCells` and the gold frame use `planeRect` of the wall cell. An engine's sprite may be taller than a thin trench row. That's fine.
- `statePatches`: already in fine cells. The 'ramp-south' patch and inner wall runs stay. The trench patch of a board cell covers all its fine cells, as V1 has it. Confirm a filled 3-fine-wide cell looks whole.
- `depth` in `unitVisual` uses `depthOf`.
- Dev previews, `src/siege/dev/*`: any scene with hard-coded positions moves to the new board. Add `?siege-map&scene=board`: every cell's `hitRect` outlined and labelled, one colour per plane, and one formation in each standing cell. That's my review sheet.

## Tests

- Fix `mapClick`, `picking`, `renderNightReplay`, `renderV02`, `stateArt`, `visibility` to the new geometry, keeping what each was protecting. List anything you drop.
- `tests/siege/boardGeometry.test.ts`:
  1. Hit rects of all standing positions are pairwise disjoint. Run it with no segments built, then all built, then gates broken.
  2. The centre of each `hitRect` returns that position from `positionAt`. Every standing position has a hit rect at least 40×24.
  3. Each formation's feet lie inside its `planeRect` for troop counts 1, 150, 1000, 3000.
  4. Each `anchor` lies inside its own `hitRect`.
  5. A source guard: outside the art modules, nothing in `src/siege/render`, `ui` or `dev` multiplies a board coordinate by `FRAME.cw` or `FRAME.cd`.
  6. A unit standing on a gate top or behind a building is listed as covered and gets a silhouette, and no unit's figures are in the overlay at full colour.
- `tests/e2e-siege/*`: migrate to the new board. You can't run Chromium, so write them carefully: I run them. Prefer clicks at the centre of a `hitRect`, exposed through the existing dev handle if needed, over literal pixels. Avoid over-exact assertions.

## Validation you can run

```bash
npx tsc --noEmit
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
node tools/siege-sim.mjs 40 --output .artifacts/siege/sim-v2.json
npx vite build
```

Everything in `tests/siege` must pass. The simulation must match V1's `.artifacts/siege/sim-v1.json` game for game on those seeds, because no rule changes. Add §5.15 to `docs/siege/03-chencang-v0.2-plan.md`, or extend §5.14, in Chinese, with the geometry rules, and update §8 and `docs/siege/00-progress.md`.

Don't commit; I validate and commit. Report: files, what you chose where the brief said to choose, the silhouette method and its cost, tests dropped or rewritten, anything the painting wouldn't allow.
