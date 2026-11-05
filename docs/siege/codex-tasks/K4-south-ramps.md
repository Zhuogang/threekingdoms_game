# Codex task K4 — repaint the two ramps behind the south wall

Planned and validated by Claude; implemented by Codex. From the user's playtest: "上下城的楼梯可否改成半透视？现在的图片看起来非常奇怪", then "现在的马道看起来反了，很奇怪". This changes art only, through the existing patch pipeline. **No rule changes: the simulation must stay identical to `.artifacts/siege/sim-s.json`.**

## What is wrong, and what is right

The camera looks north from above, so the wall hides most of what stands behind it. `ramp-south-w` covers cells x 20–22 at y = 15, with heights 3, 2, 1 running towards the gate; `ramp-south-e` is its mirror at x 25–27.

The geometry gives the right picture, and the mask already has it. Only a flat wedge of the ramp's **top surface** can be seen, flush with the walkway:

- West ramp, in map pixels: (1280,648), (1408,696), (1280,696). That is `ramp-south-w`'s mask bbox `[1279,647,1408,696]`.
- East ramp: (1792,648), (1664,696), (1792,696). That is `[1664,647,1793,696]`.

The high end touches the walkway's back edge along its whole bottom edge, and the wedge narrows to nothing towards the gate, where the ramp sinks out of sight behind the walkway.

The painter (S2-01) instead put a sloping slab **and a full brick side wall** in that wedge, so the ramp's top surface sits about one row above the walkway. It reads as a ramp climbing away from the wall into the air, the wrong way round. Page-only experiments confirmed that fading or mirroring the existing art cannot fix it, and that a flat code-drawn wedge looks like a striped flag. It needs painting.

**The wanted result:** a flight of pale stone steps, seen from above, running parallel to the wall, level with the walkway at its high end and descending towards the gate. The steps are the only thing in the wedge: no brick side wall, no raised slab. A low stone curb runs along the wedge's upper (north) edge. The inner parapet of the walkway opens where the ramp's high end meets it, so that a soldier could clearly walk from the walkway onto the steps. A person looking at it should read: "from this wall, stairs go down towards the gate."

## How

Follow the S3 local repaint pipeline; `docs/siege/chencang/art/s3-02-gate-south-damaged/` is the model (`job.json`, `inputs/`, `steps/`, `attempts/`, `patches/`, previews). Read how the tool builds that job first (`tools/build-siege-blockout.mjs`, `S3` entries, and whichever script composes the patches). Change the tool and rerun it; never hand-edit generated files.

1. **New asset `s3-08-south-ramps`.** The glob `s3-*/patches/*` in `src/siege/render/assets.ts` then finds it with no change. Crop 768×512 from `s2-01-full-map/composite.webp`, map rectangle x 1152–1920, y 400–912, shown at 1536×1024. Both ramps and the gate tower are in frame.
2. **The input** has both wedges blocked out plainly (a flat pale stone tone, with thin ruled lines marking the steps). Everything else is the existing painting. Use `STYLES.a.scene` with the fidelity paragraph the S3 jobs use, plus the description above. Say plainly that outside the two wedges and the parapet openings nothing changes, and that there is no brick side wall.
3. **Generate at least three attempts** with image_gen, with the input attached, into `attempts/` as the other jobs do. Use `v<k>` naming, and keep the prompt in the asset's README and the manifest.
4. **Compose a patch for every attempt:** only the two wedges and the parapet openings, with a feather of about 6 map pixels. Write a preview per attempt at map scale, plus one comparison sheet, `previews/comparison.png`, showing the current picture and each attempt side by side, cropped around both ramps. The planner picks by eye, so record your own recommendation in your report and set it as the provisional pick.
5. **Always on.** In `statePatches` (`src/siege/render/stateArt.ts`), always add `{ id: 'ramp-south', state: 'ramp-south' }`, before the gate patches. The ramp slices (`ramp-south-w`, `ramp-south-e`) draw from the composed painting, so they pick it up. Check that the wall and parapet slices next to them do as well, and that the masks don't cut the opening off. Say in your report if a mask has to change, and change it in the tool.

## Tests

- A unit test that `statePatches` of a new game includes `ramp-south`, and that the patch file has the expected `at` and `size`.
- The existing patch-integrity tests pass for the new asset (the tool's prompt-versus-log checks included).
- `render-v02` and `visible` specs: no change expected; a screenshot of the ramps at `.artifacts/siege/screens/ramps.png` with a unit on `(21,15)` and on `(26,15)`, in a small new spec.

## Constraints

Do not touch `src/v03`, rules, tuning or AI. Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege tools`, `npx vitest run tests/siege --maxWorkers=1`, the simulation and `tools/siege-compare.mjs` against `.artifacts/siege/sim-s.json`. Your sandbox cannot start Chromium; the planner runs Playwright. Do not commit. Report what you did, the attempts, your pick and why.
