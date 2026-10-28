# v0.1 improvement browser evidence

> **Historical record, reorganized October 22, 2026.** Rules, results, approvals and pending statements below belong to the original version/date. See the [current v0.3 overview](../../v0.3/README.md) for the running game. Original body retained; local links rebased.

> **Archived:** v0.1 browser evidence. This file is not updated. See the [documentation index](../../README.md).

The complete development browser suite passed **41 tests**. After the final formatting pass, all
**12 readability configurations** passed again with campaign label font measurements added and
import notifications dismissed for clean captures. Each configuration exercises both campaign
and dense battle, producing the required **24 scene combinations**.

These checks used Chrome `155.0.8059.80`, Windows x64 `10.0.26300`, and Node `v24.15.0`.
The [pre-change baseline](validation-baseline-2026-10-19.md) records the original results and saves.
The final unit, build, production, portrait, AI, and contrast results are recorded in
[validation.md](validation.md). This document describes the browser checks, not independent
human usability acceptance.

## Measured display results

The [complete measured matrix](../../validation-evidence/display-metrics.json) retains both languages,
every preset, the canvas size, board bounds, and rendered font targets. Values below are CSS
pixels after camera transforms at 100% browser zoom.

| Viewport    | Comfortable fit tile | Comfortable readable tile | Fit board bounds within canvas               |
| ----------- | -------------------: | ------------------------: | -------------------------------------------- |
| 1366 × 768  |                 49.2 |                        64 | (191.8, 36)–(782.2, 528), canvas 966 × 600   |
| 1920 × 1080 |                 80.4 |                      80.4 | (261.6, 36)–(1226.4, 840), canvas 1480 × 912 |
| 1280 × 720  |         ≥44 verified |                         — | Separate laptop smoke check passed           |

| Readable-mode measurement          | Compact | Comfortable | Large |
| ---------------------------------- | ------: | ----------: | ----: |
| Minimum campaign city label        |      14 |          16 |    18 |
| Commander surname                  |      14 |          16 |    18 |
| Troop count                        |      12 |          14 |    16 |
| Faction crest and readiness marker |      12 |          14 |    16 |

On the 1366-wide viewport, Compact readable tiles measure 49.2 pixels and Large tiles measure 80
pixels. On the 1920-wide viewport all presets can fit the complete board at 80.4 pixels while
keeping their chosen text sizes. Large readable tiles may require panning on shorter screens.

Both languages and every preset passed horizontal overflow checks. Fitted board boundaries have
at least 12 pixels of clearance. When the complete board fits in readable mode it remains within
those boundaries; a regression protects the floating-point edge case that previously caused
unnecessary centering near the top row.

Clean current screenshots: [Chinese campaign](../../images/campaign-zh.png),
[English dense battlefield](../../images/battle-en.png).

## Interaction and identity checks

- Real mouse clicks select friendly units placed in all four corners and the center after pan,
  zoom, and resize. A drag changes the camera without issuing a game command.
- Center selected unit uses the current selection after an earlier Next ready commander action,
  including at a zoom where the entire battlefield cannot fit.
- Display and language changes, the legend, selection, and commander cycling preserve canonical
  saved state, including revision and RNG. Blocked and corrupt preference storage remain playable.
- Keyboard Tab, Enter, Space, and Escape operate settings, the legend, commander cycling, and
  camera centering. A visible keyboard outline is checked; reduced motion is exercised.
- Next ready commander visits every eligible unit exactly once before wrapping and excludes
  finished or confused units while retaining moved units with an available action.
- A real seeded Search for talent command recruits the initially free Dian Wei. His correct
  portrait and localized name persist through valid captivity and later allegiance fixtures.
- Ma Teng (`maliang`) and Zu Mao (`zuzhao`) display the correct names and portrait URLs. Ma Teng's
  roster portrait matches his inspector portrait.
- Six troop classes and the banner/readiness legend are exercised. All 52 named portraits and
  the garrison's two renditions have additional production loading checks.

## Save journey and functional play

The browser journey loads a pre-change planning save with two queued orders, changes rival
aggression, resolves the month, performs a manual rally, reloads during both battles, and finishes
the queue. Every stage is compared with an uninterrupted simulation using the same commands,
including reports, RNG, troops, resources, counters, and the resolution cursor.

The completed report has exactly two battle outcomes, the correct resolved date, and no pending
accumulator. Switching languages and focusing a report city leave saved state unchanged. Manual
slot save/load, JSON export/import, and another refresh preserve the complete result.

Separate English and Chinese functional playthroughs each cover three months and a manually
commanded battle with movement and rally, followed by a midbattle reload. Existing autosave
failure/retry, transaction isolation, invalid import, startup restore, and ending tests also pass.

## Actual 200% browser zoom

The zoom check launches a dedicated temporary Chrome profile and selects **200%** in Chrome's
own `chrome://settings/appearance` page. It verifies `outerWidth = 1920`, `innerWidth = 960`,
`devicePixelRatio = 2`, and `visualViewport.scale = 1`. No device-scale emulation, CSS transform,
or pinch/page scaling substitutes for browser zoom.

Language, display settings, saving, next commander, centering, and End battle day remain usable
through ordinary clicking and scrolling. A manual battle day advances and saves successfully.
The [actual browser surface](../../images/improvements/browser-zoom-200.png) is captured through Chrome's
screenshot protocol to avoid full-page clipping errors at non-default browser zoom.

## Reproducing the evidence

```sh
npm run test:e2e
node tools/package-display-evidence.mjs
```

The suite writes all 24 scene images and per-configuration measurements beneath the ignored
`.artifacts/improvements/` directory. The packaging script checks that all 12 configurations have
valid campaign font evidence, retains the compact aggregate JSON, and refreshes the two selected
README images and browser-zoom image. It never regenerates legacy fixtures.

No independent player usability test has been completed by these automated interactions. Human
recognition timings, the 9-of-10 identification target, and subjective enjoyment remain pending.
