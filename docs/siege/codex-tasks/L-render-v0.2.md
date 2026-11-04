# Codex task L — rendering v0.2

Planned and validated by Claude; implemented by Codex. The specification is
[`docs/siege/03-chencang-v0.2-plan.md`](../03-chencang-v0.2-plan.md) §8 and §11 row L, on top of
the v0.2 rules (`src/siege/rules/`) and the processed S8 art (`docs/siege/chencang/art/s8-*`).
Where this brief and the plan differ, this brief wins.

## Why

Playtesters said climbing the wall looked impossible. The rules now have visible progress, but
the picture still shows nothing of it. This package makes every v0.2 state readable on the map:
how far up a wall the attackers are, what the defenders have prepared, what a mound looks like,
and what happens at night.

## Constraints

- No rule changes. Rendering derives everything from `SiegeState` and the log; no state of its own
  beyond animation timers. Keep the existing SVG renderer and scene ordering.
- Reuse `scene.ts` depth ordering, `mapPieces.ts` placement and `footprints.json` anchors. No
  hard-coded pixel positions that the footprints already give.
- Do not touch `src/v03`. No `git commit`. Another Codex job may be editing `src/siege/ai`,
  `tools/siege-sim.mjs` and `tests/siege/*`; do not revert or stage anything of theirs.
- Generated art under `docs/siege/chencang/art/` is read-only here.
- Do not generate images. If a piece is missing or misaligned, report it; do not paper over it.

## Deliverables

Everything in the plan §8 table:

1. **Foothold pips**: three ink dots on the front of a wall cell, lit by `state.footholds`, blinking
   on the forecast hover.
2. **Climbers on the ladder**: by foothold, S5-01's climbing poses: 1 → one low (`climb-a`),
   2 → two (`a`, `b`), 3 → one at the top (`top`). Use the real pose names.
3. **Storming mass**: S8-06 `攀附` glued to the wall face at a climbing position where the unit has
   `assaultedDay === state.day`; replaced by `溃退`, fading, during the night replay if it did not
   mount. It replaces single climbers there. This sheet is deliberately not to footprint scale: scale
   each piece uniformly by its `fitHeightLevels` in `footprints.json` (3.5 wall levels, about 49×84px in
   the game), with its recorded foot-centre anchor at the wall foot.
4. **Mound**: S8-03 by `state.mounds`: 1–2, 3–5 and 6, spanning rows 17–18, north end flush with the
   wall, using the crest and base anchors recorded in `footprints.json`. Correct occlusion against
   units standing on it and against the wall.
5. **Covered engines**: `covered` ladder carts, raised ladders and rams use S8-01 and S8-02. A
   covered ram damaged below half uses S8-02's damaged piece. Burning stays on the existing path.
6. **Wall-top preparations**: S8-04 lit brazier with S6-01's code-driven flame, firewood bundle,
   boulder pile, placed on the walkway at their cells. A hoisted millstone is S4-07's millstone
   under the crane arm; unhoisted, it sits on the walkway. The firewood bundle stands beside a
   brazier whose `litDay` is today (prepared, not yet usable), so tomorrow's threat reads today.
7. **Night**: during night replay, a flat `#1b2233` tint at 45% (no vignette), radial light at
   braziers and torches.
8. **Night replay**: from the log entries `endDay` adds. Night assault: engines slide north, ladders
   rise (S4-01 → S4-02 crossfade). Torches: braziers flare. Sortie: S8-05 party walks from the south
   gate along the road to the target, flame, engine catches or the party turns back. All skippable,
   twice the speed of v0.1's replay.
9. **Formations by troops**: 1, 3 or 5 figures (≤ 800, ≤ 2000, > 2000), following the ink-04 spacing.
   The count falls as troops fall.
10. **Displaced defender**: slides along the wall to the new cell; its morale change floats up.
11. **Preview scenes**: `?siege-map&scene=<name>` builds a fixed state and shows it, one scene per
    item above: `footholds`, `assault`, `mounds`, `covered`, `preparations`, `nightTorches`, `sortie`,
    `formations`. These are how the planner reviews your work, so they must show every state in one
    screen, including each variant of a piece. Dev only, like the existing preview.

## Tests

- `tests/siege/`: unit tests for the pure mapping from state to sprites. Foothold to climber count
  and poses; mound stage boundaries at 2/3 and 5/6; `covered` choosing S8 images; which preparation
  draws what; formation thresholds at 800, 801, 2000, 2001; the firewood-today rule; `mapPieces`
  placement of all new pieces against `footprints.json`.
- `tests/e2e-siege/render-v02.spec.ts`: load each preview scene and save a screenshot to
  `.artifacts/siege/screens/render-<scene>.png`; at three zoom levels, click a unit and assert the
  right unit is selected. Your sandbox cannot start Chromium: write the spec, the planner runs it.

## Performance

A cap of 300 sprites; particles unchanged. Panning and zooming must stay smooth with 10 Shu, 6 Wei, 8
engines and 5-figure formations. Report how sprite counts were bounded. Memoise static layers rather
than re-creating every sprite on pan.

## Checks to run and report

`npx vitest run tests/siege`, `npx tsc --noEmit -p .`,
`npx prettier --check src/siege tests/siege tests/e2e-siege`, `npx vite build`. Report the sprite
count in the busiest scene, interpretations, and anything not done.
