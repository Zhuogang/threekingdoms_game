# Codex task P2 — corrections to P after the planner's validation

Package P is in the working tree, uncommitted. The planner has run it and reviewed the screenshots. The guidance works and reads well. Three things need correcting.

## What the planner already did

`src/siege/rules/state.ts`, `tests/e2e-siege/wei.spec.ts`, `tests/e2e-siege/shu-v02.spec.ts` and `tests/siege/weiUi.test.ts` are restored to `HEAD`. **The starting positions stay as they were.**
The reason is a measurement, 200 games per method:

| Variant                         | careful | anyPrice | brute |
| ------------------------------- | ------- | -------- | ----- |
| Baseline, HEAD                  | 23.5%   | 79%      | 17.5% |
| Ladder cell admits troops, only | 23.5%   | 79%      | 17.5% |
| New starting positions, only    | 68%     | 87.5%    | 100%  |

So a one-day head start is what breaks the order. Keep the movement rule. Do not touch `state.ts`, tuning or the AI.
Consequence: on the default deployment nobody can reach a ladder base on day 1. The first day is "raise and walk up", and the climb comes on day 2. The plan's target is a foothold by day 2, so this is the intended rhythm, and the guidance must say so plainly.
A player can still redeploy to (18,21) or (29,21) during deployment and climb on day 1. That stays legal for now; the planner tracks its balance separately.

## 1. Clicking a green cell must work when something is drawn over it

Reproduced by your spec, and it is a real bug that also exists at `HEAD`. In `SiegeMapView.tsx`, `onPointerUp` only looks at the topmost element:

- The unit hit targets sit above the overlays, and a unit's rect is taller than its cell. With 魏延 at (18,21), pressing 移动 and clicking the middle of (18,20) re-selects 魏延 and nothing moves. **You cannot walk one cell north with a click on the cell's centre.** Trench filling northward has the same problem.
- A painted wall slice can sit over a green cell. Clicking the filled wall foot (18,17) falls through to `pickAt`, picks the wall, and opens the 城墙 hint card instead of moving.

Fix it like this. Add a prop `preferCells?: boolean` to the map; `SiegeApp` passes `mode === 'move' || mode === 'fillTrench'`. In `onPointerUp`:

```ts
const stack = document.elementsFromPoint(event.clientX, event.clientY);
const topSelect = stack[0]?.closest('[data-select]')?.getAttribute('data-select');
const green = stack.find((el) => el.getAttribute('data-overlay') === 'reachable');
if (green && (preferCells || !topSelect)) {
  /* onCell with green's data-cell */ return;
}
```

Then carry on with the existing code unchanged, including the `deploy` overlay, which keeps looking at the top element only, because clicking a unit during deployment swaps or selects it.

Deliberately **not** done: without 移动 pressed, a click on any unit's body, including the selected unit's own head, still selects it and never moves it. A double-click on a unit must never spend its move.

## 2. The first day's rhythm

- `walk3`, zh: 选一支步兵，移到金框那一格（云梯所在的格子，它下面一格不算）。今天走不到就先走近，结束本日再继续。 Write the English to match.
- During Shu walkthrough step 3, the `end-day` button pulses (the same `pulse` used on step 7) when no infantry that has not yet moved can reach the ladder's cell today. Put that check in `walkthrough.ts` as a small pure function, with a unit test.
- `walkthroughTargets` already frames the base on step 3. Keep it.
- `advanceWalkthrough` step 3 keeps your change: arriving before raising counts.

## 3. Smaller corrections

- **Remove the duplicate sentence.** In `SiegeApp.tsx`, `action-reason` currently falls back to the guide's sentence when nothing is hovered, so the same line prints above and below the buttons. Remove that fallback: it shows `actionReady` until the player hovers, focuses or clicks a command. `actionContext` stays the permanent line. Update the `action-reason` assertion in your `expectGuide` helper: hover `command-climb` first.
- **English plurals.** "1 cells away" is wrong. Replace these: `climbWalkLadder`: "Stand on the gold frame, the ladder's own cell, to climb: {n} to go." `climbWalkWallFoot`: "Stand on the gold frame, the filled wall foot, to climb: {n} to go." `climbTooFar`: "The gold frame is too far today ({n} to go). Move closer and climb tomorrow." `climbMoved`: "This unit has moved and the gold frame is {n} away. Continue tomorrow." The last one has "{n} away", which reads fine for 1.

## Tests

- `tests/siege`: remove the assertion that a ladder's cell is reachable on day 1 from the new game. Replace it with: on the default deployment no infantry can reach either ladder's cell on day 1 and the guide says so; after `deployUnit` to (18,21) or (29,21), that unit can reach it. Keep every other P test.
- `tests/e2e-siege/climb-guide.spec.ts`, keeping real mouse clicks through `clickCell`:
  - **Default deployment, two days, in zh and en.** Raise the west ladder. Move 魏延 onto (18,20), directly south of the ladder. The context states the distance and that the unit has moved; 登城 is grey. `end-day` pulses. End the day and close the report and any cards. Select 魏延, move onto (18,19): this is one cell north, so it proves fix 1. The walkthrough reaches step 4. Then read `climbGuide` from the snapshot: climb if `ready`, and for `defenderAbove` assert that 攻击 is available and the sentence names the defender. Assert the foothold when it applies. Do not hard-code what the AI did overnight.
  - **Day-1 climb after redeployment**, both orders of raising and moving, at both ladders: replaces the "without redeployment" tests. Use `clickCell(page, 'deploy', ...)` before `begin`.
  - **North-cell click, without any ladder involved.** 魏延 at his default (20,21): press 移动, click (20,20), and he moves. Without pressing 移动, clicking the same point leaves him at (20,21) and still selected.
  - **Selecting through a green cell without 移动.** With a unit selected, clicking another Shu unit's upper body still selects that unit.
  - **Filled wall foot** stays as you wrote it. It must now pass, with no 城墙 card opening.
- Keep the rest of the spec.

## Constraints

Same as P. Do not touch `src/v03`, `src/siege/rules/state.ts`, tuning, the AI, or generated art. Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege`, `npx vitest run tests/siege`, and `node tools/siege-sim.mjs 200 --strict`, and include the simulation's whole table in your report. It should match the baseline row above; say so if it does not. Do not commit.
