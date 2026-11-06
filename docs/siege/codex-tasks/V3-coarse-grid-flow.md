# Codex task V3 — making the coarse board flow

Planned and validated by Claude; implemented by Codex. Third of three packages. V2 (`99c6b24`) is committed. A bot played a whole game with the real mouse with no dead clicks, so the board works. It also took about 40 clicks a day, half of them on units with nothing to do. This package fixes that, the ladder picture and the guidance.

The user's words: "尽量做完粗格子，不用改行动力这种规则". One move and one action a day stay. Saves don't matter: don't spend anything on them. Don't tune balance.

## 1. The raised ladder stands on its own cell

My V2 brief was wrong and you were right to flag it. The rules raise a ladder from row 10, across an unfilled moat, and climbers walk to row 10. V2 painted the feet on row 8, on the wall side of the water, so a ladder looks unreachable and its gold 梯底 frame is far from it.

- A raised ladder's feet are in the north part of its own row 10 cell, on the outer bank. Its top stays on the parapet of the wall cell. It spans the moat. Scale it uniformly from the alpha endpoints so the two ends land there, and remove the small V2 scales. Don't stretch it in one direction. Tell me the final scale, and if the ladder looks wrong at that size, say so instead of forcing it.
- Delete `ladderBase`. `engineFootprint` for a raised ladder is its logical cell plus the wall cell at its top. This also makes selecting it work again (see the failing `map-clicks` tests).
- Climbing figures use this new line from row 10 to the top. The row 8 base remains only for a climb at a filled wall foot, with no ladder: `climbingBase` must take that into account.
- A unit standing on the ladder's cell draws in front of the ladder's feet and stays selectable, as today.

## 2. A wreck doesn't occupy its cell

This is the one rule change in this package. `src/siege/rules/movement.ts:141` makes a wrecked engine occupy its ground cell. On the fine board that cost one of three bridge columns. On this board the bridge is one cell wide, so a burned ram seals the south gate for the rest of the game.

Wrecked engines occupy nothing: units and engines may enter and stop on that cell. The wreck art stays, drawn below any unit there. It's no longer selectable once something stands on it. Add a rule test for a wreck on `(8,8)` and on `(8,9)`, covering both routing and a new ram reaching the approach. Run the simulation, and report the before and after. Differences are expected, and they aren't a reason to tune anything.

## 3. Idle units cost no clicks

Add a pure helper in `src/siege/ui/`, working for either player side:

- `actorTodo(state, id, side)` returns `'act' | 'move' | 'none'`. `'act'`: it has a legal action available now: attack, climb, open gate, raise a ladder, ram, fill, build, whatever the panel can offer. `'move'`: only a legal move. `'none'`: spent, or nothing legal. Reuse the rule checks that enable the panel's buttons, not a copy of them.
- `nextActor(state, currentId, side)` returns the next actor in a stable order, units first and engines after: all `'act'` actors first, then all `'move'` actors. Null if there are none. It doesn't depend on UI state other than the arguments.

Behaviour:

- When the selected actor finishes (a command that leaves it `'none'`, or 待命), select `nextActor` automatically and bring it on screen. Move the camera only if it's outside a comfortable margin of the current view, and use the existing focus path. A unit that moved and still can act stays selected. A cancelled or failed command changes nothing. Automatic selection never happens during deployment, a replay, a modal or an armed command.
- `Tab` uses the same order, and also reaches `'move'` actors.
- The bar shows `下一队 (N)` / `Next (N)`, where N counts `'act'` actors. Clicking it does what Tab does.
- When no actor has `'act'` left, the 结束本日 button gets a visible but calm emphasis and the bar says 全军已无可执行行动 (with `'move'` actors remaining, say how many can still move). Don't end the day by itself.
- Plates: `'none'` is dimmed as now. A small marker on `'act'` plates shows who has something to do.
- A morale or status line in the panel doesn't count as a todo. Check this in the bot.

Unit tests for `actorTodo` and `nextActor`, including a unit that has just climbed, a ladder that is already raised, a ram not on an approach, and a dead unit.

## 4. Target icons

With an own actor selected and able to act, draw a small icon on each legal target, without arming 攻击 first:

