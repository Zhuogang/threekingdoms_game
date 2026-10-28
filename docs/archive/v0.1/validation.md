# Hegemony of the Three Kingdoms v0.1 — validation

> **Historical record, reorganized October 22, 2026.** Rules, results, approvals and pending statements below belong to the original version/date. See the [current v0.3 overview](../../v0.3/README.md) for the running game. Original body retained; local links rebased.

> **Archived:** v0.1 release validation. Current checks are in [v0.2-summary.md](../v0.2/v0.2-summary.md). This file is not updated. See the [documentation index](../../README.md).

October 19, 2026. The v0.1 improvements passed **170 unit tests, 41 development browser tests, six production browser tests, strict compilation, formatting, and portrait validation**. The final 12-case display matrix was repeated after formatting and adding explicit campaign-font assertions. All 52 named officers have distinct local headshots, plus a separate garrison image. Existing pre-change saves retain exact gameplay/RNG continuation. These results apply to the authored `baye-atlas-1` ruleset and the tested browser; independent player enjoyment and representative human balance acceptance remain unverified.

## October 19 improvement checks

| Check                        | Actual result and evidence                                                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                   | **170 passed in nine files**, final run 8.69 seconds. Includes 36 deterministic rival-policy correctness campaigns, threshold/safeguard boundaries, structured reports, original save SHA256 and continuation hashes, camera coordinates, roster identity, and presentation preferences. |
| `npm run test:e2e`           | **41 passed** in installed Chrome on Windows: original 18 journeys plus 23 improvement cases. Full run 3.2 minutes; final 12-case matrix rerun also passed, covering 24 scenes with explicit campaign and battlefield fonts, fit margins, and preset tile sizes.                         |
| `npm run test:production`    | **6 passed in 29.1 seconds**, actual `dist/` under `/hegemony/`: all 106 portrait renditions decode, no external art requests, bilingual saves, queued-battle reports, portable backups, forced portrait fallback, and alternate rendering with WebGL unavailable.                       |
| `npm run build`              | **Passed** strict TypeScript compilation and Vite production bundling. Existing dependency annotation/chunk-size advisories remain nonfatal. No dependency packages were changed.                                                                                                        |
| `npm run validate:portraits` | **Passed** 52 named mappings + garrison, 106 WebP files, complete provenance/checksums, 128/256-pixel renditions, **0.95 MiB** image payload below 3.5 MiB. Two coding agents reviewed the complete labeled contact sheet.                                                               |
| `npm run format:check`       | **Passed** source, tests, tools, documentation, and configuration. Immutable legacy captures are excluded from reformatting and verified by their SHA256 manifest.                                                                                                                       |
| Rival-policy diagnostics     | **60 baseline + 180 initial-preset + 180 final-preset campaigns**. No invalid states or provision shortages in these diagnostic runs. See [measurements and tuning](ai-balance.md) and raw per-run records.                                                                              |

Production validation used `HEGEMONY_PRODUCTION_PORT=4174`: another Chrome connection had bound
the default local port 4173, causing Windows `EACCES` before any test could start. No other process
was stopped. The production test configuration now accepts this optional port override while
retaining 4173 by default; external-request assertions use the configured origin and remain strict.

In PowerShell, an alternate local production-test port can be selected with:

```powershell
$env:HEGEMONY_PRODUCTION_PORT = '4174'
npm run test:production
```

The final development game still uses port 5173. The test-port override does not change game saves
or deployment paths.

### Coverage and measurements

- Primary scenes: 1366 × 768 and 1920 × 1080, Compact/Comfortable/Large, English/Chinese,
  campaign/battle. Comfortable Fit cells measure **49.2** and **80.4 CSS pixels** respectively.
  Readable cells meet 48/64/80 minima. The 1280 × 720 smoke retains at least 44-pixel fit cells.
- Real Chrome **200% browser zoom** was set through Chrome's own Appearance setting in an isolated
  test profile: outer width 1920, inner width 960, device pixel ratio 2, visual viewport scale 1.
  Settings, language, saving, commander selection, and battle end-day remained reachable. This was
  not simulated with CSS scaling or a device-pixel-ratio override.
- Pointer tests select corner and central units after pan/zoom/resize and prove that a drag does
  not issue an order. Keyboard tests use Tab, Enter, Space, and Escape with visible focus.
- Bilingual functional playthroughs advance three months and manually move/rally in battle.
  A two-battle month survives reload, manual slot, export/import, and refresh with complete
  GameState equality against uninterrupted execution, including reports and RNG.
- Named identity cases include actual Dian Wei recruitment, changed allegiance/captivity, and
  the stable-ID exceptions Ma Teng (`maliang`) and Zu Mao (`zuzhao`).
- Targeted contrast review corrected selected/focus/readiness colors, attack text, faction crest
  backdrops, and campaign selection. Readable badge fonts are 12/14/16 with display presets.
  Reduced-motion and DOM identity alternatives were exercised. This is not a full accessibility
  certification.

See the [58-criterion acceptance record](v0.1-improvement-acceptance.md),
[browser evidence](validation-browser-2026-10-19.md),
[portrait credits](../../assets/portrait-credits.md), and
[pre-change baseline](validation-baseline-2026-10-19.md).

