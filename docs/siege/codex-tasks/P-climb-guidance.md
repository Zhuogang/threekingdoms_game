# Codex task P — a new player must be able to find out how to climb

Planned and validated by Claude; implemented by Codex. This comes from the user's first playtest of v0.2. In their words:
"我没搞清楚如何登城，这个引导不清楚，我把部队移到云梯地下了，但是登城的tab还是灰色".

## What the planner reproduced in the real interface

Fresh Shu game, no redeployment. Select 魏延 at (20,21), press 移动, click the green cell directly south of the ladder. 登城 stays grey,
and the only line in the panel is "选择行动；指向灰色行动可查看原因。". Hovering says "请从梯底或墙脚攀爬至无守军的墙格。". The player believes they
are at the foot of the ladder, so that sentence reads as nonsense. There are four causes, all verified, and all need fixing:

1. **No unit can reach a ladder on day 1.** Ladders start at (18,19) and (29,19). The nearest infantry, 魏延, is 4 cells away with a budget of
   3; at the east ladder the nearest is 7 away. `tests/e2e-siege/shu-v02.spec.ts` hides this by redeploying 魏延 first.
2. **An unraised ladder's cell cannot be entered** (`src/siege/rules/movement.ts`, `raisedLadder`), so a player who walks over first can only stop
   next to it, which is exactly what looks like "under the ladder", and they have then spent their move.
3. **One sentence covers every failure**: not raised, not on the exact cell, defender above, already acted, cell taken, no ladder left. It is also hidden
   behind a hover.
4. **"云梯底下" / "梯底" is never defined.** The cell directly south of the ladder is visually "below" it. Nothing on the map marks the base unless the
   walkthrough happens to be on step 3.

The acceptance question: **a player who has read nothing selects any Shu infantry, and can see without hovering what stands between this unit and climbing, and
exactly which cell to go to.**

## Changes

### Rules

1. `movement.ts`: every usable ladder's cell admits troops, raised or not, so the order of raising and walking stops mattering. Wrecked ladders and all other
   engines still occupy their cell. Update the comment and any test that states the old rule. Only one unit may stand there, as before.
2. `state.ts`: new-game starting positions: `shu-weiyan` at (18,21) and `shu-captain-2` at (29,21), both 2 cells from a ladder base. Everyone else keeps their
   cell. No save format change; existing saves must still load and continue unchanged.
3. Nothing else in the rules changes: no tuning values, nothing in the AI unless a test proves it is broken by (1) or (2).

### A single source of truth for what blocks climbing

4. Add a pure helper, `climbGuide(state, unitId)`, in a new file `src/siege/ui/climbGuide.ts`, built on the existing `predictSiegeClimb`, `climbingPosition`,
   `isWallFoot` and `reachableCells`. It returns `null` for anything other than an active Shu infantry unit on the ground, otherwise one of the following,
   checked in this order:

   | kind              | when                                                                 | carries                                                     |
   | ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
   | `acted`           | the unit has already acted today                                     |                                                             |
   | `ready`           | `predictSiegeClimb` returns a forecast                               | `position`, `gain`, `top`                                   |
   | `defenderAbove`   | standing on a climbing position whose wall cell holds a living enemy | `defenderId`, `top`, `base`                                 |
   | `ladderNotRaised` | the chosen route is an unraised ladder                               | `ladderId`, `base`, `atBase`, `steps`                       |
   | `walkToBase`      | the chosen route is a raised ladder or a filled wall foot            | `route`, `base`, `steps`, `canReach`, `moved`, `occupiedBy` |
   | `noRoute`         | no usable ladder and no filled wall foot                             |                                                             |

   The route is the closest usable ladder or filled wall foot by Manhattan distance. Ties go to a raised ladder or wall foot first, then to the lowest x, so the answer is stable.
   A base held by a living ally does not stop it being chosen, but sets `occupiedBy`, unless another route is free at the same distance, which then wins.
   `canReach` means the base is in `reachableCells` today. `moved` means the unit has already moved today. For `defenderAbove`, check the ladder raised above this cell
   and the cell directly north of a filled wall foot; do not duplicate the geometry, use `climbingPosition`.

5. Add `climbGuideText(guide, locale, nameOf)`. These sentences go in `src/siege/i18n/zh.ts` and `en.ts`, keeping the existing `contextLadder`, `contextMound` and `contextWallFoot` for `ready`.
   Use these words; adjust only if a test shows they cannot fit:

   | case                                  | zh                                                     | en                                                                                    |
   | ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
   | `acted`                               | 今天已行动，明天才能攀爬。                             | Already acted today. It can climb tomorrow.                                           |
   | `defenderAbove`                       | 头上有守军{name}，不能攀爬：用「攻击」或强攻积累立足。 | {name} holds the wall above. Attack or assault to build footholds.                    |
   | `ladderNotRaised`, at base            | 云梯还没架起：选中云梯点「架梯」，再点「登城」。       | The ladder is not raised. Select it, press Raise ladder, then Climb.                  |
   | `ladderNotRaised`, not at base        | 云梯还没架起：选中云梯点「架梯」，部队再移到金框。     | The ladder is not raised. Select it, press Raise ladder, then move to the gold frame. |
   | `walkToBase`, ladder, can reach       | 要站到金框（云梯所在那一格）才能登城，还差 {n} 格。    | Stand on the gold frame, the ladder's own cell, to climb. {n} cells away.             |
   | `walkToBase`, wall foot, can reach    | 要站到金框（填平的墙脚）才能登城，还差 {n} 格。        | Stand on the gold frame, the filled wall foot, to climb. {n} cells away.              |
   | `walkToBase`, cannot reach, not moved | 金框还差 {n} 格，今天走不到：先走近，明天再上。        | The gold frame is {n} cells away, too far today. Move closer and climb tomorrow.      |
   | `walkToBase`, already moved           | 金框还差 {n} 格，今天已移动：明天再走。                | The gold frame is {n} cells away and this unit has moved. Continue tomorrow.          |
   | `walkToBase`, `occupiedBy` set        | 金框已被{name}占住：换一架云梯，或让它先走。           | {name} holds the gold frame. Use another ladder or move it first.                     |
   | `noRoute`                             | 云梯都没了：去工棚补造，或填平城堑从墙脚攀爬。         | No ladders left. Build one at a workshop, or fill the trench and climb the wall foot. |

