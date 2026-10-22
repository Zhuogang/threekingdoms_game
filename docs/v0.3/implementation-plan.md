# v0.3 implementation plan and maintenance handoff

Updated October 22, 2026 for branch `hegemony_of_the_three_kindoms_v0.3`, implementation `1e02e65`. **The planned core tracks and RV01–RV10 are implemented.** A newly found development-limit mismatch and the outstanding acceptance gates are listed below. [Status](implementation-status.md) · [Features](release-notes.md) · [Original P01–P11 plan](history/implementation-plan-2026-10-21.md).

## Completed packages

| Packages                 | Result / owner boundary                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P01–P03, F01–F07         | Daily ledgers, cargo, day cursor, arrivals/aftermath, unique rosters and battle authority; L/B/I/Q.                                                                                              |
| P04–P05                  | Monthly autonomous work/appointments, approved reward/equipment/relief, troop-free transfer, D8 plan UI and Wiki; V/I.                                                                           |
| P06                      | Six ported tactics, ZOC/retreat, forecasts/resolution, common water, AI and timeout policy; B.                                                                                                   |
| P07                      | Anchor/route estimates, journey display and sensitivity evidence with research limits; G/L/R.                                                                                                    |
| P08                      | Camera/Fit/focus/minimaps, route/party layers and keyboard/locale integration; R/I.                                                                                                              |
| P09 integration          | Existing draft assets and provenance integrated; A/R. Full art variants and human approval are not claimed complete.                                                                             |
| P10–P11, F08 foundations | Strict save/recovery and association validation, regression/diagnostics tools, campaign evidence and local checks; I/Q. Human acceptance is separate.                                            |
| RV01–RV10                | Clock/layout, recovery/inboxes/transfers, unit presentation, capital help/eligibility, localization, inspection and confirmation; completed by integration/rendering/domain agents plus root QA. |

Use the [RV ledger](playability-review-and-todo.md#rv-completion-ledger) and [recorded validation](evidence/rv-implementation-2026-10-21/README.md), not unchecked historical brief lists, to determine what is finished.

## Current work, owners and acceptance

| Work                   | Owner                                                           | Next concrete step                                                                                                                                         | Acceptance                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development limit      | V owns rule review; I updates controls; Q validates             | Reconcile the 100 action limit with 240–380 farming/220–355 commerce starting values, preserving intended economy and save behavior.                       | Both scenarios expose honest eligibility; a chosen development rule is reachable and tested in capital/governor work without accidental income or save changes. |
| Four long sessions     | Player; Q triages observations                                  | Follow the [test record](../next-steps.md#player-test-record), vary scenario/house and exercise campaign, transfer, orders, water/tactics and save reload. | Four records, each 12 months and at least three manual battles; discoveries retained with saves/steps, unresolved issues explicit.                              |
| Real low-end test      | Player; R/I diagnose                                            | Test startup, atlas, one 24×20 battle, camera/minimap and long resolution on actual hardware.                                                              | Device/OS/browser/viewport and observed timings/responsiveness; clear pass/issues, not simulated-device substitution.                                           |
| Art revisions          | Player gives notes; A edits, R integrates, Q checks             | Use current runtime screenshots, identify only affected assets and follow [art workflow](06-imagegen-and-artwork.md#next-revision-steps).                  | Runtime review at Fit/working zoom and small/narrow views; dimensions/alpha/anchors/hash/provenance match; only explicitly approved scope changes status.       |
| Reported defect repair | Relevant domain owner; I single shared-file editor, Q validates | Reproduce from a specific report before changing behavior. Add a regression where meaningful, implement bounded fix, update help/evidence.                 | Original reproduction and relevant regressions pass; costs/authority/time/save invariants retained or an explicit decision documented.                          |
| Publication            | User authorizes later; I/Q                                      | Remains deferred. Preserve local candidate and evidence.                                                                                                   | When resumed: authenticate, publish branch/PR and verify actual remote CI; none claimed now.                                                                    |

## Guardrails for subsequent coding agents

1. Read current overview/player guide/status and the relevant numbered system reference. Read historical design only for rationale, not as blanket authorization for unfinished expansion.
2. Keep daily time, 30-day months, 24×20 fields, no siege, universal water, troop-free boundary handover and the single v3 save contract.
3. Use shared eligibility/forecast/terrain/food queries. Preserve protected stock, whole-officer parties, once-only dispatch/delivery and serialized daily cursors.
4. For parallel work, separate domains; one editor owns shared App/engine/types/commands/storage at a time. Art generation does not need to share renderer/rules files.
5. Run checks appropriate to changed behavior and record source/config/environment. Preserve historical test/balance/art records. Do not claim an old hash or old version's human waiver applies now.
6. Ask for a product decision only when a concrete new rule/tradeoff is needed. Do not reopen D1–D11, add siege/old-save conversion or launch unsolicited art batches.

Multi-city coordination, full future-budget simulation, additional figure/region art packs and more historical GIS detail remain documented limits or potential later scope. They are not silently added to the current version's coding queue. Strategic diagnostic miss is accepted; no new broad AI/victory redesign is authorized by this document.