- sword for melee, bow for ranged, hammer for a ram or an attack on a gate. Others that exist in the rules (burning, say) get their existing icon if any.
- Placed at the top right of the target's plate, or at the gate's anchor for a gate. One shared `<symbol>` per icon, `<use>` per target. Vector, no generated art; reuse the panel's icons if they exist as vectors.
- Clicking an icon or its target opens the existing forecast, as a click on an enemy already does when an own actor is selected. Confirm it's one click to forecast and one to confirm.
- Targets are computed from the same rules as the panel. If the 攻击 button is enabled there's at least one icon, and the reverse. Test both directions over the fixtures. The armed attack mode continues to work.

## 5. A panel that doesn't move

Commands are reordered by availability today: 移动 changes place between units. Muscle memory never forms. Give each actor type a fixed layout: a command always occupies the same grid slot, greyed when unavailable. Commands that can't apply to the type at all aren't shown. Test that a command's slot is the same across fixtures of different states. The panel must not scroll at 1280×720; the existing no-scroll checks cover it.

## 6. What's under the cursor

A thin line in a fixed place, not a floating tooltip, showing the hovered position: name (南墙西段·墙顶), terrain and height, what stands there, and the defence or cover it gives if the rules define one. Empty when not hovering. Update it from the existing `hover` path imperatively, with no React render of the map per mouse move: keep the existing render-count assertion and add this to it. Keep the minimap visible at all zoom levels, including with this line present.

## 7. Guidance that tells the truth on this board

Go through `climbGuide`, `nextGoalGuide`, the walkthrough and howToPlay, in Chinese and English, and make each sentence true on the coarse board. Known problems:

- A unit that has already acted today is told "下一步：到门楼或门内开门，还差 3 格" with a gold frame, though it can't move. Say it's done for today and what it will do tomorrow, and draw no frame.
- A ram not on the gate approach needs a line saying where to go (`(8,8)`), with the frame. Same for the earth cart and an unraised ladder.
- Any text that talks about fine cells, tiles of a given size, or distances from the old board.
- Row 8 versus row 10: 梯底 is row 10; 墙根 is row 8.

Keep the walkthrough's 9 steps unless a step has become meaningless. If so, tell me.

## 8. Browser tests

I ran your migrated tests: 97 of 108 pass. Failures and what I think they are. You can't run Chromium, so read the test, reason it through, and fix the test or the code. I'll run them again.

| Test | Failure | My reading |
|---|---|---|
| `climb-guide.spec.ts:325` (zh, en) | expected `walkToBase`, got `allyAbove` at `(6,9)` | Is the guide or the fixture right for a unit one row from the foot of an occupied wall? Decide and say. |
| `map-clicks.spec.ts:61` walkway, day9 (zh, en) | a raised ladder isn't selected by a click on its logical cell | Fixed by §1. Check. |
| `map-clicks.spec.ts:195` | no `[data-overlay="hover"]` in the dev scene | Preview has no hover overlay, or the point lands on nothing. Move the test to a real battle. |
| `render-v02.spec.ts:81` | `[data-gate-top="gate-south"]` count 3, expected 1 | The attribute is per figure. Assert on the unit. |
| `screens.spec.ts:60` | `assault-toggle` never appears | Weiyan isn't adjacent to wei-captain-1 in that fixture. |
| `shu-v02.spec.ts:20` | walkthrough missing after `begin` | A fresh game does show it (the bot saw it). The fixture moves units, and that loses it. Fix the fixture or the condition, whichever is wrong. |
| `speed.spec.ts:98` | never reaches battle | The fixture uses `y = 25`, off the board, so the save is rejected. |

Add browser tests for: automatic next actor with the camera, target icons, the fixed panel, the hover line, and walking onto a wreck on the bridge. Prefer `window.__siegeGeometry` over pixels.

## Validation you can run

```bash
npx tsc --noEmit
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
node tools/siege-sim.mjs 40 --output .artifacts/siege/sim-v3.json
npx vite build
```

Everything in `tests/siege` must pass. Regenerate fonts if you add Chinese characters. Update plan §5.14 or §5.15, §8, and `docs/siege/00-progress.md`, in Chinese. Don't commit: I validate and commit. Don't touch `src/v03` except the route parser, and no generated art.

Report: files, the ladder's final scale, the simulation before and after §2, what you chose where the brief left it open, each row of the table above and what it turned out to be, and anything you couldn't do.