### Interface

6. `action-context` (`actionContext` in `src/siege/ui/commands.ts`): for a Shu ground infantry unit, always show the guide's sentence. It is permanently visible, needs no hover, and
   replaces the `{place} · {level}` line for these units; the card above it already shows the place. All other actors keep today's behaviour, including 此处可填城堑 where it applies today:
   when filling is possible and the guide is not `ready` or `defenderAbove`, show the fill sentence first, then the guide sentence after it.
7. The grey 登城 button's `title` and the `action-reason` line show the guide's sentence, not the generic rejection. Do not change the validator's string in `actions.ts`; callers other than this button still need it.
8. **Mark the cell on the map.** While a Shu ground infantry unit is selected, outside deployment and replay: outline `guide.base` with the same gold frame as the walkthrough
   (`tutorialCells`), and add a small text label on it: 梯底 / Ladder base, or 墙脚 / Wall foot for that route. For `ladderNotRaised` the label is 未架起 / Not raised. Combine this with the walkthrough cells instead of replacing them.
   Labels live in the map's SVG, must stay readable at 75%, 100% and 150% zoom, and must not capture clicks: the cell under a label stays clickable, and a move onto a labelled reachable cell must work. No label when the guide has no `base`, and none for `ready`, since the unit is already there.
9. **Pressing a grey 登城 teaches.** It changes no game state, keeps today's explanation line, and pans the map to `guide.base` using the existing `focusPlace` mechanism, the same one report items use.
10. The selected ladder's panel: while `架梯` is available, its context line says what raising does: 架起后步兵才能从这一格登城。/ Infantry can climb from this cell once it is raised.

### Walkthrough

11. Replace the text, in zh and en. `walk1`: 先架梯。点地图上金框里的云梯。 `walk2`: 点「架梯」，云梯就搭上城墙。 `walk3`: 选一支步兵，移到金框那一格，也就是云梯所在的格子，它下面一格不算。 `walk4`: 点「登城」攀爬，立足 +{gain}；满 {max} 才站上城墙。梯顶有守军就改点「攻击」。 Write the English equivalents plainly.
12. `advanceWalkthrough`, Shu step 3: infantry standing on the ladder's cell completes the step however it got there, including moving before the ladder was raised. Remove the requirement for a `move` log event after the cursor.
13. The walkthrough must be able to reach step 4 on day 1 from the default deployment, with either ladder.

### How to play

14. `howLadder`, `howFootholdBody` and the English equivalents: define 梯底 as the ladder's own cell, marked with a gold frame when an infantry unit is selected, and say that the ladder must be raised before climbing.

## Tests

15. Unit tests in `tests/siege/climbGuide.test.ts`: every row of the table in item 4 and every sentence in item 5; the route tie-break; wall-foot routes; a wrecked ladder is not a route; zh and en keys exist for every kind.
16. Unit tests: a unit can stand on an unraised usable ladder, and raising with a unit standing there works; a wrecked ladder and other engines still block; from `createSiegeState`, each ladder's cell is in `reachableCells` of at least one Shu infantry on day 1; all starting units stand on free passable cells inside `DEPLOY_SHU`; walkthrough step 3 completes for a unit that arrived before the ladder was raised; a save made before this change, using the old starting positions, still loads.
17. New `tests/e2e-siege/climb-guide.spec.ts` at 1280×720, with real mouse clicks through `clickCell`, and without redeploying anyone:
    - Select 魏延 before raising. The `action-context` shows the not-raised sentence without any hover, and the gold frame and its label are on (18,19).
    - Pressing the grey 登城 changes no state (compare snapshots), and leaves the explanation line showing the same sentence.
    - Move onto (18,20), the cell directly south of the ladder. The context now states the distance, and 登城 stays grey.
    - Order A, on a new game: raise, move onto the base, 登城, and confirm. The walkthrough reaches step 4 on day 1 and the foothold becomes 1.
    - Order B, on a new game: move onto the base first, then raise. 登城 becomes available and the walkthrough reaches step 4.
    - Same flow at the east ladder with `shu-captain-2`.
    - A fixture with a defender above the base shows `defenderAbove`, and 攻击 is available.
    - No panel scrolls in any of these states, in zh and in en (`expectNoPanelScroll`).
18. Update existing specs and tests that relied on the old start or the old rule. `shu-v02.spec.ts` no longer needs to redeploy 魏延. If a test asserted the old behaviour on purpose, change it and say so in your report; do not delete coverage.

## Constraints

- Do not touch `src/v03` or generated art. No new dependencies. Follow the style of the surrounding code, and keep player-facing text free of coordinates.
- Your sandbox cannot start Chromium. Write the Playwright specs carefully; the planner runs them.
- Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege`, `npx vitest run tests/siege`, and `node tools/siege-sim.mjs 200 --strict`, and include the simulation's whole table in your report. It is expected to exit non-zero, because some targets were already missed. **Do not tune anything to chase those numbers.** The planner decides what to do if the order brute < careful < anyPrice breaks.
- Do not commit. Finish with a short report: what changed, which tests changed and why, the simulation table, and anything you could not verify.
