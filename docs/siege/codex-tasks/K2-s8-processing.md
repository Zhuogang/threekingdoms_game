# Codex task K2 — process the chosen S8 art

Planned and validated by Claude; implemented by Codex. The planner has reviewed the candidates in
`attempts/s8-*/sources/` and chosen. Your job is to turn the choices into the same on-disk assets
that S4–S7 have, using the existing tools. **Generate no images.** Spec:
[`docs/siege/03-chencang-v0.2-plan.md`](../03-chencang-v0.2-plan.md) §9.

## The picks

| Asset | Pick | Type         | Reason (use in `S8_PICKS`)                                                                     |
| ----- | ---- | ------------ | ---------------------------------------------------------------------------------------------- |
| S8-01 | v1   | pieces       | Hides cover the lower two thirds of the raised ladder; rungs stay visible                      |
| S8-02 | v2   | pieces       | The damaged piece reads as crushed at game size, with the chassis and beam intact              |
| S8-03 | v3   | pieces       | The finished ramp has a stepped path up the middle and log revetments on both sides            |
| S8-04 | v1   | pieces       | Rounded boulders; the brazier is a square iron pan, not the prompt's bowl, accepted as legible |
| S8-05 | v2   | poses        | All six poses clean, and the crouching pose has the kindling bundle the prompt asks for        |
| S8-06 | v2   | pieces       | Densest mass, widest usable aspect for one cell; no blood                                      |
| S8-07 | v2   | illustration | Hao Zhao above the retreat, the wrecks by the trench, and a far line of relief banners         |
| S8-08 | v2   | illustration | Firelit wall, the sortie at the cart, and the Shu guards arriving too late                     |
| S8-09 | v3   | icons        | The most distinct set at small size, especially the hide                                       |
| S8-10 | v2   | illustration | Same night as S7-01 from the other side, with the millstone and the far carriage legible       |

## Constraints

- Follow the existing pipeline exactly; look at how S4-01, S5-03, S6-03 and S7-04 were done and
  match their files, manifest shape and README text. Tools: `attempts/key.py`,
  `attempts/cut_poses.py`, `attempts/prepare_ui.py`, and `tools/build-siege-blockout.mjs`. Use
  `~/simple_ML_practices/.venv/bin/python`.
- Everything that the blockout tool generates comes from the tool. Change the tool, then rerun.
  Existing art folders stay byte-identical.
- Nothing is repainted. Do not touch `attempts/s8-*/sources/`; they are the byte-exact originals.
- Do not touch `src/siege/ai`, `src/siege/rules`, `tools/siege-sim.mjs` or `tests/siege/*` other than
  what is listed here: another Codex job is working on them in this same checkout. Do not revert or
  stage anything of theirs. No `git commit`.

## Deliverables

For each asset, in `docs/siege/chencang/art/s8-*/`:

1. `attempts/v*.webp` (lossless, every candidate that exists), `comparison.png`, and
   `generation-manifest.json` in the same shape as S4–S7, with source hashes, the chosen file and
   reason. S8-01 has only two candidates; say so in its manifest. `mode` is
   `Codex built-in image_gen (codex exec, gpt-6.1-sol, xhigh)`, `generatedOn` is `2026-11-03`, and the
   logs are at `attempts/s8-*/codex.log`.
2. Pieces (S8-01, 02, 03, 04, 06): `selected-transparent.png` via `key.py`.
3. Poses (S8-05): cut with `cut_poses.py`, game scale `36/300`, names `south-march`, `north-march`,
   `east-march`, `south-thrust`, `south-repulsed`, `east-kindle`, in the sheet's order. Keep the sparks
   from being dropped as specks: choose `min-island` accordingly, and check the torch flames survive.
4. Icons (S8-09): `prepare_ui.py icons`, names `suppress`, `cover`, `mound`, `assault`, `night-assault`,
   `torches`, `sortie`, `light-brazier`, `hoist-millstone`, `stack-boulders`, `morning-report`, `foothold`.
   The source already has true alpha; do not key it.
5. Illustrations (S8-07, 08, 10): `runtime/illustration.webp` (1536×1024) and
   `runtime/illustration-small.webp` (768×512), matching S7.
6. `S8_PICKS` filled, README sections regenerated, and the art index updated.

## Geometry to verify and report

For each piece on each keyed sheet, compare its actual alpha bounding box with its slot in
`footprints.json`, and report the offset in pixels. Then:

- S8-03: the finished ramp's north end must meet the wall-top registration. Report the actual top edge
  against `(1280, 344)` and record the real anchors that the renderer needs.
- **S8-06 is deliberately not to footprint scale.** The figures were drawn about three times larger
  than the block-out's 128×144 face. Do not stretch or redraw them. Record in `footprints.json` (through
  the tool), per piece: the alpha bounding box, its foot-centre anchor, and `fitHeightLevels: 3.5`,
  meaning that the renderer scales the piece uniformly so its height equals 3.5 wall levels with feet
  at the wall foot. Report the resulting on-screen size at the game's 24px per level, and the width
  against the 64px cell.
- Keyed edges: check for magenta fringe on each sheet; report the maximum remaining magenta-ish pixel
  count per piece.
- Illustrations: inspect all four corners and any flags or banners at full size for text, seals or
  signatures, and state the result per image.
- Icons: render all twelve at 32px on the game's paper colour and on white into one contact sheet at
  `.artifacts/siege/s8-icons-32.png`, and say whether any two are confusable.
- Poses: write a contact sheet of the six game-size poses to `.artifacts/siege/s8-05-game.png`, and
  state whether the torch is visible at 36px.

## Checks to run and report

`node tools/build-siege-blockout.mjs` twice with no change on the second run; `git status --short`
showing only the tool, the art index and `s8-*` paths (plus the other job's); and
`npx prettier --check tools/build-siege-blockout.mjs docs/siege/chencang/art/README.md docs/siege/codex-tasks`.
