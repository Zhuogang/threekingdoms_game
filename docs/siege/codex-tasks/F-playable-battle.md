# Codex task F — playable siege battle (M4, part 1 of 2)

Planned and validated by Claude; implemented by Codex. Plan:
`docs/siege/02-chencang-mvp-plan.md` §3 (flow), §6 (2.5D rendering), §7 (UI),
§9 (code layout), §11 (acceptance). The rules (`src/siege/rules`), AI
(`src/siege/ai`) and the dev preview `?siege-map`
(`src/siege/dev/SiegeMapPreview.tsx`, `src/siege/render/*`) already exist and
are tested; the art is in `docs/siege/chencang/art/` (each folder's README and
`generation-manifest.json` say which file is the pick and how it is cut).

## Goal

From the start screen a player can open the Chencang campaign, deploy, and play
day after day against the Wei AI to an outcome, on the real 2.5D map, with all
the information §7 asks for. Story screens, banners, hints and the summary are
task G; here an outcome shows a plain placeholder ending panel.

## Constraints

- In `src/v03` change **only** `src/v03/ui/screens/StartScreen.tsx` (add the
  campaign card and its route; additive, existing behaviour unchanged) and, if
  routing requires it, the smallest additive change in `src/v03/App.tsx`. Reuse
  v0.3 UI kit, language switching (`src/v03/i18n`), portraits and viewport/pan
  code by importing them; do not edit them.
- Rules may change only to fix a bug you can show with a test; if you do, say
  so. Keep `npx vitest run tests/siege` green and the §5.3 sim targets
  (`node tools/siege-sim.mjs 200`) unchanged.
- New code in `src/siege/ui/`, `src/siege/render/`, `src/siege/save.ts`,
  `src/siege/i18n/`; tests in `tests/siege/` and a Playwright spec in
  `tests/e2e-siege/` with its own config `playwright.siege.config.ts` (copy the
  v03 config's shape, its own port and output dir).
- No `git commit`.

## Rendering (`src/siege/render/`)

Extract the map drawing from `SiegeMapPreview.tsx` into a reusable `SiegeMapView`
that takes a `SiegeState` (and selection/highlight props) and draws:

- the S2-01 painting with S3 patches chosen **per state**: each gate by its
  durability (damaged below half, broken at 0); the south trench **per cell**
  from `trenchFill` (half ≥ 1.5, filled at 3), cutting each cell from the
  trench patches with the cell boxes in `s3-01-trench-fill/job.json`; the inner
  wall per segment (works at 1–3, built at 4), clipping the inner-wall patches
  to each segment's cells; built segments also become an occluding layer;
- the camp pieces from the layout (as the preview does);
- engines from `state.engines` by kind and state: moving engines face north, or
  east/west (mirrored) after a sideways move; a raised ladder uses S4-02;
  burning ones the S4 burning art plus S6 fire; wrecks the wreck art;
- units from `state.units` with the S1/S5 pose sets by side and troop type
  (Zhuge Liang S5-05, Hao Zhao S5-06, Shu infantry S1-05, Shu archers S5-02,
  Wei archers S1-06, Wei infantry S5-03); climbing poses on ladder and wall-foot
  cells, carry/dump poses when filling; a faction ring and a small troops bar;
  silhouettes behind walls as in the preview;
- overlays: reachable cells, attack targets, the wall archers' extended range,
  climbable wall cells (raised ladders, filled wall feet), the deployment zone.
  Keep `?siege-map` working on top of the same view.

## Game screen (`src/siege/ui/`)

`SiegeApp` with screens: deploy → battle → placeholder ending. Battle UI per §7:
top bar (day, grain, Zhang He distance, weather, act, End day); defence panel
(four gates' durability, Wei troops per wall run, inner-wall progress per
segment, raised ladders and filled wall feet); workshop panel (queue, days
left, what can be built and its cost/days, the 6-engine cap); unit card with
portrait and an action menu (move, attack, climb, raise ladder, fill trench,
build wall, ram, order, stand by) where **disabled entries show the rules'
rejection reason**; the attack forecast showing casualties both ways and the
modifiers by name ("frontage 150", "parapet ×0.3", "height ×1.3",
"climbing ×1.5"); a log. Engines are selectable like units. Keyboard as the field
battle: Tab next unit, A attack, W stand by, E end day, Esc skip playback.
Ending the day runs the Wei AI with a short playback (moves tweened, arrows and
fire from S6; Esc skips). Pan and zoom like the preview; it must stay smooth
with 10 Shu, 6 Wei and 6 engines.

## Save (`src/siege/save.ts`)

Its own localStorage slot (`threekingdoms-siege-chencang`), never the campaign
save; save/load at any time from the top bar; a loaded game continues exactly
(same seed, same results for the same actions). Unit test that.

## Text

All strings in `src/siege/i18n/{zh,en}.ts` through the v0.3 language switch; a
test fails if a key is missing in either language.

## Checks to run and report

- `npx vitest run tests/siege`, `npx tsc --noEmit -p .`,
  `npx prettier --check src/siege tests/siege tests/e2e-siege src/v03/ui/screens/StartScreen.tsx`,
  `npx vitest run` (the v03 performance tests fail on this machine before your
  change too; report only other failures), `npx vite build`.
- `tests/e2e-siege/battle.spec.ts`: start screen → campaign card → deploy →
  battle; select a unit and move it; open the forecast on a wall target and
  check a modifier label is shown; queue an earth cart; end day and see the
  day counter advance; save, reload the page, load, same day and units; switch
  language. Save these screenshots to `.artifacts/siege/screens/`: `start.png`,
  `deploy.png`, `battle-100.png` (100 % zoom on the south gate),
  `battle-50.png`, `forecast.png`, `workshop.png`, `defence.png`,
  `day2.png`, `en.png`. Use `channel: undefined` (headless Chromium; libraries
  via `LD_LIBRARY_PATH=$HOME/.local/chromelibs/usr/lib/x86_64-linux-gnu`).
- Report anything you could not do and every interpretation you made.
