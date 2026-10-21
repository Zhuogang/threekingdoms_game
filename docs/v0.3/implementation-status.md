# v0.3 implementation status

Updated 2026-10-21 after a full source-to-plan audit. Branch: `v0.3`, based on `main` at `b9ee0b9`. **Status: playable implementation candidate with confirmed defects and incomplete planned features. The tracks are not all complete.**

Read [the audit and reproductions](implementation-audit.md) for findings and [the remaining implementation plan](implementation-plan.md) for agent assignments, priorities, steps and acceptance criteria. The current review changes documentation and diagnostic evidence; it does not fix the game code. v0.2 approvals and exceptions do not count as v0.3 acceptance.

## Track handoff

| Track                   | Implemented foundation                                                                                                   | Current disposition / remaining work                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G — geography           | 24 anchors, 42 estimated routes, deterministic travel profiles and provenance.                                           | Partial. No corridor polylines or C-grade sensitivity report; direct-edge routing only. P07.                                                                                               |
| L — calendar/logistics  | Absolute-day clock, route snapshots, journey progress, return and delivery paths.                                        | Defects confirmed: fractional rations, raid double credit, full-store loss, missed event pause and same-day return movement. Daily city/pay ledger and arrival queues incomplete. P01/P02. |
| V — governors/orders    | Capital authority, monthly appointments, troop-free remote transfers, order previews/answers and limited rival dispatch. | Partial. Full governor work planner, capital action set, appointment recovery and complete D8 UI missing. P04/P05; see track 03 audit.                                                     |
| B — battles             | Four 24×20 templates, basic movement/attack/counter, universal water penalties and default survivor-count timeout.       | Partial. Militia-ID crash and foreign-battle command acceptance confirmed. Tactics/ZOC/retreat/forecast, stronger AI and full rule matrices missing. P02/P03/P06.                          |
| R — rendering/UI        | SVG atlas/battlefield, 2:1 projection/hit testing, minimap primitives, native fallbacks and responsive shell.            | Partial. Playable camera/minimap integration, full battle navigation, map journeys, accessibility and dynamic localization remain open. P03/P05/P08.                                       |
| A — ImageGen/art        | Seven candidate assets with source prompts, hashes, dimensions and alpha metadata; integrated into candidate views.      | Draft for revisions by player decision. Regional validation/variants and small-scale human review pending. P09.                                                                            |
| I — integration/storage | Independent entry point/save namespace, eight bilingual Wiki articles, build and browser smoke.                          | Partial. Cross-entity validation, long-save retention, failure recovery, lifecycle/UI wiring and Wiki accuracy remain open. P03/P05/P10.                                                   |
| Q — validation/balance  | Targeted unit suite, whole-repo regressions, browser smoke and tactical-day performance baseline.                        | Partial. Defect regressions, E08, full E13–E15, long campaigns, global/render performance and human evidence missing; CI script is stale. P11.                                             |

## Cross-track acceptance scenarios

“Partial” means the original whole scenario is not accepted, even when its narrower tests pass.

| ID  | Status              | Evidence and remaining requirement                                                                                                                                   |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | Partial             | 42 route nominal values and Hanzhong–Chang'an composition formulas pass. App shows baseline days rather than a complete actual-party/transport preview; P05/P07.     |
| E02 | Fails full contract | Pure timeline stepping passes, but runtime F04 advances day 29→39 over the new month event at 30; event pauses are not integrated per day.                           |
| E03 | Partial             | Date math and isolated boundary cursor tests pass; arrivals settle after the advance call/month handler, and F04/F05 invalidate full integrated ordering.            |
| E04 | Partial             | Capital-only development and authority tests pass. Many planned city commands do not exist; capability/answer-phase mismatches remain.                               |
| E05 | Partial             | Rule-level shortages, reduction/wait/cancel and atomic dispatch tests pass. The player cannot complete all branches or inspect full dates/gaps through the UI.       |
| E06 | Partial             | Local/remote appointments and boundary activation are tested. Troop-free restriction, failed transfer recovery, acting governor and capture/empty-seat cases remain. |
| E07 | Fails full contract | Ownership-change redirect cases pass, but F03 loses full-store cargo; arrival queues/route legality/recall and no-refuge recovery are incomplete.                    |
| E08 | Incomplete          | One battle save/resume and pure cursor tests pass. No separate manual completion per battle, campaign return is ineffective, and F05/F07 affect integrated play.     |
| E09 | Basic pass          | Six classes use common water movement and damage modifiers; more complete guard exit/budget and map-path matrices remain under B.                                    |
| E10 | Partial             | Basic shore/range/counter and multiplier tests pass. Planned tactics and shared damage forecast are absent; no full six-by-six × four-position execution matrix.     |
| E11 | Basic pass          | New city schema excludes defense; maps have no siege terrain. Militia construction still has F06 and its planned baseline needs reconciliation.                      |
| E12 | Partial             | Geometry covers all 480 cell centers; browser smoke opens four templates. No full target connectivity/20-seed matrix or geographic/camera acceptance.                |
| E13 | Partial             | Smoke checks campaign widths 390/1366/1920, with English at 390 then Chinese at desktop widths. Not the full widths × languages × battle × zoom/keyboard matrix.     |
| E14 | Partial             | Valid v3 roundtrip and old/malformed rejection pass. F08 is accepted by validation; byte limits, complete associations and long-campaign bounds remain open.         |
| E15 | Partial             | Native missing-image fallback and unit alpha checks exist. Remount resources, reduced-motion and idle/render measurements remain unverified.                         |

