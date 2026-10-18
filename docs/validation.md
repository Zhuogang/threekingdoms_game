# Hegemony of the Three Kingdoms v0.1 — validation

October 17, 2026. The release audit passed **121 unit tests, 18 gameplay browser tests, three production browser tests, strict compilation, formatting, and dependency auditing**. Six reproduced defects were fixed with regression coverage. These results apply to the authored `baye-atlas-1` ruleset; they do not establish exact parity with the legacy engine or guarantee that no bugs remain.

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
