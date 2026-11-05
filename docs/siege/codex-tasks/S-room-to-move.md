# Codex task S — once on the wall, keep moving

Planned and validated by Claude; implemented by Codex. From the user's playtest, in their words: "攻上城头之后就打不到魏军士兵了，有非常严重的格子占位问题，我也不知道登城之后为什么不可以迅速下城打开城门etc或者至少进入内城". They also said balance is not the concern right now. This is the third of three packages, and it depends on R's `resolveMapClick`. **Rules change here on purpose. Implement them as written, report what the simulation does, and do not tune anything to compensate.**

## Why it feels stuck today (checked in the code and with real clicks)

- The wall walkway is one cell wide, one unit per cell, and allies cannot pass each other (`unitSearch` treats every living unit as blocking). With allies on both sides, or Wei on both sides, a unit has no move at all.
- The only way down is a ramp. Ramps are entered only from one wall cell, and from the ground only at their low end. From the top of the west ladder it takes two days to reach the gate road, in single file.
- Infantry on the wall cannot hit a Wei unit standing on the ground next to the wall. `siegeAttackInRange` allows that only for Wei. So when Wei falls back off the wall, Shu has nothing to hit.
- Nothing can be done with a gate from inside. There is no reward for getting behind it.
- A unit that has just mounted cannot act, and the next unit cannot come up until it has walked away by hand.

## The rules

Put the geometry in `src/siege/rules/movement.ts` and the actions in `src/siege/rules/actions.ts`. No new numbers in `tuning.ts` unless stated.

1. **Pass through allies.** A living unit of the same side no longer blocks traversal, only stopping. Enemies and engines block as today. Both sides. `pathTo` and `reachableCells` return only cells where the unit can stop.
2. **Step down off the wall.** From any wall or gate-top cell, one step reaches the ground cell directly on the city side, if it is inside `CITY_BOUNDS` and passable. It is one movement point. Both sides. Going up is still only by ramp, mound or climbing. Nobody can step down on the outside of the wall.
3. **Ramps are ordinary ground.** Ramp cells can be entered and left in any direction, cost 1 each, and the ramp's top cell still connects to its wall cell. Remove the single-file entry rule. `src/siege/ai/defender.ts` around line 107 has its own copy of the neighbour logic: share one function, do not keep two.
4. **Open the gate from inside: a new action, `{ type: 'openGate', unitId, gateId }`.**
   - Legal for an active Shu infantry unit that has not acted, when the gate is not broken, and no living Wei unit stands on that gate's top cells, and the unit is either on one of those top cells or on a ground cell inside the city directly adjacent to one.
   - Effect: the gate behaves exactly like a broken one for movement, the AI and scoring (`broken: true`, `durability: 0`, `stats.gateEverBroken = true`), plus `opened: true` (optional in the save schema) and a `gateOpened` log event instead of the broken-gate one. The unit's action is spent. Night repair cannot undo it, as with a broken gate.
5. **Hit what is next to you.** Infantry on a wall cell can attack an enemy on an adjacent ground cell, for both sides. Infantry on a ground cell inside the city can attack an enemy on an adjacent wall cell. Use the existing frontage and height modifiers; if one is ambiguous, say which you chose in your report. Climbing positions on the outside of the wall keep their rules.
6. **Arriving through an open breach leaves the action.** One step through an open breach sets `moved` but not `acted`, so the unit can attack on arrival. A first mount, the one that completes the foothold, keeps today's behaviour.
7. **The ally on top makes way.**
   - A climb through an open breach is legal when the top holds an ally that has not moved today and a free walkway cell can be reached along the wall (through allies, not enemies) within the normal movement budget.
   - The ally moves to the nearest such cell. Ties go towards the nearer gate. The ally's `moved` becomes true, `acted` is unchanged. Log `allyMadeWay`.
   - `predictSiegeClimb` returns this in the forecast.
   - If the ally has already moved today, or cannot get out of the way, the climb is not legal. So one unit a day through one ladder still holds.
8. **Whoever stands on top decides the breach.** Extend `sealBreaches` into `updateBreaches`: a living Shu unit standing on the top of a usable raised ladder or filled wall foot sets that cell's foothold to 3, whichever way it got there. Wei standing on it still seals it, as in P4.
9. **Swap places: a new action, `{ type: 'swap', unitId, withUnitId }`.** Same side, both living. The other unit has neither moved nor acted, and is within the mover's reach counting the path through allies. They exchange cells and levels, and both become `moved`. Keep this out of `reachableCells`: add `swapTargets(state, unitId)`, so the AI's choices don't change through it.

## The AI

- `src/siege/ai/attacker.ts`: an infantry unit that can open the south gate does so, ahead of its other actions. A climb uses `predictSiegeClimb` to decide legality rather than checking for an empty top itself, so the AI benefits from rule 7. Otherwise leave its plans alone.
- `src/siege/ai/defender.ts`: no new behaviour beyond the shared movement. If the simulation throws an illegal-plan error, fix the cause.