## Decisions and scope

- D1–D11 remain the target contract. D3/D9/D10 have implemented foundations; D1/D2/D4–D8 have material remaining work identified by this review. Do not describe D1–D10 as universally complete.
- D11 defaults to `survivor-count`: greater living troop total wins, defender wins ties. Helpers and rival-dispatch tests cover this default; complete strategic aftermath cases still need coverage. The optional internal `field-control` policy is a different policy and its draw test is not proof of D11.
- On 2026-10-21 the player asked to keep all seven art assets `draft` for revisions. Specific revision notes remain pending; no automatic asset approval.
- The player will perform and report the four campaign/battle sessions and real low-end-machine check. These are open, not deferred or completed.
- No v0.3 48/96-month balance sweep, full rendering/global-day benchmark or remote CI result is claimed. Existing v0.2 diagnostics run the old engine.
- The player explicitly authorized a new local `v0.3` branch and commit. Push, PR, merge, remote CI and publication remain outside this action.

## Automated evidence

| Command / evidence                                              | Result                           | Scope and date                                                                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx vitest run tests/v03 --maxWorkers=1 --no-file-parallelism` | 100 passed / 13 files            | Re-run during this audit, 2026-10-21; includes tactical-day performance case.                                                                                                  |
| `npm test -- --maxWorkers=1 --no-file-parallelism`              | 467 passed, 1 skipped / 31 files | Re-run during this audit, 2026-10-21. Includes old-engine regressions, not 467 v0.3 acceptance cases. TEMP/TMP redirected to an ignored workspace cache.                       |
| `npm run build`                                                 | Pass                             | Re-run during this audit; TypeScript + Vite. Nonfatal upstream Zod purity-comment warnings.                                                                                    |
| Battle-focused performance run                                  | p95 7.30 ms, max 7.90 ms         | Audit run by B; 30 samples of one two-sided 10v10 tactical day. Earlier baseline p95 5.44/max 6.21 ms retained as history, not a whole battle benchmark.                       |
| `npm run test:e2e`                                              | 6 passed                         | Previous candidate run on 2026-10-21; source unchanged in this audit. Campaign/save, single battle, four templates, basic bilingual Wiki, responsive campaign and alpha smoke. |
| `npm run test:production`                                       | 1 passed                         | Previous candidate run on 2026-10-21; `/hegemony/` hosting/assets/save-reload and no external requests/page errors.                                                            |
| Targeted audit diagnostics                                      | F01–F08 observed                 | [Exact output](evidence/reproductions.json) and [reproduction script](evidence/reproduce-implementation-audit.mjs). These are defects, not passing acceptance results.         |

Formatting, Markdown links and staged whitespace checks are verified for the final documentation snapshot before the local commit. CI currently calls a removed `test:perf` script and must be corrected under P11 before any remote result is expected.

## Immediate queue

1. P01/P02/P03/P10: conservation, daily scheduling, battle creation/control and save invariants.
2. P04/P05/P06: complete governor/capital/retained campaign rules, D8 UI, battle actions and AI.
3. P07/P08/P09 in parallel: route evidence, map controls/readability and draft-art revision.
4. P11: integrate new failure cases, real v0.3 bot/long runs, complete performance/accessibility matrix, then player feedback and final acceptance.
