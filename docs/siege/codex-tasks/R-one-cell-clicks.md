# Codex task R — one click, one cell; the art fits the cells

Planned and validated by Claude; implemented by Codex. From the user's third playtest: "各种重叠，选不中". This is the second of three packages. Q (speed) is committed. **R changes no rule: all 600 simulated games must stay identical**, using `tools/siege-compare.mjs` against `.artifacts/siege/sim-baseline-p4.json`.

## What the planner measured, with real mouse clicks

- Unit art is 97×63 on a 62×46 cell at 100%, anchored at the cell's centre, so a figure stands half in the cell to its north. Neighbours overlap by about a third.
- A ladder cart draws over the cell south of its logical cell. A tower is 177×265 px and on day 9 covers the east ladder and an earth cart; clicking the east ladder selects the tower.
- A unit on a ladder cell, or on the cell south of one, is **drawn behind the cart and cannot be seen**.
- With a nearby infantry selected, clicking an unraised ladder walks the unit onto it, while the panel says to select the ladder. With a unit standing on the unraised ladder, clicking the middle of the ladder selects the unit, and only the edges select the ladder.
- A follower at an open breach is drawn **up the ladder**, because `unitVisual` treats any foothold above 0 as climbing and draws progress 3 at the top. It overlaps the unit on the wall and looks like a bug.
- `onPointerUp` is a stack of special cases: top DOM element, then green, framed, own body, then unit rects, engine rects, then the cell. Each past fix added a case and opened a new hole. **Replace it; do not add to it.**

## 1. The click rule

Write a pure function, `resolveMapClick`, in a new file `src/siege/ui/mapClick.ts`. `onPointerUp` does only three things: ignore drags, pick the cell with the existing `pickAt`, call the resolver. The DOM stack, `data-select` and the rect tests all go. Keep the `map-unit-*` elements as plain invisible rects so existing specs can locate units, but they carry no meaning. `selectedAt` and `DOUBLE_CLICK_MS` go.

**Occupants of a cell**, in order:

1. A living unit standing on it.
2. An engine whose **click footprint** contains it.

Add `engineFootprint(engine)` in `src/siege/render/stateArt.ts`, covering the cells the art visibly covers:

- Ladder cart: its cell and the cell south.
- Raised ladder: its cell, the cell south, and the trench cells up to the wall.
- Earth cart: its cell and the cell south.
- Ram: its cell and the two cells south.
- Tower: its cell, the cell south and the cell to the east and its south.

Check each against the sprite rectangles. Footprints are for clicking only; they change no rule.

A unit standing at a ladder's base counts as an occupant of every cell of that ladder's footprint, ahead of the ladder, because its climbing figure is drawn there.

**The rule, first match wins:**

| Situation | Result |
| --- | --- |
| Modal open, replay, opening | nothing |
| Deployment | today's behaviour, moved here unchanged |
| Attack mode, enemy or gate in the cell | target it |
| 移动 or 填堑 pressed, cell is green | do it |
| Enemy unit in the cell, own actor selected | target it (opens the forecast, as today) |
| Enemy unit in the cell, nothing of ours selected | select it |
| Own unit in the cell, not selected | select it |
| Own unit in the cell, already selected | select the next occupant if there is one, otherwise nothing |
| Cell is green, an **unraised** ladder is its logical cell | select the ladder |
| Cell is green | move there |
| Engine in the cell, not selected | select it (several: the frontmost) |
| Engine in the cell, already selected | select the next occupant if there is one, otherwise nothing |
| Otherwise | `onCell`, as today (terrain cards) |

Selecting an engine under a selected unit is therefore one more click. A double-click on a unit cannot move it, because both clicks land on occupied cells.

**Show what a click will do.** The hover outline uses the resolver: green for a move, red for a target, gold for a selection. No outline when nothing would happen. Cursor `pointer` when something would happen. This must not re-render the scene; Q put hover in the overlay layer.

## 2. The art fits the cell

