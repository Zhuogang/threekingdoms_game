# RV01–RV10 implementation validation

October 21, 2026 · local branch `v0.3` · follows the review saved in `91c9623`. The [completion ledger](../../playability-review-and-todo.md#rv-completion-ledger) maps each task to implementation and acceptance evidence. The original [failure reproduction](../review-2026-10-21/runtime-check.json) remains historical evidence, not a current defect report.

## Automated checks

| Check                                              | Result                          | Scope and limits                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | 668 passed, 1 skipped; 46 files | Full legacy/v0.3 unit and integration suite, including new city eligibility, save classification, feedback, formation names, terrain/fire inspection and rendering cases. Existing skip retained. |
| `npm run test:e2e`                                 | 34 passed                       | Existing fifteen browser cases plus nineteen new RV regressions. Chrome on Windows; isolated local Vite server, one worker.                                                                       |
| `npm run build`                                    | Pass                            | Includes TypeScript. Application JS 670.05 kB before gzip; existing >600 kB advisory and two Zod comment notices remain. No new dependency was added.                                             |
| `npm run test:production`                          | 1 passed                        | `/hegemony/` assets, startup, local save and reload in the production build.                                                                                                                      |
| `npm run test:perf:v03`                            | 1 passed                        | Existing 10v10 tactical-day p95 test meets its 50 ms threshold on this host. This is simulation timing, not rendering FPS or low-end hardware evidence.                                           |
| `npm run validate:portraits`                       | Pass                            | 53 named mappings plus garrison; 108 WebP renditions, 0.97 MiB; provenance/checksum validation. Human art acceptance remains separate.                                                            |
| `npm run format:check`, `git diff --check`         | Pass                            | Full repository formatting and whitespace checks after final documentation edits.                                                                                                                 |

Vitest used an ignored workspace temporary directory via `TEMP`/`TMP`/`TMPDIR` because the restricted Windows environment cannot create its default AppData temporary directories. Browser tests used isolated ports rather than the player's local game or browser profile; test servers and test browsers were closed after each run.

The first integration browser pass exposed a real overlap between the persistent save-error alert and export toast. Their separate top/bottom placement was corrected and actual Retry/Close clicks were checked at 390 effective CSS px, including 200% zoom. Two test locators were corrected to use the actual controls, and existing Wiki locators were scoped to the topbar after adding a contextual guide link. Final review additionally repaired the resumed battlefield observer, explicit pending dismissal, competing F1 modal, and Chinese production formation names. Final passing results supersede those development failures.

After the final capital-help grid adjustment, the six affected capital/Wiki/responsive browser cases were rerun and passed. The final production build/subpath test and repository formatting/whitespace checks also passed after that adjustment. This supplements the 34-case suite; it does not add six distinct test cases to the reported total.

## Browser acceptance coverage

- RV01: natural Sun/seed `610301`/day-40 NPC-only battle advances through the actual UI in EN/ZH; one player plus one NPC battle and two player battles require only the appropriate submissions, including reload between submissions. Existing engine nonparticipant rejection remains covered.
- RV02: four templates × EN/ZH × 390/1366/1920 effective CSS px × 1×/2× zoom. Fit contains every projected corner; projected occupancy exceeds 60% on at least one axis. Ten settled samples drift by no more than 1 CSS px. Atlas minimap stays within its frame and 240 px/31% limit. Menu Resume followed by resize updates the battlefield camera.
- RV03: active/finished campaign menus, Cancel/Resume preservation, confirmed replacement and Export availability; failed import preserves a real request preview and troop draft, successful same-ID/cross-scenario imports reset both; blocked storage still permits export and retry/reload in both languages.
- RV04: nine player orders mixed with nine rival orders, twelve outstanding reports, complete discoverability and successful advancement after acknowledging all due reports. Rival orders have no player controls. Existing domain tests cover order answer/recall authority and transitions.
- RV05/RV06: actual troop-free incumbent transfer; source authority retained during travel; pending dismissal survives reload in EN/ZH; defeated units are absent from map/minimap/roster, while 500/700 counts remain exact. Unit tests cover counts from 1 to 100,000 and historical-state retention.
- RV07/RV08: either-cap training is disabled, recruitment updates visible reserve, action availability matches authoritative validation, existing reward/equipment/relief UI sequence preserves numeric effects, and bilingual Wiki explains recruitment/assignment. An additional EN/ZH browser flow recruits, assigns 100 reserve soldiers to an officer and dispatches a whole-officer force through visible controls, checking each state result. The guide explains the existing whole-officer march constraint. Domain tests exercise emitted feedback for all fourteen city actions and six tactics, confusion outcomes, routine rejections, water suffixes, lifecycle and actual generated formation names; English and numbers are preserved. Chinese browser roster and input labels use localized names.
- RV09/RV10: current/next weather, food and selected-unit/tile conditions render in both languages; shared effect helpers match six troop types and all four shore/water pairings. Cancel/Escape preserves the whole battle state, returns focus, F1 cannot stack Wiki over confirmation, and Confirm concedes the battle once. Dialog/inspection/backlog controls remain reachable at narrow/200% layouts.

## Fresh runtime captures

Chrome, Windows, 1920×1080, device scale 1, actual runtime assets and overlays. Reviewed after the map-frame, count-badge and rail containment fixes. Fit shows the full battlefield; working zoom is two Zoom in clicks and intentionally shows a closer area. The campaign minimap remains compact. These captures establish layout evidence and provide material for player art feedback; they do not approve the artwork.

| View                       | Fit                                        | Working zoom                                         |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| Campaign                   | [Atlas](campaign-atlas-fit.png)            | Campaign pan/zoom remains covered by browser tests   |
| Lower Yi–Shu plain / Xiapi | [Full field](battlefield-xiapi-fit.png)    | [Closer view](battlefield-xiapi-working-zoom.png)    |
| Shouchun waterway          | [Full field](battlefield-shouchun-fit.png) | [Closer view](battlefield-shouchun-working-zoom.png) |
| Hanzhong valley            | [Full field](battlefield-hanzhong-fit.png) | [Closer view](battlefield-hanzhong-working-zoom.png) |
| Chengdu basin              | [Full field](battlefield-chengdu-fit.png)  | [Closer view](battlefield-chengdu-working-zoom.png)  |

Battle captures use `reviewBattleState` from `tests/e2e-v03/playability-fixtures.ts`: a real command-created Cao/Puyang → Xiapi party, with travel shortened for testing and regional terrain substituted. The destination heading therefore remains **Xiapi** while the field-region kicker identifies the displayed template. They are synthetic rendering fixtures, not claims of historical battle locations. README images are refreshed from Atlas Fit and Shouchun Fit. No ImageGen assets or provenance statuses were changed; all v0.3 generated assets remain `draft`.

## Remaining gates and scope

No RV implementation decision remains pending. The conservative rival policy and accepted strategic diagnostic miss are unchanged. Long balance matrices were not rerun; their generation-time hashes are not fingerprints of this patch. Shared capital validation now enforces existing approved-order resource reservations; normal action costs, effects, caps and combat/travel constants are unchanged.

The player still owns four 12-month/three-manual-battle play sessions, the real low-end-machine check, and specific art revision feedback/approval. These are open, not deferred or passed. Push, PR and remote CI remain explicitly deferred. This record supports a tested local candidate, not full release acceptance.
