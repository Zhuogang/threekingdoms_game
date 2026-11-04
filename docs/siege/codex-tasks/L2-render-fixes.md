# Codex task L2 — render fixes from the planner's visual review

Planned and validated by Claude; implemented by Codex. The planner ran `render-v02.spec.ts` (10/10 pass) and
reviewed all eight scenes. The work is good; these specific things are not yet good enough. Fix them in
`src/siege/render/` and re-express any changed behaviour in the tests.

## Fixes

1. **Foothold pips are the most important thing on this screen, and they are too small.** They are about 5px, and
   they sit on the ladder, under the climbers. Make them about 1.8× larger at 100% zoom, with a dark outline and a
   paper-coloured ring so that they read on grey brick. Move them onto the wall face just beside the climbing
   position rather than on it (to the east of the ladder, mid-wall), drawn above climbers and ladders. Lit stays warm
   gold; unlit must clearly read as empty, hollow rather than dark-filled. Check them at all three zoom levels.
2. **Storming mass draws behind the ladder.** The rails and rungs currently overlay the men, which makes the mass hard to
   read. It must draw in front of the raised ladder at its position, including the `溃退` piece.
3. **Sprites must never be dropped from the static art.** The budget currently omits 21 camp pieces in the busiest state,
   which would make tents vanish as troop counts change. Static scenery (camp, palisade, workshops, city) always draws. Only
   silhouettes are optional. Raise the cap to what the worst state requires, with a test on that worst state, and report the
   real number. Then measure pan/zoom cost in the worst scene as far as you can without a browser, and list anything that a
   browser run should check.
4. **A unit on the south gate top is invisible.** The gate tower's painted slices hide it entirely, leaving only a silhouette
   on the tower's wall. The gate top is where a millstone is dropped and a sortie begins, so it must be readable. Draw units on
   gate cells in front of the tower's occluding slices, standing on the front parapet line of the gate top.
5. **Silhouettes are too heavy.** The grey-green blobs over the workshop roofs read as stains. Lower their opacity to about
   35%, and tint them by side. Keep them useful for finding a hidden unit.
6. **Braziers are too big.** New art is coming for S8-04 (round bowls instead of square pans). Whatever the picked art, draw
   braziers at 0.72 of their current scale, in one named constant, and keep their base on the walkway. Do not change how the
   firewood bundle and boulders are drawn other than making sure that a brazier and a bundle in the same cell do not overlap.
7. **The yellow frame on a ladder's wall cell.** Lines 722–735 of `SiegeMapView.tsx` draw it. Confirm what draws it and why. It
   is wide and hides the merlons, and appears in preview scenes for every raised ladder. It should appear only for a selected
   target or a legal action target, thinner, and never as a permanent mark. If it is already that and only the preview scenes
   force it, make those scenes stop forcing it, and report that.

## Constraints

No rule changes (another job is revising `src/siege/rules` and `src/siege/ai` in this checkout; do not touch or stage them), no
art edits, no `src/v03`, no `git commit`.

## Checks to run and report

`npx vitest run tests/siege`, `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege`, `npx vite build`.
Update `render-v02.spec.ts` where it depends on these, and report what the planner should look at in the new screenshots.