## The interface

- **`resolveMapClick`** (from R) gets one new row, ahead of the plain move: with 移动 pressed, an ally in `swapTargets` means swap. Those allies get a blue outline in the overlay while 移动 is pressed.
- **开门**: a command shown only when the action is legal, full size, first in the list. Pick an existing icon.
- **Say what comes next.** A Shu infantry unit on the wall or inside the city gets guidance in `climbGuide` (or a sibling `nextGoalGuide`, whichever reads better), shown in the same context line, with the same gold frame and label on the target cell:

  | Situation                  | zh                                       | en                                                              | Frame label      |
  | -------------------------- | ---------------------------------------- | --------------------------------------------------------------- | ---------------- |
  | Gate closed, not there yet | 下一步：到门楼或门内开门，还差 {n} 格。  | Next: open the gate from its tower or just inside. {n} to go.   | 开门 / Open gate |
  | Can open now               | 可以开门：点「开门」。                   | You can open the gate: press Open gate.                         | none             |
  | A Wei unit on the gate top | 门楼上有守军（{name}），打下来才能开门。 | {name} holds the gate tower. Defeat that unit to open the gate. | none             |
  | Gate open or broken        | 城门已开：进前庭，还差 {n} 格。          | The gate is open. Take the courtyard: {n} to go.                | 前庭 / Courtyard |

  The target is the nearest free cell by actual walking distance. If an adjacent enemy is attackable, that does not change the sentence; 攻击 is already available.

- **Climbing sentences** replace P4's, for an ally on top:
  - The ally can make way: `ready`, zh: 点「登城」上墙，{name}会沿城墙让开。 en: Climb to go up; {name} will move along the wall.
  - The ally has moved today: zh: 上方的{name}今天刚到位，明天才能让开。 en: {name} only just got there and can make way tomorrow.
  - The ally is boxed in: zh: 上方的{name}被夹住了：先打掉旁边的守军。 en: {name} is boxed in above. Defeat the defenders next to it first.
- **Morning report**: `gateOpened`, zh: {unit}从里面打开了{gate}。 en: {unit} opened {gate} from inside. For Wei it sorts as a threat. Place names only, no coordinates.
- **Wei side**: add to the text shown when Shu has mounted, zh: 蜀军能直接下城，从里面开门：守住门楼。 en: Shu can step down inside and open the gate: hold the gate tower.
- **How to play**: update `howFootholdBody` and its neighbours in both languages to describe stepping down, opening the gate, passing through allies and swapping. Keep it short.

## Tests

- `tests/siege/roomToMove.test.ts`, through `applySiegeAction` and `reachableCells`:
  - Pass-through on the walkway, a ramp and open ground; can't stop on an ally; enemies still block; Wei too.
  - Step down from any south wall cell, not on the outside, not into a building; going up still needs a ramp.
  - Ramp cells enterable from the side; ramp top reaches the wall.
  - `openGate`: from the gate top and from inside; illegal with a Wei unit on the gate top, for archers, after acting, on a broken gate. Afterwards the road through the gate is walkable for Shu and the score sees the gate as lost.
  - Attacks down and up across the wall, for both sides.
  - Arriving through a breach leaves the action; a first mount does not.
  - Make-way: moves to the nearest free cell, through allies; sets `moved`; illegal if the ally moved today or is boxed in; one unit a day per ladder holds.
  - `updateBreaches`: a Shu unit walking onto a ladder top opens it; Wei seals it.
  - `swap`: both positions and flags; illegal if the other has moved; across levels.
  - The saved-game schema accepts `opened`.
- `tests/siege/climbGuide.test.ts`: every new row, in both locales.
- `tests/siege/mapClick.test.ts`: the swap row.
- `tests/e2e-siege/room-to-move.spec.ts`, 1280×720, zh and en, real clicks:
  - From the top of the west ladder with a clear path, step down and walk to just inside the south gate, with the context naming the distance and the frame on the target; press 开门; a unit outside walks through the gate.
  - A unit on the wall attacks a Wei unit on the ground below.
  - Three Shu units in a row on the walkway: the middle one walks past an ally.
  - With 移动 pressed, click an ally: they swap.
  - A follower climbs with an ally on top: the ally moves along the wall, the follower is on the wall and can still attack.
  - No panel scrolls.
- Update tests and specs that state the old rules. List every one you changed, with the reason. Do not delete coverage.

## Constraints

- Do not touch `src/v03`, tuning values, or generated art. An opened gate uses the existing broken-gate art for now; say so in your report.
- Keep Q's render separation and R's click rule.
- Your sandbox cannot start Chromium; the planner runs Playwright. Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege`, `npx vitest run tests/siege --maxWorkers=1`, and `node tools/siege-sim.mjs 200 --strict --output .artifacts/siege/sim-s.json`, and include the whole table. It will move and exit non-zero; `failures` in the output must be empty.
- Do not commit. Report what changed, every test you changed and why, the simulation table, and your interpretation of anything left open.
