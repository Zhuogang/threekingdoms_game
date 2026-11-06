# Codex task V5b — fixes from reviewing V5

V5 is uncommitted in the working tree: keep it and build on it. Don't commit. Saves don't matter. Don't change when victory is decided. Don't tune anything.

The gate work reads well in the pictures: leave it alone. The rout morale award is good apart from item 2.

## 1. The strike is invisible, and the tests can't see that

I sampled a real attack in a browser, starting before the click. The hit happened at about 7.4s of the SVG document's time:

```
t=181ms   opacity 0   doc 7.43   getStartTime: "No current interval"   text "-941Routed"   effect opacity 0
t=543ms   opacity 0   doc 7.80   ...
t=1026ms  opacity 0   doc 8.28   ...
```

Opacity is 0 on every frame of the hold, so the player sees no number and no strike. SMIL's default `begin="0s"` is relative to the SVG document's timeline, not to when the element is inserted. An `<animate>` inserted after the document started has already finished, and with `fill="freeze"` it sits on its last value from the first frame. The `strike-result` test passes because it reads `textContent`.

The same mistake affects `BattleEffect`. Before V5 it had no `fill`, so a finished animation fell back to a static, visible image. Adding `fill="freeze"` has made it invisible in **replay as well**, which is a regression for enemy turns.

Fix:

- Replace SMIL in `StrikeResults` and `BattleEffect` with CSS keyframes in `src/siege/ui/siege.css`, because they start when the element is inserted. Don't use `beginElement()`.
- `StrikeResults`: keep the outer `<g transform="translate(x y)">` for position, since CSS `transform` would replace that attribute. Put the animation on an inner `<g>`: rise 24 map pixels over the hold, fully opaque for the first 70%, then fade to 0, ending there with `forwards`. Take the duration from the existing `strikeHoldMs` prop through an inline `animationDuration`, so there's one source of truth.
- `BattleEffect`: the line and the impact image play once and end at opacity 0 with `forwards`. Make both last 500ms, because 300ms is too short to read as a blow. Reach full opacity within the first 100ms: a replay frame lasts only `REPLAY_STEP_MS` (130ms) before the next frame replaces or removes the element, and a slow ramp would never show there.
- Under `prefers-reduced-motion: reduce`, drop the rise and keep the fade.
- Leave the other `<animate>` elements alone: looping flames and the night replay aren't part of this.

Tests must now fail on the old code:

- `strike-feel.spec.ts`, first test: sample `getComputedStyle` per frame, starting as soon as the strike appears. For the inner animated group, computed opacity must be at least 0.9 until 600ms and must have dropped below 0.5 by the end of the hold. The `getBoundingClientRect` top of the group must have risen. Reading `textContent` alone isn't enough.
- Same spec: the impact image must reach computed opacity above 0.5 within the first 300ms after the click, on a player's attack.
- A new case: during an enemy's replay on the Shu side, a strike's impact image, when inserted, has a CSS animation that is running rather than finished. A replay frame is too short to sample opacity reliably under load, so install a `MutationObserver` before ending the day and read `element.getAnimations()` in its callback. Use a fixture where the AI will attack, and reason it through, because I'll run it as written.
- A unit test or source check that neither `StrikeResults` nor `BattleEffect` renders an `<animate>` or `<animateTransform>`.

## 2. The forecast is wrong for a Wei unit on the wall

In `predictSiegeAttack`, `counterSettled` and `sourceActive` treat any unit on the wall as surviving a morale fall by landing at `ROUTED_MORALE`. Only a Shu unit does that: `settleUnitRout` throws it off the wall. A Wei wall unit routs with its real morale, and `gainWall`'s floor doesn't apply. So when a counterattack would rout a Wei wall attacker, the forecast shows morale at `ROUTED_MORALE`, and can add a rout gain it never gets.

Limit both conditions to `source.side === 'shu'`. Add a unit test: a Wei attacker on the wall, whose counterattack routs it, on a target that also breaks. The forecast's `sourceMoraleAfter` and `sourceRoutMoraleGain` must equal the real result.

## 3. Stand by shouldn't wait

`command('standby')` now goes through `holdAdvance(next, ACTION_HOLD_MS)`. Standing by shows nothing, and the player pressing it wants the next unit, so the wait only makes a run of stand-bys sluggish. Call `chooseNext(next, true)` at once instead: the selection moves immediately, and the camera still pans smoothly if it has to. Fix any test that this breaks and name it.

## Validation you can run

```bash
npx tsc --noEmit
npx prettier --check src/siege tests/siege tests/e2e-siege
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
npx vite build
```

Your sandbox can't run a browser, so I'll run the specs and look at the frames.

Report, briefly: what changed, the keyframes you chose, each existing test you changed and why, and anything not done.