- **Units fit their cell.** In `stateArt.ts`, reduce the figure scale and tighten `formationOffsets`, and anchor the foot near the cell's south edge rather than its centre, for ground and wall units. Target at 100%: the visible formation at most 66 px wide and 50 px high, standing inside its own cell, so the centre of its `rect` picks its own cell. Check the wall walkway and gate tops too: a gate-top figure's rect centre must pick its own wall cell. Adjust `pickAt` if the gate tower needs it.
- **Units in front of engines.** A unit in any cell of an engine's footprint paints after that engine. Walls still occlude ground units behind them, with the existing silhouettes. Storming art and hoisted millstones keep their current rules.
- **A follower at an open breach stands at the base.** `unitVisual`: `climbing` only when foothold is 1 or 2. At 3, the unit is drawn normally in its cell.
- **Nothing hides the thing you are working on.** The existing fade (`data-fadeable`, line ~1293 before Q) excludes engines. Allow it for engines when they cover the selected actor or the gold frame, but never fade the selected engine itself.

## 3. The panel

- **架梯 on the unit.** A Shu infantry unit standing on an unraised ladder gets a `raiseLadder` command, acting on that ladder (`{ type: 'raiseLadder', engineId }`). The rule is unchanged, only the entry point. The `ladderNotRaised` at-base sentence becomes zh: 云梯还没架起：点「架梯」，再点「登城」。 en: The ladder is not raised. Press Raise ladder, then Climb.
- **Units already past the wall get no climbing advice.** `climbGuide` returns `null` for a unit north of the south wall (`y < 17`), since a screenshot showed a unit inside the city being told to climb. It falls back to the place line.
- **A boxed-in wall unit is told so.** For a Shu or Wei unit on the wall that has not moved and has no reachable cell, the context says zh: 走不动：两侧被挡，先攻击旁边的敌军。 en: Blocked on both sides. Attack an adjacent enemy first. Check the wording fits both sides; if allies are what blocks it, S will change that.

## 4. Hint cards

The cards over the map must not block play. `.siege-map-notice` gets `pointer-events: none` except on its button, so the map underneath stays clickable, and its width drops to at most 300 px. No rule for when they appear changes.

## Tests

- `tests/siege/mapClick.test.ts`: every row of the table, including each cycle; a double-click, as two resolver calls, never moves; deployment unchanged.
- `tests/siege/stateArt` or similar: `engineFootprint` for each engine kind and state; a follower at foothold 3 is not `climbing`; at 1 and 2 it is.
- `tests/e2e-siege/map-clicks.spec.ts`, 1280×720, real mouse:
  - **Property test, the main one.** For each of several fixtures (default start, a crowd around a ladder base, units on the walkway and gate top, and a day 9 game from `playScript`): for every living unit on screen, click the centre of its `map-unit-*` rect at 100% and at 75%, and assert that unit becomes selected (for an enemy with an own actor selected, that it becomes the target). For every engine with no unit in its logical cell, click that cell's centre and assert the engine becomes selected.
  - **The reported cases.** With a nearby infantry selected, clicking the unraised east ladder selects the ladder and the unit does not move. With 移动 pressed, the same click walks the unit onto it. With a unit on the unraised ladder: click selects the unit, a second click selects the ladder, a third the unit. The unit's panel offers 架梯, and pressing it raises the ladder and offers 登城. A follower at an open breach: click the gold frame's cell selects it.
  - **Visibility.** A unit on a ladder base and a unit on the cell south of a cart paint after the cart (compare document order or `compareDocumentPosition` of their nodes).
  - Hover: the outline colour is correct for a move, a target and a selection.
  - A click through a hint card reaches the map.
  - No panel scrolls.
- Update existing specs and tests that relied on the old behaviour, and list them with reasons in your report. The P2/P3 cases about `preferCells`, `framed` and own body are replaced by the table above. Keep their intent where the table still gives it.

## Constraints

- No rule, tuning or AI change. Do not touch `src/v03` or generated art files; figure scale and anchors are code. No new dependencies.
- Keep Q's render separation. Selection must not re-render static or unit layers.
- Your sandbox cannot start Chromium; the planner runs Playwright and reviews screenshots. Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege`, `npx vitest run tests/siege --maxWorkers=1`, `node tools/siege-sim.mjs 200 --strict --output .artifacts/siege/sim-r.json` and the comparison.
- Do not commit. Report what changed, the comparison result, every test you changed and why, and your interpretation of anything the table leaves open.
