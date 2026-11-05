# Codex task Q — a click must feel instant

Planned and validated by Claude; implemented by Codex. From the user's third playtest: "整个游戏感觉非常不好，一卡一卡的，不流畅，很难受". This is the first of three packages (Q speed, R clicks and art, S occupancy). **Q changes no rule and no behaviour.** The same game must be played out, move for move.

## What the planner measured

Headless Chromium, the dev build the user plays, 1280×720, at `a975184`. The probe is `.artifacts/siege/perf-probe.mjs`.

| Interaction                 | Day 1   | Day 9       |
| --------------------------- | ------- | ----------- |
| Select a unit, longest task | 687 ms  | **901 ms**  |
| Select a unit, script       | ~570 ms | ~1240 ms    |
| `siegeCommands`, one call   | 28 ms   | **147 ms**  |
| `actionContext`, one call   | 30 ms   | 146 ms      |
| Hover, script per move      | 15 ms   | 11 ms       |
| Drag pan, script per move   | 20 ms   | 13 ms       |
| End day, longest task       |         | **1480 ms** |

CPU profile of 4 selections on day 9, 5771 ms in total: `siegeCommands` 3374 ms, of which `actionContext` calling it a second time is 2284 ms, and `SiegeMapView` 655 ms. `applySiegeAction` self time is 3685 ms.

The causes:

1. **A legality check runs the whole action.** `actionReason` (`src/siege/ui/commands.ts`) calls `applySiegeAction`, which does `structuredClone` of the whole state including the event log. `siegeCommands` does this up to about 100 times per actor, because `choose` walks every candidate until one is legal, and the candidates include every trench cell, gate, enemy and engine. The log grows all game, so everything slows down as the game goes on.
2. **`actionContext` calls `siegeCommands` again on every render of `SiegeApp`.** It is not memoised. Other `actionReason` calls in the JSX also run on every render (`SiegeApp.tsx` lines ~797, ~1223, ~1241, ~1373, ~1425, ~1561, ~1585).
3. **Selecting a unit rebuilds the whole scene.** The `drawing` memo in `SiegeMapView.tsx` depends on `selected`, `reachable`, `targets` and `tutorialCells`, so about 2000 SVG nodes are reconciled for an overlay change.
4. **Hover and pan re-render the whole map component** on every pointer move, through `setHover` and `setView`.
5. **The AI uses the same slow `applySiegeAction`** many times per turn, on the main thread.

## Changes

1. **A cheap clone.** Add `cloneSiegeState(state)` in `src/siege/rules`: `structuredClone` of everything except `log`, then `log: state.log.slice()`, sharing the entries. Verify that nothing mutates a log entry after it is pushed; if something does, fix it to replace the entry. Use it wherever the rules clone a state, including `applySiegeAction` and `combat.ts:708`.
2. **A real legality check.** Add `validateSiegeAction(state, action): string | null` in `src/siege/rules/actions.ts`. It runs `performAction` on a cloned state with an empty log and skips stats, outcome and logging. It must return exactly the reason `applySiegeAction` would return. `actionReason` uses it.
3. **Fewer candidates.** In `siegeCommands`, try the plausible candidates first (adjacent trench cells, adjacent engines, enemies in range, gate approaches near the actor), and only compute a fallback reason from `actions[0]` when none is legal. The result must be the same `SiegeCommand` for every state, including the chosen action and the reason. Add a test that proves this against the old exhaustive behaviour over many states; keep the exhaustive version in the test file for that purpose.
4. **Cache per state.** `siegeCommands(state, id, side)` and `actionContext(state, id, locale)` are memoised per state object with a `WeakMap`. Rule state is treated as immutable by the interface, so identity is a safe key. Any other `actionReason` in `SiegeApp.tsx`'s JSX goes through `useMemo` or is computed only when its panel is open.
5. **Split the scene.** In `SiegeMapView.tsx`:
   - Static city art, camp and scenery: a memoised child that only re-renders when zoom, patches or xray change.
   - Units and engines: a memoised child that re-renders when `state`, `facings`, `activity` or `night` change, not on selection.
   - Overlays (`reachable`, `targets`, `tutorialCells`, hover, the selected unit's marker): their own small child.
   - Selecting a unit must not re-render the first two. If the unit art depends on `selected` today, move that marker into the overlay.
6. **Hover and pan.**
   - Hover state lives in the overlay child, and only updates when the picked cell changes.
   - While dragging, write `viewBox` directly to the SVG element in a `requestAnimationFrame` and hold the value in a ref. Commit to React state on pointer up.
   - Zoom, focus and minimap still go through state.
   - Everything that reads `view` for clicks must read the current value.
7. **End of day.**
   - The AI gets faster through the cheap clone. Then measure with the probe. If the longest task is still above 300 ms, split the turn across tasks: yield with `await` on a `MessageChannel` between AI actions, without changing the order of actions or the RNG. **Do not change any AI decision.**
   - The screen must paint a visible "魏军行动中……" state before the work starts.
   - A real Web Worker is out of scope unless yielding fails.
8. **Night replay.** Each replay frame must not rebuild static art. It follows from item 5; check it.

## Gates

- **The game is unchanged.** `.artifacts/siege/sim-baseline-p4.json` holds the planner's baseline, from `node tools/siege-sim.mjs 200 --strict`. After your change, `node tools/siege-sim.mjs 200 --strict --output .artifacts/siege/sim-q.json` must give the same result for every game: same outcome, day, losses and score for each method and seed. Timing fields may differ. Write a small script that compares them, and put the result in your report. **If one game differs, you changed the rules: find out why before going on.**
- **Tests that are not about timing**, since timing tests are unreliable on this laptop:
  - `validateSiegeAction` agrees with `applySiegeAction` for every candidate action, across states sampled from scripted games of all three methods, for both sides.
  - The optimised `siegeCommands` equals the exhaustive one on those states.
  - `siegeCommands` returns the same array for the same state object.
  - `cloneSiegeState` gives a deep-equal, independent copy, and no rule mutates an existing log entry.
  - Selecting a unit does not re-render the static or the unit layers. Use a dev-only render counter on `window.__siegeDev` and an e2e spec.
- Existing tests keep passing. Saves keep loading.

## Constraints

- No behaviour change. Do not touch `src/v03`, tuning, AI decisions or generated art. No new dependencies.
- Follow the surrounding style.
- Your sandbox cannot start Chromium; the planner runs Playwright and the probe. Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege`, `npx vitest run tests/siege --maxWorkers=1`, and the simulation comparison.
- Do not commit. Report what changed, the comparison result, and anything you could not verify.
