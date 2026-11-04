# Codex task K1 — S8 art materials: blockouts and prompts

Planned and validated by Claude; implemented by Codex. The specification is
[`docs/siege/03-chencang-v0.2-plan.md`](../03-chencang-v0.2-plan.md) §9 (read all of it)
and §11 row K. This job prepares the materials only. **Generate no images**: the planner
runs image jobs afterwards from what you produce, then reviews the results.

## Why

v0.2 adds mechanics that have no art yet (hide-covered engines, earth mounds, wall-top
preparations, a storming mass, a night sortie, and so on). Each piece needs a blockout,
a registration grid and an authoritative prompt, produced the same way as S4–S7.

## Constraints

- Change `tools/build-siege-blockout.mjs`, never the generated files by hand. Everything
  under `docs/siege/chencang/art/s8-*/` must come from that script.
- Running the script must leave every existing asset folder byte-identical. Only the new
  `s8-*` folders and the index `docs/siege/chencang/art/README.md` may change.
- Keep the plan's prompt text exactly: each `Subject:` / `Output:` paragraph in plan §9.3
  appears verbatim in the generated README's fenced `text` block. The fixed segments around
  it follow the assembly order in plan §9.1, and for each type copy the pattern of the
  existing assets: piece sheets like S4-01 and S4-02, pose sheet like S5-03, icon sheet like
  S6-03, illustrations like S7-04.
- Do not touch `src/siege/rules`, `src/siege/ai`, `src/siege/ui`, or `tests/siege` other
  than as listed: another Codex job is rewriting the rules in this same checkout. Do not
  revert or stage anything of theirs. No `git commit`.

## Deliverables

1. Definitions for S8-01 to S8-10 in `tools/build-siege-blockout.mjs` with the folder names,
   geometry, references, `about`, `subject` and `checks` from plan §9.3. Add a `HIDE` block-out
   colour. Add an `S8_PICKS` map, empty for now, working like `ENGINE_PICKS` and `STORY_PICKS`.
2. Running `node tools/build-siege-blockout.mjs` writes each `s8-*` folder: README, block-out,
   `grid.png`, `footprints.json`, registration landmarks in the prompt, and `guide.png` for
   the pose sheet; whichever of those each asset type already gets in S4–S7.
3. The art index README gains S8.
4. The script also writes `.artifacts/siege/s8-jobs.json`, an array in plan order:
   `{ id, folder, type: 'pieces' | 'poses' | 'icons' | 'illustration', candidates,
references: [repo-relative paths in upload order], prompt, size }`, where `prompt` is
   exactly the README's fenced text, `candidates` is 3, and every reference path exists on
   disk. Plan §9.3's upload lists are authoritative. Check that the paths they name actually
   exist (for example `s4-01-ladder-cart/attempts/v2.webp`, `s4-03-ram/attempts/v1.webp`,
   `s5-03-wei-infantry-sheet/attempts/v1.webp`, `s5-07-portrait-hao-zhao/attempts/v1.webp`,
   `s7-01-key-visual/style-reference.png`). If a named file is missing, or a pick in the
   existing `*_PICKS` maps disagrees with what the plan names, use the actual chosen file and
   say so in your report.

## Geometry details to get right

- S8-03 mound: north end flush with the wall face at full height (3 levels); it spans the
  two trench rows, so its registration must agree with S4-02's raised-ladder geometry.
- S8-04: pieces sit on a one-cell walkway; they will be raised 3 levels in the game like
  S4-07's crane, so anchors are the base centre.
- S8-06: a 1-cell-wide, 3-level-high vertical face. Record the anchor for gluing to the wall
  face in `footprints.json`.

## Checks to run and report

- `node tools/build-siege-blockout.mjs`, run twice: the second run changes nothing.
- `git status --short` afterwards lists only the tool, the art index README, and new `s8-*`
  paths, plus whatever the other job is doing under `src/` and `tests/`.
- `npx prettier --check tools docs/siege` (generated markdown too).
- Report, per asset: prompt length, the reference list, the pixel size of the block-out, and
  anything in plan §9.3 you had to interpret. Open each generated block-out and confirm it
  shows what the plan's geometry describes; report anything that looks off.
