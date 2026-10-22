# v0.3 implementation and acceptance status

Documentation checked October 22, 2026. Active branch: `hegemony_of_the_three_kindoms_v0.3`; implementation commit: `1e02e65`. **Core implementation, F01–F08 and RV01–RV10 are complete with recorded automated evidence.** This is a local playable candidate; human acceptance is not complete. [Features](release-notes.md) · [How to play](player-guide.md) · [Open work](../next-steps.md).

The subsequent October 22 playability/UI implementation is tracked in the [new implementation ledger](playability-implementation.md), including current automated results and unchanged human gates. The validation counts below describe the earlier RV candidate.

## Implemented scope

| Track                 | Delivered behavior                                                                                                                                  | Remaining boundary                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G Geography           | 24 anchors, 42 estimated links, distance/profile/ETA labels, multi-hop travel and anchor-sensitivity report.                                        | Approximate anchors/roads/generalized rivers; not historical GIS reconstruction.                                                                            |
| L Calendar/logistics  | Daily clock/cursor, fixed-point food, service accounting, reservations, cargo delivery, arrivals/return and month boundaries.                       | New long-session edge cases need player evidence; do not extrapolate focused tests to every route-failure sequence.                                         |
| V Governors           | Direct capital, monthly autonomous work, boundary appointments, troop-free travel/handover, plans/answers/recall and shared work/stock eligibility. | Development now uses a shared 500-point cap; seeded and loaded values retain their scale. No multi-city coordination or stochastic future-budget simulator. |
| B Battles             | Four 24×20 templates, six types/tactics, ZOC/morale/camps, common water, forecasts/AI, saved player submissions and aftermath.                      | Human battle feel and campaign pacing are not certified by automated passes.                                                                                |
| R UI/rendering        | React/SVG camera/minimap controls, stable fitting, exact living-unit counts, full inboxes, bilingual feedback/Wiki, conditions and confirmations.   | Real low-end hardware, broader manual readability and long-session usability remain open.                                                                   |
| A Artwork             | Seven active generated definitions and one inactive paper alternative, documented source/hash/anchors and native fallback.                          | All draft. Dedicated full figure art covers infantry/archer/cavalry; the other types use native identities. Revisions/approval are open.                    |
| I Integration/storage | New entry/save namespace, strict associations/limits, autosave/export/import recovery, Campaign menu/Resume and safe transient reset.               | Very long human campaigns still need field exposure.                                                                                                        |
| Q Validation          | Unit/integration/browser/production/performance checks, diagnostics and preserved evidence.                                                         | Four user sessions, real low-end test and art acceptance remain outstanding; remote CI deferred.                                                            |

Detailed rules: [numbered system references](README.md#system-references). Full P01–P11 handoff history: [prior implementation plan](history/implementation-plan-2026-10-21.md).

## Closed repairs

| Milestone | Completed scope                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01–F03   | Small-party fixed-point rations; arrival-only, once-only loot; undelivered full-store cargo accounting.                                             |
| F04–F06   | Stop at event/month boundaries, battle-created returns move next day, unique officer/militia formation identities.                                  |
| F07–F08   | Reject nonparticipant battle commands; validate save cross-references and unique active associations.                                               |
| RV01–RV02 | Participant-only clock/UI battle gating; stable main frames, compact minimaps, Fit geometry and Resume observer.                                    |
| RV03–RV05 | Campaign recovery/import/save feedback; complete player inbox/report backlog; troop-free incumbent transfers and correct appointment states/labels. |
| RV06–RV08 | Living-unit selection/counts, economy/stat/help/availability, bilingual routine results/rejections/logs/formation names.                            |
| RV09–RV10 | Shared-rule tactical condition inspection and cancelable, focus-safe whole-battle withdrawal.                                                       |

[RV completion ledger](playability-review-and-todo.md#rv-completion-ledger) records exact criteria and ownership. The [initial audit of 33ad2fc](history/implementation-audit-33ad2fc.md) and pre-repair screenshot/clock reproductions are historical records. They must not be presented as current blockers.

## Recorded validation

These results were obtained October 21 for the RV candidate, not rerun by the October 22 documentation cleanup:

| Check                       | Recorded result                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Full unit/integration suite | 668 passed, one existing skip, 46 files; includes legacy and v0.3 tests.                                 |
| v0.3 browser suite          | 34 passed; six affected capital/Wiki/responsive cases rerun after final CSS.                             |
| TypeScript/production build | Pass; 670.05 kB application JS before gzip, existing chunk-size advisory and dependency-comment notices. |
| Production subpath          | One pass for `/hegemony/` assets and save reload.                                                        |
| Tactical performance        | One pass for existing 10v10 tactical-day p95 <50 ms on the recorded host; not rendering FPS.             |
| Formatting/whitespace       | Pass.                                                                                                    |
| Portrait validation         | 53 named mappings plus garrison, 108 WebP renditions; technical validation, not new v0.3 art approval.   |

[Commands, environment and nine runtime captures](evidence/rv-implementation-2026-10-21/README.md). Browser assertions cover EN/ZH, 390/1366/1920 effective CSS px and 200% zoom, four-map Fit corners/occupancy, ten-frame stability, NPC/mixed/two-player day submission, storage recovery, inboxes, transfers, reserve/assignment/march and withdrawal.

## Balance disposition

The final 24-run 96-month narrow-bot matrix recorded no selected-player elimination, true unification or Hegemon victory. Paired tuning variants did not show a safe progression improvement; the player accepted the miss and retained the conservative rival policy. The bot's limited policy is not a human win-rate target. N/A observations are not zeroes. [Campaign evidence](evidence/README.md) preserves raw results, generation hashes and rejected experiments; those hashes do not fingerprint this later whole tree.

## Open work, acceptance and publication

- The development-cap repair and other playability tasks now have implementation and checks in the [new ledger](playability-implementation.md).
- Four player sessions: each 12 campaign months and three manual battles. The player chose to play and report; not deferred or passed.
- Real low-end-machine startup/map/battle/long-resolution check, with actual hardware/browser observations.
- Specific art revision feedback, revised runtime review and approval. All generated v0.3 art remains draft.
- Push, PR and remote CI remain explicitly deferred. Local configuration/passing local tests do not imply remote CI passed.

The v0.2 human-gate deferral and earlier portrait/profile approvals apply only to that recorded scope. They do not waive these v0.3 gates. See [next steps and test record](../next-steps.md).
