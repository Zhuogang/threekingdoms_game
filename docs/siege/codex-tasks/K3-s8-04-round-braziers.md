# Codex task K3 — S8-04 redone without a blockout

Planned and validated by Claude; implemented by Codex. In the game, S8-04's lit brazier rendered as a saturated red
rectangle. The blockout's plain box was overriding the prompt's "round bowl" through the fidelity paragraph. The planner
generated new candidates with no blockout reference and picked one. **Generate no images.** Make the tool describe what
was actually done, and place the art correctly.

## Files on disk

- `attempts/s8-04/sources/`: `v1`–`v3` (the first round, picked `v1` until now), `v4`–`v6` (a second run of the same
  prompt, no better), `v7`–`v9` (round three, no blockout: **pick `v8`**).
- `attempts/s8-04/codex.log` is rounds one and two's log; `attempts/s8-04/codex-round3.log` is round three's, and holds
  the exact prompt under `IMAGE PROMPT:`.
- `.artifacts/siege/s8-04c-job.json` holds round three's job, including its prompt and its single reference
  (`s1-02-south-gate/attempts/v4.webp`).

## Deliverables

1. `tools/build-siege-blockout.mjs`: S8-04's README and manifest record all three rounds. The authoritative prompt is round
   three's, verbatim. Its upload list is the S1-02 reference only. The integrity check that compares the README prompt to the
   generation log must check round three's prompt against `codex-round3.log`, and round one's against `codex.log`; adapt
   it rather than loosening it. S8-04 no longer has a `blockout.png` as an upload, and its README must say why (one sentence). The
   plan's §9.3 S8-04 entry gets the same update: the prompt, the upload list and the reason.
2. `S8_PICKS['S8-04']`: `v8`. Reason: "Round bowls on splayed legs that read at game size; the lit one is mostly dark charcoal with
   embers, not a red sheet. Generated without a blockout, because the blockout's box overrode the prompt."
3. Process: all nine candidates to `attempts/v*.webp` with `comparison.png`; `selected-transparent.png` through `key.py`; nothing
   repainted. Check for magenta fringe, as in K2.
4. `footprints.json`: the sheet's pieces are far larger than the block-out's scale and sit wherever the model put them, so cut each
   piece by its actual alpha islands, left to right, and record for each its alpha bounding box, its foot-centre anchor and
   `fitWidthPx`, its on-screen width at 100% zoom: lit and unlit brazier **34**, supplies **32**, boulders **40**. A piece's islands
   must stay together, for example separate legs and logs. If the alpha analysis cannot separate the four pieces cleanly, stop and report.
5. **Renderer** (`src/siege/render/v02Art.ts` and friends): place S8-04 pieces by `fitWidthPx`, scaled uniformly, with the foot-centre
   anchor on the walkway in the middle of the wall cell. Remove the L2 `0.72` brazier constant if it is now redundant. A firewood bundle
   beside a brazier must not overlap it in the same cell. Update `renderV02.test.ts` and `mapPieces` coverage.

## Constraints

Existing art folders outside S8-04 stay byte-identical, and `node tools/build-siege-blockout.mjs` still runs clean twice with no change on
the second run. Do not touch `src/siege/rules`, `src/siege/ai` or `tools/siege-sim.mjs`: another Codex job is revising them. No `git commit`.

## Checks to run and report

The two tool runs; `npx vitest run tests/siege/renderV02.test.ts tests/siege/mapPieces.test.ts`; `npx tsc --noEmit -p .`;
`npx prettier --check tools/build-siege-blockout.mjs src/siege/render docs/siege/chencang/art/s8-04-wall-top-preparations`; each piece's
alpha box, anchor and resulting on-screen size. Write a paper-coloured contact sheet of the four pieces at their game size to
`.artifacts/siege/s8-04-game.png`.
