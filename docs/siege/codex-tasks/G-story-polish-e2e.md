# Codex task G — story, banners, hints, summary and a full playthrough (M4, part 2 of 2)

Planned and validated by Claude; implemented by Codex. Builds on task F
(`src/siege/ui`, `src/siege/render/SiegeMapView`, `src/siege/save.ts`,
`src/siege/i18n`). Plan: `docs/siege/02-chencang-mvp-plan.md` §3, §7, §11;
art picks in `docs/siege/chencang/art/s5-0*`, `s6-0*`, `s7-0*` (README and
`generation-manifest.json`: the `runtime/` copies are the files to ship).

## Constraints

As task F (only the start-screen card may touch `src/v03`; rules unchanged
unless a tested bug fix; no `git commit`). Ship art by importing the
`runtime/`, `poses-game/`, `icons/` and `pieces/` files from `docs/`, as the
preview does, so the build bundles them.

## Deliverables

1. **Start-screen card**: the S7-01 key visual (`s7-01-key-visual/runtime/`)
   with the title 陈仓之战 / The Siege of Chencang, 建兴六年冬 / Winter 228, one
   line of introduction, Start and (if a save exists) Continue. Text is HTML
   over the picture's quiet upper left.
2. **Opening** (skippable): two scenes, S7-02 then S7-03, each with three to four
   lines of dialogue in a dialogue box built from the S6-05 pieces (dialog frame,
   name plaque) with the speaker's portrait: Jin Xiang calls twice for surrender
   (he and Hao Zhao are from the same commandery); Hao Zhao refuses twice;
   Zhuge Liang orders the assault. Keep to what the sources record (Jin Xiang
   twice urged surrender; Hao Zhao answered that he knew the laws of Wei and
   would die at his post) and write the rest briefly, in both languages.
3. **Act banners** from the S6-05 scroll pieces (left roller, repeated middle,
   right roller), rolled open by CSS: 第一幕 云梯冲车 / Act I: Ladders and Rams
   on day 1, and 第二幕 井阑重墙 / Act II: Towers and the Inner Wall when act 2
   begins, with Zhuge Liang's line proposing the siege towers.
4. **Endings**: victory → S7-05, historical → S7-06 (grain gone; the retreat and
   Wang Shuang killed in pursuit), defeat → S7-07; each with two or three lines
   of narration, then the **summary**: days, losses on both sides, engines built
   / destroyed by kind, gates and trench state, and a short "in history"
   paragraph (Zhuge Liang besieged Chencang for some twenty days with tens of
   thousands; Hao Zhao held with about a thousand; ladders burned by fire
   arrows, rams broken by millstones, a double wall raised inside, tunnels
   countered; Shu withdrew when grain ran out and Zhang He's relief neared).
   Withdrawing (`withdraw`) shows the historical ending with a lower rating line.
5. **First-time hints** (dismissable, remembered in the save): the first time the
   player meets the city wall, the trench, a raised ladder, a frontage-limited
   attack forecast, and the inner wall — one or two sentences each saying how
   it works and what to do.
6. **Icons** from S6-03/S6-04 (`icons/*-32.png`, `*-64.png`) in the action
   menu, orders, top bar and defence panel; panel backgrounds from the S6-05
   paper tile.
7. **i18n**: everything in zh and en; the missing-key test covers the new keys.

## Checks to run and report

- Everything task F ran (vitest siege, tsc, prettier, full vitest with the known
  v03 performance failures only, vite build, sim targets unchanged).
- `tests/e2e-siege/playthrough.spec.ts`: start → opening (click through both
  scenes) → deploy → battle; then drive the remaining days through a dev-only
  hook (e.g. `window.__siegeDev.playScript('competent')` behind
  `import.meta.env.DEV`) to an outcome on a seed that wins and on one that ends
  historically; check the ending picture, narration and summary appear. Also
  one game ended by `withdraw`.
- Screenshots to `.artifacts/siege/screens/`: `card.png`, `opening-1.png`,
  `opening-2.png`, `banner-act1.png`, `banner-act2.png`, `hint-wall.png`,
  `hint-frontage.png`, `ending-victory.png`, `ending-historical.png`,
  `summary.png`, `en-ending.png`.
- Report interpretations and anything not done.

## Also (from the planner's review of task F)

- **Font coverage.** The bundled fonts are subsets; task F's new Chinese text
  rendered with missing glyphs until the planner regenerated them with
  `src/siege` in the corpus (`python3 tools/subset-fonts.py`, which now writes
  `cjkCharacters` into `public/fonts/manifest.json`). Add a test that every
  CJK character used in `src/siege` (all `.ts`/`.tsx`, including the new story
  text) is in that list, so new text cannot silently miss glyphs. You cannot
  regenerate the fonts in the sandbox (no network): if the test fails after
  your text changes, list the missing characters in the report and the planner
  will rerun the script.
- **Browser runs.** Your sandbox cannot open ports or start Chromium; write the
  Playwright spec and its screenshot steps, run everything else, and say so —
  the planner runs `npx playwright test --config playwright.siege.config.ts`.
