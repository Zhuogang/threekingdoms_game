# Codex task V5 — strike feel, units inside gatehouses, morale for a rout

From the user's playtest of V4. Their words: "攻击手感很奇怪，点击攻击之后，至少应该停顿一下，或者如何，但是你点击了，直接整个画面框框就移动了！另外，魏延卡到城门楼里面了，另外，击溃敌军应该涨士气！"

Work on `siege_v0.2`. Don't commit. Saves don't matter: no migration, no save-version work. Don't touch `src/v03` except the route parser. Don't hand-edit generated art. Don't tune anything beyond the numbers given here.

**Do not change when victory is decided.** The user was asked about this and said to leave it. `siegeOutcome` still resolves victory at the end of the day, even when no Wei unit is left. Don't add a banner, hint or button about it either.

## 1. An attack needs a beat

### What happens now

In `SiegeApp.tsx`, `act()` applies the action and, if the actor has nothing left to do, calls `chooseNext(result.state)` in the same tick. `chooseNext` selects the next actor and calls `map.current?.reveal(...)`, which can recentre the view at once. `effectAction` is only ever set during replay, so a player's own attack draws no strike at all. The player clicks, the selection and possibly the whole view jump elsewhere, and they never see what their attack did.

### What it should do

1. **Show the strike.** For a player's `attack` (unit or engine, unit or gate target), `ram`, `suppress`, `fireArrows`, `dropMillstone` and `dropBoulders`, set `effectAction` as replay does, using the positions from before the action. A routed wall defender moves during the action, and the effect and the numbers must point at where the blow landed.
2. **Show the result.** Add a small non-interactive SVG layer on the map, `data-testid="strike-result"`:
   - Enemy losses as `-312` above the target, in red. For a gate, the durability lost above the gate cell.
   - Own losses from a counterattack as `-40` above the attacker, in the same style.
   - `溃散` / `Routed` above a target that broke (section 3 defines "broke").
   - `士气 +10` above the actor when section 3 awards it.
   - Each rises about 24 map pixels and fades over the hold. Read the values from the action's result, not from a second calculation. Keep them legible at the default zoom. They take no pointer events.
3. **Hold before moving on.** Replace the immediate `chooseNext` with a timer: `STRIKE_HOLD_MS = 1100` after the strike actions above, `ACTION_HOLD_MS = 450` after any other action that finishes the actor. Selection, panel and camera all stay where they are during the hold. Put both constants in one place near the top of the file.
4. **Never lock input.** The hold is not a modal. Any of these cancels the pending advance, and the player's input takes effect at once: selecting a unit or engine, the Next button (it advances immediately), arming a command, another action, ending the day, opening the how-to, or a load. Cancel also when `playing`, `banner`, `reportVisible`, `opening` or `howTo` becomes true. Clear the timer on unmount. Panning or zooming during the hold doesn't cancel the advance.
5. **Clear the strike when it ends.** Clear `effectAction` and the result layer at the end of the hold or on cancel. `BattleEffect`'s image animates opacity `0;1;0` with no `fill="freeze"`, so it pops back to full opacity when the animation ends. Replay hides this by moving on. Fix it so that a strike held for 1100ms doesn't leave a stuck icon or dashed line, and check that replay still looks the same.
6. **Pan, don't jump.** When the auto-advance has to move the camera, tween the viewport over about 320ms with an ease-out, in `SiegeMapView`. Add an option to `reveal`, such as `reveal(position, { smooth: true })`, and use it only for this auto-advance. The Next button and roster clicks stay instant, because tests and players click right after them. A user's pan, zoom or a new `reveal` cancels a running tween. Honour `prefers-reduced-motion` with an instant move. If the target is already in view, the camera doesn't move, as today.

If the actor has more to do, or there is no next actor, the strike still plays and clears, and nothing else moves.

## 2. Nobody stands inside a gatehouse

### What happens now

Both planes of all four gate cells sort behind their own gate tower. A unit there shows only as the yellow silhouette through the building, which is what the user saw:

| Position | Foot | Covered by |
|---|---|---|
| (8,7) wall, (8,7) ground | (1536,720), (1536,792) | `gate-south`, row 16 |
| (8,2) wall, (8,2) ground | (1536,144), (1536,216) | `gate-north`, row 4 |
| (4,5) wall, (4,5) ground | (928,432), (928,499) | `gate-west`, row 11 |
| (12,5) wall, (12,5) ground | (2144,432), (2144,499) | `gate-east`, row 11 |
| (8,6) ground | (1536,652.8) | `gate-south`: the yard cell directly behind the gate, whose roof rises to y=591 |

See `?siege-map&scene=board`.

### What it should do