The hosted GitHub Actions workflow has not been run from this local task. Firefox/Safari,
representative low-end hardware profiling, and independent timed usability/player-balance review
remain outside the verified claims. The human targets in the plan are explicitly pending.

## Previous release audit — October 17

The original release audit passed 121 unit tests, 18 gameplay browser tests, three production
browser tests, strict compilation, formatting, and dependency auditing. Six reproduced defects were
fixed with regression coverage. The historical detail below is retained for provenance.

## Release checks

| Command                   | Result and coverage                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                | **121 passed:** 80 simulation/save tests and 41 translation tests. Includes atomic invalid commands, resource conservation, all six rulers, multi-year AI campaigns, mixed player actions, full battle rosters, bridge routing, deterministic save continuation, malformed imports, and Chinese message coverage.                            |
| `npm run test:e2e`        | **18 passed:** five gameplay journeys, four language journeys, and nine storage regressions in installed Chrome on Windows. Covers city actions, independent searches, input focus, map controls, battles, skills, endings, dialogs, English/Chinese switching, and 1280×720 / 1920×1080 layouts.                                            |
| `npm run build`           | **Passed:** strict TypeScript checks and a production Vite bundle.                                                                                                                                                                                                                                                                           |
| `npm run test:production` | **3 passed:** actual `dist/` served under `/hegemony/`, bilingual startup and saved progress, exported JSON contents, mid-battle reload and deterministic completion, and successful alternate rendering when WebGL is disabled. Normal startup recorded HTTP 200, one canvas, no page errors, no failed requests, and no external requests. |
| `npm run format:check`    | **Passed:** implementation, tests, configuration, and documentation; reference excluded.                                                                                                                                                                                                                                                     |
| `npm audit`               | **Zero known vulnerabilities** after upgrading the test runner from Vitest 3 to patched 4.1.11. The installed application dependencies were retained.                                                                                                                                                                                        |

The GitHub Actions workflow repeats formatting, unit tests, compilation, and both browser suites on Linux using Playwright Chromium after a push. That hosted workflow has not been executed during this local audit.

## Defects fixed in this audit

| Defect                                                                                               | Fix and regression                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demobilizing troops into a full reserve produced a state that save validation could not reload.      | Reject the command before mutation when the reserve cap would be exceeded; verify the previous snapshot remains intact.                                                         |
| A damaged battle save could omit defending officers or militia, or alter militia attributes.         | Validate the complete deployed defending roster and fixed militia attributes while preserving the intentional ten-unit limit.                                                   |
| A damaged monthly continuation could commit one commander to multiple attacks.                       | Reject duplicate commanders across queued armies.                                                                                                                               |
| Opening the save dialog during a pending write exposed a stale autosave with an enabled Load button. | Wait for fresh slot records, disable slot actions during reads/writes, and guard overlapping refreshes with request tokens. A held IndexedDB transaction reproduces the timing. |
| Imported text equal to object prototype keys could crash Chinese translation rendering.              | Resolve only dictionary-owned keys; unknown imported text remains text. Test both the translation function and an actual browser import.                                        |
| A city search unintentionally filtered the officer roster.                                           | Use independent city/officer search state and verify navigation after searching.                                                                                                |

Additional tactical tests exercise 32 seeded full-roster battles, both player sides, partially played turns, allied Rally effects, food boundaries, invalid actions, and pathfinding around rivers. Mixed-command campaign tests run all six factions across two seeds for up to 18 months, round-trip every accepted state, and compare resumed battle results. Existing three-year AI simulations remain in the suite.

## Save reliability

The nine storage browser regressions check queued-write ordering, reads after pending writes, manual-slot isolation, commit-based status, legacy version 1 records, partly played battles, actual downloaded JSON, quota failure with retry, failed opens, closed connections, aborted transactions, and slow startup restoration. Failure conditions are deliberately injected into real browser storage APIs. This verifies the tested recovery paths, not every possible disk or browser failure.

The release rename preserves the `baye-atlas` database and `baye.save` version 1 payload. Switching language changes presentation only. IndexedDB can still be cleared by the browser; exported JSON is the portable backup mechanism. Concurrent-tab conflict resolution and cloud synchronization are not implemented.

## Visual inspection and limits

English and Chinese production screenshots were inspected. Representative images are tracked under `docs/images/`; browser traces, reports, and other screenshots remain ignored.

- Campaign balance needs extended human playtesting. Automated victories and defeats include controlled fixtures and do not prove equal faction difficulty.
- Firefox, Safari, touch-first controls, screen-reader audits, and formal WCAG conformance have not been certified. Text controls exist for city selection and battle commands.
- The initial JavaScript is approximately 317 KB compressed. The build reports the 555 KB uncompressed Pixi chunk and harmless third-party annotation warnings. Low-end hardware performance and WebGL context-loss recovery have not been benchmarked.
- No service worker or offline-installation guarantee is included. Once loaded, the game needs no backend service.
- Legacy binary saves, mods, other scenarios, and future-version migrations are unsupported.

## Reference protection

`baye-fmj-app-main/` remains untouched and is explicitly ignored by Git, compilation, formatting, tests, and file watching. No source, assets, dependencies, test output, or generated files were written there. The release contains the independent remake only; a fresh clone does not need the reference folder.
