# Codex task V4c — engines own their drawn body too

V4 and V4b are uncommitted in the working tree: keep them and build on them. Don't commit. Don't tune balance or change game rules. Saves don't matter.

I ran the full browser suite: 132 of 135 pass, and the real-mouse sweep clicks 137 figure centres with no misses. The three failures are below.

## Code

The day-9 failure shows a gap. A ram's cell is one thin row, mostly covered by the next unit's plate and back row, while its large roof stands over the gate cell north of it. Rule (e) in `pickFigureArt` only covers raised ladders, so clicking the ram's roof doesn't select the ram. The player can't reach it on the map, which is the same bug again.

Change row (e) of the order, in `src/siege/render/picking.ts`, from "a raised usable ladder's sprite rect" to **any usable engine's sprite rect, frontmost by depth**. The result path stays `pickedEngineId`; update `resolveMapClick`'s check so it accepts any usable engine, not only raised ladders.

One exception: if the cell under the cursor is a gate that is a legal target of the selected actor (`actorTargets(state, selected, playerSide)`), the cell under the cursor wins. A click on the gate behind a ram must still open that gate's action.

Keep the existing cases: wrecks are not usable, so they stay cell-only; armed modes, deploy, `reachable`, and rows (a) to (d) all come first, unchanged. Hover follows the same path, so the outline must show the engine's own cell.

## Tests

| Test | Why it failed | Fix |
|---|---|---|
| `map-clicks.spec.ts:61` (day9, zh and en) | Clicks the centre of the ram's cell, where Wei Yan's back row now correctly owns the pixel. | The player clicks the body, so click a point on `engineSprite(...).rect` that no figure box and no plate covers, found by sampling that rect in the page. Fail if a usable engine has no such point. Keep the rest. |
| `map-clicks.spec.ts:208` | The unit is auto-selected, and the yard cell under its head is a legal move, so the cell correctly wins (the hover is green). | Set `moved: true` on the unit in the fixture so the yard isn't reachable. Add one assertion for the other case: with the unit able to move, the same point keeps the cell. |

Add to `figure-clicks.spec.ts`: in the careful sweep at each of the four day counts, for every usable engine on the map, click such a free point on its body and assert it is selected, with no forecast open. Then, with an own infantry unit selected, adjacent to a gate behind a ram, clicking the gate cell through the ram's body opens the gate action instead (build this as a fixture; check what the rules need for it to be legal).

Unit tests: row (e) for ram, tower and cart; a figure over an engine (row d wins); the gate exception; a wreck not picked.

## Validation you can run

```bash
npx tsc --noEmit
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
npx vite build
```

Report, briefly: what changed, each test you changed, and any engine that has no free point on its body in any state you can reason about.