1. A living unit on a gate cell, on either plane, draws in front of its gate tower and that tower's parapet, as a normal figure with no silhouette. Do it through `depth` in `unitVisual`, the way `preparationSprites` gives a hoisted millstone its explicit depth (`src/siege/render/v02Art.ts:157`): row at least the tower's `cells[3]`, height above `tower.height`. Use `gateTowerAt` for a gate cell. Make sure this also holds against the broken-gate patch occluders in `gatePatches`, and that a unit in a row further south still draws in front of the gate-cell unit.
2. For (8,6) ground, move the foot out from behind the roof rather than drawing a man on the roof: change `ANCHOR_OVERRIDES['8,6']` so the foot is just north of the ridge, around fine row 12.25 (y≈588), and clamped inside its hit rect. Check that it doesn't collide with a unit at (8,5).
3. Rules, legal moves and hit rectangles don't change. Check figure picking still works on each of the nine positions, including `pickFigureArt`'s use of the moved anchor.
4. Add a render scene `gates` to `RENDER_SCENES`: one unit on each gate top, gates intact. Add `gatesGround`: one unit in each gate mouth with all gates broken, plus one at (8,6) ground. I'll review both as pictures.
5. Don't change anything for units behind other buildings. The silhouette for those is the approved design.

If one of the nine still reads badly once it is in front, say so in your report and describe what you see. Don't change its art.

## 3. A rout raises morale

New numbers in `SIEGE_TUNING`: `routMoraleSource: 10`, `routMoraleNearby: 5`, `routMoraleRadius: 2`.

**A unit broke** during an action if it was `activeUnit` before the action and either isn't `activeUnit` after it, or was a Shu unit thrown off the wall by that action (`settleUnitRout`'s `thrownOffWall` path, which leaves it nominally active). Annihilation counts.

**Award it in one place**, in `applySiegeAction` after `performAction`, by comparing the unit list before and after. Don't add it to each action's code path:

- For each enemy of the acting side that broke: the acting unit gains `routMoraleSource` if it is a unit and still active. An engine gains nothing. Every other active unit on the acting side within `routMoraleRadius` of the broken unit's position before the action gains `routMoraleNearby`.
- If the acting unit itself broke to a counterattack on an `attack` with a `targetId`, and that target is still active, apply the same award to the target's side, with the target as the source. Own-side units broken by `assaultCosts` morale losses earn the enemy nothing.
- Cap at `moraleMax`. A unit that isn't active gains nothing, and a gain never clears `routed`.
- It applies to both sides, so the AI's actions get it too. Night resolution in `endDay` is out of scope.
- Log one event per unit that gains, `routMorale`, with `{ unitId, routedId, before, after, role: 'source' | 'nearby' }`, in the style of `assaultMorale`. Don't add it to the morning report.

**Forecast.** `sourceMoraleAfter` in `predictSiegeAttack` must include the source's gain when the target would break and the source stays active, so the forecast matches what happens. Add `routsTarget: boolean` to the forecast. Show it in `SiegeForecast`, for example `可击溃，士气 +10`, using i18n keys in both locales. Also add one line to the how-to-play rules saying a rout gives the unit +10 and allies within 2 cells +5, using the tuning numbers rather than literals.

Regenerate the font subset if you introduce a new glyph, as in V4.

## Tests

Write these, and make them fail on the old code where that is possible:

- Unit: a rout, an annihilation, a thrown-off Shu unit, a counterattack rout, the cap at 100, no gain for a routed friend, no gain beyond the radius, an engine as the actor, an own-side rout from `assaultCosts`, and forecast `sourceMoraleAfter` equal to the real result on a rout.
- Unit: depth of all eight gate-cell positions is in front of every slice of their tower. A hold-cancel helper, if you extract one.
- Browser, new `tests/e2e-siege/strike-feel.spec.ts`, driving the real mouse on the real app:
  - After confirming an attack with an actor that then has nothing left to do: for 900ms the selected unit and the SVG `viewBox` don't change and `strike-result` is visible with the casualty number from the log; within 1600ms the selection has moved to the next actor; afterwards `strike-result` is gone.
  - Clicking another unit during the hold keeps that unit selected and no advance fires after it.
  - The Next button during the hold advances at once and only once.
- Browser: a unit moved through a broken south gate into (8,7) ground, with no silhouette (`[data-covered-unit]`) for it, then clickable at its figure.

Some existing tests assume the next actor is selected in the same tick as the action. Fix them to wait for it, name each one in your report, and don't add a test-only way to skip the hold. Existing tests with hard-coded morale after a rout need the new value: name those too.

## Validation you can run

```bash
npx tsc --noEmit
npx prettier --check src/siege tests/siege tests/e2e-siege
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
npx vite build
```

Your sandbox can't run a browser, so I'll run the browser specs and review the scenes. Reason your e2e specs through against the code, because I'll run them exactly as written.

If a siege AI-versus-AI simulation exists in the repo, run it on the same seeds before and after section 3, and report the win rates. Don't tune anything because of it.

Report, briefly: what changed, each existing test you changed and why, how you read anything the brief left open, and anything not done.
