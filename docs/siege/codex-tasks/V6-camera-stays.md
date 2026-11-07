# Codex task V6 — after an action, stay on the unit

The user, after playing V5: "不要自动给我调镜头", then, on reflection: "当我选择了一个部队，镜头确实可以 follow 那个部队，只是完成动作之后不要自动跳走". So the camera may follow a unit the player selects, but finishing an action must not jump away.

V5 is committed and the working tree is clean. Don't commit. Saves don't matter. Don't change when victory is decided. Don't tune anything. The user's laptop may be in use, so run only the light checks listed at the end.

## The rule

The game no longer picks the next unit for the player. After any action the selection stays on the unit that acted and the camera doesn't move. The player moves on with Next, Tab, the roster or a click on the map.

## `src/siege/ui/SiegeApp.tsx`

1. **After an action:** remove the auto-advance. `act()` keeps the strike presentation and its 1100ms hold, whose only job now is to show the strike and then clear it. Remove `finished`, the `advance` parameter and `ACTION_HOLD_MS`. Non-strike actions no longer hold at all.
2. **Stand by:** remove `chooseNext(next, true)`. The unit is marked and stays selected.
3. **Next button and Tab:** these are now the only callers of `chooseNext`. They select the next actor and call `reveal` with `{ smooth: true }`. Drop `chooseNext`'s parameters.
4. **Roster entries:** both the unit and the engine lists call `reveal` with `{ smooth: true }`.
5. **Clicking a unit on the map** stays as it is, with no camera move: the player can already see it.
6. **The unit that acted is gone:** a counterattack can kill or rout the acting unit. Previously the advance hid this. In `act()`, if the acting unit is dead or off the board in `result.state`, set the selection to null rather than leaving a ghost or picking another unit. Check how the code represents this (`troops`, `isMapCell`, rout handling) and confirm that the panel renders with a null selection. The Wei side starts that way.
7. Rename `holdAdvance` and `cancelAdvance` to say what they now do, for example `holdStrike` and `clearStrike`. Every input that cancels today keeps cancelling.

Check `settleWalkthrough` and `walkthroughTargets`: if a tutorial step relied on the selection moving by itself, tell me rather than patching over it. Check the how-to-play text and `src/siege/i18n/{zh,en}.ts` for anything that says the game moves on by itself, and correct it.

## `src/siege/render/SiegeMapView.tsx`

`reveal` keeps its `smooth` option, its tween and its 12% margin. The grey Climb command's `focus(base)` and every explicit camera button stay as they are.

## Tests

Your sandbox can't run a browser, and I'll run these as written, so reason through each fixture. State the off-screen precondition in the test itself, so that a test can't pass because the next unit was already in view.

`tests/e2e-siege/helpers.ts`: smooth roster selection means `selectActor` can return mid-pan. After the roster click, wait in the page until `viewBox` has been identical for three consecutive animation frames. Check for tests that click `select-…` directly and give them the same wait.

Add `tests/e2e-siege/camera-stays.spec.ts`. Each case compares the `viewBox` attribute of `siege-map`, read before and after, and rereads 500ms later to catch a late move:

1. An attack, with the other actors off-screen: after the strike has cleared, `data-selected` is still the attacker and the camera is unchanged. Then clicking Next selects the next actor, and the camera ends with it comfortably inside the frame (the 12% margin).
2. A non-strike action that leaves the unit with nothing to do (use `actorTodo` to prove that in the fixture): selection and camera unchanged.
3. Stand by, on both sides (`shu` and `wei`): the unit is marked, selection and camera unchanged.
4. A move: selection and camera unchanged.
5. A full end of day through the replay and closing the morning report, after panning somewhere unusual: camera unchanged. This also proves the map doesn't remount.
6. Next, Tab and a roster entry, each with an off-screen target: the camera ends with the target inside the frame. Each with a target already comfortably inside: the camera doesn't move.
7. An attacker killed by the counterattack, with other units alive: selection is empty, the panel renders, no page errors, camera unchanged.

Existing tests that assert the old behaviour must change. Start with these, and name each one in your report:

- `tests/e2e-siege/coarse-flow.spec.ts`: "standby immediately selects the next executable actor and smoothly reveals it", and "a nearby next actor keeps the camera". Also remove the latter's `waitForTimeout` and its comment that the camera follows a move.
- `tests/e2e-siege/strike-feel.spec.ts`: the first test's "then advances within 1600ms", and the two tests about a pending advance. Next during a strike must still work and select once.
- Every other use of `command-standby`, `attack-confirm`, `climb-confirm`, `data-selected` or `next-actor` in `tests/e2e-siege/` (`figure-clicks`, `climb-guide`, `map-clicks`, `shu-v02`, `room-to-move`), and any use of `ACTION_HOLD_MS` or the advance in `tests/siege/`. A flow that relied on the advance should call Next or `selectActor` explicitly. Don't weaken what it checks.

## Validation you can run

```bash
npx tsc --noEmit
npx prettier --check src/siege tests/siege tests/e2e-siege
```

Skip vitest and the build: I'll run them.

Report, briefly: what changed, how a gone actor is detected, what you found in the walkthrough and the how-to text, each existing test you changed and why, and anything not done.
