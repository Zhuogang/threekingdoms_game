# v0.3 implementation plan and maintenance handoff

Updated October 22, 2026 for branch `hegemony_of_the_three_kindoms_v0.3`, implementation `1e02e65`. **The planned core tracks and RV01–RV10 are implemented.** A newly found development-limit mismatch and the outstanding acceptance gates are listed below. [Status](implementation-status.md) · [Features](release-notes.md) · [Original P01–P11 plan](history/implementation-plan-2026-10-21.md).

## 2026-10-26 伤兵机制实施计划

从 `3a53501` 实施的伤兵机制 W0–W6 已完成，W7 自动验证和三组机器短回放通过；实施后复核修复了整编、断粮、粮债、等待改道和快照关联边界，新增 10 个失败后修复的回归用例。当前全量 465 项测试、本轮 12 项中英浏览器回归、构建、UI、格式及链接检查通过。首轮 103 项浏览器分批证据与三个可导入场景保留在[首轮记录](evidence/wounded-system-2026-10-26/README.md)，最新结果见[本轮复核记录](evidence/wounded-review-2026-10-26.md)及[实施计划](10-wounded-system-implementation-plan.md)。[设计](09-wounded-retreat-and-captivity-design.md)数值未改，长期人工平衡试玩待执行。新存档要求 `personnelSchema: 1`，旧档只提供原文导出，不迁移。下列为历史记录。

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

## 2026-10-25: soldier experience foundation and typed recruitment

Stage 2 task 2, step 1 introduces soldier mean experience independently of officer experience. New troops start at 0; level is `min(20, 1 + floor(experience / 100))`, with experience bounded to 0–1900. No combat experience awards, combat bonuses or elite-art switch are implemented in this step.

- `troopExperience` follows each officer's soldiers. Splits preserve the mean, actual merges use troop-weighted means, and uniform casualties preserve survivors' mean. A force reduced to zero loses its soldier experience. Temporary battlefield grouping computes a mean for the token while preserving each original troop contingent's experience on settlement.
- Cities have separate infantry, archer and cavalry reserve pools, each holding count and mean experience. `reserve` is their validated total. Initial reserve allocation is 50% infantry, 25% archers, 25% cavalry; all start at zero experience. Returning soldiers enter their own troop-type pool; an officer can only draw that same type. Officer identity, experience and level do not change during these transfers.
- Recruitment explicitly selects a troop type (the command default is infantry). The batch baseline is `300 + organizer.force * 5`, bounded by population above the protected 1,000 residents. Infantry gets 100% for 200 gold; archers get 75% for 350 gold. Cavalry gets 60% for 400 gold in the north, 35% for 600 gold in the central region, and 20% for 800 gold in the south. Counts round down, costs are per order even for population-limited batches. These are initial game-balance values, not historical estimates. The UI previews count and price, and autonomous governors recruit their organizing officer's troop type under the same costs and reservation checks.
- North: Beiping, Jinyang, Ye, Pingyuan, Beihai, Tianshui, Chang'an. Central: Luoyang, Puyang, Chenliu, Xuchang, Xiapi, Shouchun, Wancheng, Hanzhong. Remaining cities are southern recruitment locations. Configuration is in `campaign/recruitment.ts`.
- Cavalry consumes twice the food of infantry/archers while stationed, travelling and fighting. Mixed parties and campaign supply estimates count actual cavalry soldiers; troop headcount, gold upkeep and officer identity remain separate. Cavalry soldier-days are accumulated separately for monthly food bills.
- Friendly transfers, campaign dispatch, retreat/return, monthly losses and Luoyang evacuation preserve the appropriate typed pools and experience. Unled garrison infantry has its own `garrisonExperience`, excluding officer-led soldiers, and is carried through the battlefield militia snapshot.
- New saves require the experience fields and typed reserve pools. Missing fields are rejected; no old-save conversion is provided. Fractional means survive save/reload.

Remaining approved steps: battle experience awards and level modifiers; then elite art, level display, reinforcement previews and progression reports. The eight naval commanders and portrait-based tower-ship selection are unchanged.

## 2026-10-25: battle experience and soldier level effects

Stage 2 task 2, step 2 implements the previously approved combat progression rules:

- Each battlefield unit persists actual combat casualties dealt and received. Normal attacks, counterattacks, fire, ambush and rockfall count clipped enemy losses. Movement, holding, support tactics and hunger do not count as combat participation by themselves.
- At campaign battle settlement, a surviving unit that dealt or received combat casualties earns `40 + 80 * min(1, casualtiesDealt / initialTroops) + (won ? 20 : 0)` mean experience. Fractional gains are retained; the per-battle maximum is 140 and the total cap remains 1900. Surviving retreating/losing forces and draws retain the participation and damage portions; eliminated or unengaged units earn nothing.
- Rewards apply only after the battle ends, through the existing one-time settlement guard, including auto-commanded and NPC battles. In-progress combat counters survive save/reload; no old-save conversion is added.
- Temporary formations retain each original contingent's experience. Settlement first allocates surviving soldiers, then adds the formation's reward to each surviving contingent with its own cap. The final formation snapshot is recomputed from the resulting soldiers, including individual caps and rounded survivor counts. Unled militia follows the same reward rule and returns its experience to the city.
- Normal attack and counterattack damage multiply by `1 + 0.02 * (attackerTroopLevel - 1)` and `1 - 0.01 * (defenderTroopLevel - 1)`, together with existing terrain, morale and water modifiers before final casualty rounding. Level 1 is unchanged; level 20 has 1.38 output and 0.81 incoming damage. Attack previews and AI use the same calculation as execution. Damage tactics retain their existing officer-based calculations and receive neither soldier-level multiplier.
- Officer progression, troop types, naval eligibility, portraits and artwork are unchanged. Elite art, level UI, reinforcement previews and progression reports remain step 3.

Validation covers effective combat statistics, overkill, level boundaries, terrain/water composition, tactic exclusions, defeat/draw/victory rewards, starvation, total caps, real retreat and return, automatic command, temporary formation settlement and save/reload without duplicate rewards.

## 2026-10-25: elite art and progression presentation

Stage 2 task 2, step 3 integrates the six previously approved heavy-infantry, elite-cavalry and strong-archer sprites through the existing transparent WebP packaging script. At mean XP 1000 (level 11), the three base troop types switch to their elite display names and art; below that threshold they revert. Current headcount independently selects small (<500) or large (>=500) art. Water always selects the existing commander-based boat/tower-warship rule first. Portraits and troop identity are retained.

- Battlefield map tooltips, sidebar rows/details, officer lists/details, army selection and typed reserve summaries expose soldier progression separately from officer progression. Experience displays retain two decimal places without rounding across a level boundary, include distance to the next level, and show the cap at level 20.
- Troop assignment previews use the actual pure command result. Before/after formations show count, level, XP and elite/regular changes, including dilution, incoming veterans and assigning zero soldiers. Invalid orders do not show a successful preview.
- Battle reports store immutable per-original-contingent growth snapshots, plus militia: troop type, surviving count, pre/post experience and participation. The battlefield retains opening experience for annihilated militia. Reports show actual capped XP gains, level changes, elite promotions, no participation and annihilation; later soldier transfers cannot rewrite the result. Save schemas require the new fields; no conversion is added.
- The existing approved combat growth and level modifiers remain unchanged. Both English and Chinese flows, responsive layouts, the 10/11 and 499/500 boundaries, fallback markers, portraits and vessel switching are covered by targeted rendering, integration and browser verification.
