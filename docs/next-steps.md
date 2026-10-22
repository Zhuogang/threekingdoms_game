# To-do, design decisions and next steps

**October 21, 2026 update:** v0.3 is the active game. Its confirmed decisions and shared contracts are in [docs/v0.3/00-decisions-and-contracts.md](v0.3/00-decisions-and-contracts.md); implementation tracks and evidence are in [docs/v0.3/README.md](v0.3/README.md) and the [implementation status ledger](v0.3/implementation-status.md). It defines an independent game with geographic travel baselines, daily simulation, governor autonomy, 24×20 high-oblique ink battlefields and universal water combat. Siege systems and old-save compatibility are excluded. The v0.2 completion/deferral records below remain historical evidence.

## Active v0.3 update and to-do

**Branch `v0.3`; local candidate with RV01–RV10 implemented, awaiting human acceptance.** The original F01–F08 defects and follow-up interface/presentation repairs are complete. Use the [playability completion ledger](v0.3/playability-review-and-todo.md#rv-completion-ledger) for implemented outcomes, parallel agent assignments and acceptance evidence. The table below records the completed RV scope; art/player gates remain open. The [implementation plan](v0.3/implementation-plan.md) retains the P01–P11 milestone record; the original audit is a historical pre-fix snapshot.

| Order  | Task / owner        | Current-version outcome                                                                             |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------- |
| 1      | RV01 · I/B/Q        | Allow campaign time to advance during NPC-only battles; preserve player battle authorization.       |
| 2      | RV02 · R/Q          | Keep the campaign minimap compact and stabilize battlefield framing; add geometry assertions.       |
| 3      | RV03 · I/Q          | Reach New/Resume safely; clear stale drafts on successful import; distinguish save/export feedback. |
| 4      | RV04 · I/V/Q        | Keep every player order and pending report discoverable instead of silently truncating the inbox.   |
| 5      | RV05 · V/I/Q        | Expose existing troop-free governor transfers and label replacement/dismissal accurately.           |
| 6      | RV06 · B/R/Q        | Make surviving/defeated units, selection and small troop counts visually trustworthy.               |
| Then   | RV07/RV08 · V/I/B/Q | Show reserve/officer stats and correct action availability; finish routine EN/ZH feedback.          |
| Polish | RV09/RV10 · B/I/Q   | Inspect existing weather/supply/terrain effects; confirm immediate withdrawal.                      |
| Gated  | A/R + player        | Review art after layout repairs; revise only from concrete notes and keep draft until approved.     |

- [x] Original F01–F08 defects repaired and regression-tested; planned core campaign/governor/battle/save/Wiki systems integrated.
- [x] Strategic diagnostics and rejected tuning variants documented; the user accepted the measured miss and retained the conservative one-front rule.
- [x] Original read-only playability review saved in `91c9623` on October 21, 2026; RV implementation followed in this patch.
- [x] RV01–RV06 progression/reachability/presentation repairs and RV07–RV10 usability polish, including post-integration menu/observer/dismissal/formation-name fixes.
- [ ] Four campaign/battle sessions and a real low-end-machine check: **player will run and report**; these are neither deferred nor passed.
- [ ] Art finalization: **keep draft for revisions**, specific revision notes pending.
- [ ] Push/PR/remote CI/publication remain deferred. The local CI configuration already uses `test:perf:v03`; no remote CI result is claimed.

Fresh RV verification is recorded in the [validation and screenshot record](v0.3/evidence/rv-implementation-2026-10-21/README.md). New regressions cover the actual NPC-only clock lock, mixed/two-player battles, fitted maps and compact minimaps, recovery, inbox backlogs, governor transfers, living troop counts and bilingual tactical UI. The previous 594/15-test review is retained as historical evidence, not the current result.

## Historical v0.2 disposition

Status on October 20, 2026, branch `hegemony_of_the_three_kindoms_v0.2` (formerly `v0.2`): implementation and design decisions are complete; integrated verification is recorded in [v0.2-validation.md](v0.2-validation.md). This checklist also tracks the release action and v0.3 proposals. It replaces the plan sections of [the v0.2 review](archive/v0.2-review.md); that review keeps the history and detailed task cards (R1–R8). [v0.2-summary.md](v0.2-summary.md) describes the result.

The [detailed v0.2 improvement plan](v0.2-improvement-plan.md), based on the read-only review at `077556c`, preserves the agent assignments, implementation steps, dependencies, acceptance criteria and Ma Chao imagegen workflow. The user subsequently authorized the full implementation. D8/D9 and the human gates now have explicit dispositions below.

## Release gate for v0.2

This checklist records local completion and explicit deferrals. D12's publication and remote CI must be resumed and verified before a merge; a checked deferral records the decision, not performance of the deferred action.

- [x] Every review item (H1–H3, M1–M11, L1–L17) is fixed or explicitly deferred. The exceptions are L15 and the battle-tuning targets below.
- [x] `npm test`, `npm run build`, `npm run format:check`, `npm run test:e2e`, `npm run test:perf` and `npm run test:production` pass.
- [x] Battle tuning is measured and D8 explicitly accepts the recorded target misses (T1 below).
- [x] Bot victories and unification are measured, and D9 explicitly accepts partial success (T2).
- [x] The final Guandu turtle check passes: Ma Teng 3/3, Liu Bei 3/3, Liu Zhang 2/3 retain all starting cities through month 6 (T3, review D10).
- [x] Ma Chao's portrait is generated, integrated, validated and approved; production tests pass (T5).
- [x] The four-session human playtest is explicitly deferred for v0.2 by the user (T6, review D11); no human gameplay observations are claimed.
- [x] The final 10v10 rendering candidate holds about 60 fps with CPU slowed 4×, with zero idle draws (T7). The real low-end-machine gate is explicitly deferred by D11; the software-rendering limitation is recorded.
- [x] Fresh diagnostics are recorded in [v0.2-notes.md](v0.2-notes.md); push, PR creation and remote CI are explicitly deferred by the user (D12).

## Historical v0.2 task checklist

Ordered. "Who" is a coding session unless it says you.

Before T1, Agent A completes [T0: measurement correctness](v0.2-improvement-plan.md#3-t0--correct-measurement-before-tuning): distinguish Hegemon wins from unification, align contested-battle definitions, record actual horizon checkpoints and make diagnostic artifacts reproducible. Existing measurements are historical evidence; final checks must identify the release-candidate revision.

### Agent assignments and detailed task cards

These roles record implementation ownership. The detailed cards preserve owned files, ordered steps, acceptance criteria and required handoff evidence; the validation record tracks actual completion.

| Agent                          | Assigned work                                                                                         | Detailed cards                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — Simulation and diagnostics | T0, then T1, T2, T3/T8 and final balance measurements                                                 | [Measurement](v0.2-improvement-plan.md#3-t0--correct-measurement-before-tuning), [battle tuning](v0.2-improvement-plan.md#4-t1--tune-battles-through-controlled-experiments), [bot](v0.2-improvement-plan.md#5-t2--improve-the-diagnostic-player-bot), [scenario checks](v0.2-improvement-plan.md#6-t3-and-t8--validate-the-final-scenario-experience) |
| B — Renderer and presentation  | T7 foundations, then T4, followed by combined visual/performance checks                               | [Renderer](v0.2-improvement-plan.md#7-t7--improve-rendering-efficiency-and-measurement), [presentation](v0.2-improvement-plan.md#8-t4--finish-battlefield-and-officer-presentation)                                                                                                                                                                    |
| C — Portrait production        | Pipeline fixes, Ma Chao imagegen, review and T5 integration                                           | [Imagegen prompt, asset contract and integration](v0.2-improvement-plan.md#9-t5--ma-chao-imagegen-and-portrait-integration)                                                                                                                                                                                                                            |
| D — Integration and quality    | Prepare evidence, integrate results and complete T9 under the full-track implementation authorization | [Human playtest](v0.2-improvement-plan.md#10-t6--prepare-and-conduct-human-playtesting), [verification and release](v0.2-improvement-plan.md#11-t9--final-verification-and-release-package)                                                                                                                                                            |

The user approved the portrait/contact sheet and four battlefield screenshots. Human gameplay sessions and the real low-end hardware check are explicitly deferred by D11. Follow the [shared-file and execution rules](v0.2-improvement-plan.md#shared-file-and-execution-rules) and [agent completion report](v0.2-improvement-plan.md#13-required-agent-completion-report) for future work.

### Task checklist

Original acceptance criteria remain in the detailed plan. The following dispositions record the implemented result.

| #   | Owner     | Final disposition                                  | Acceptance / evidence                                                                                                                                                                                  |
| --- | --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T0  | A         | Complete                                           | Correct outcomes/cohorts/censoring, raw counts, transitive fingerprints, strict resume checks and 432-month baseline-policy proof.                                                                     |
| T1  | A         | Complete with D8                                   | Thirteen controlled configurations; selected radius 4 and damage 0.18/0.1584/0.1296; actual-default 96-month and held-out confirmation. Duration/close/upset/capture-event misses explicitly accepted. |
| T2  | A         | Complete with D9                                   | Legal convoys, rehearsed joint attacks and strategic targets. 6/36 development and 5/36 held-out player wins; original broad unification target still missed and explicitly accepted.                  |
| T3  | A         | Pass                                               | Final six-month city retention: Ma Teng 3/3, Liu Bei 3/3, Liu Zhang 2/3, each meeting ≥2/3.                                                                                                            |
| T4  | B         | Complete, approved                                 | Shared level pips, four palettes and bilingual profile row. Display/language matrix and renderer tests pass; user approved the four screenshots.                                                       |
| T5  | C         | Complete, approved                                 | Ma Chao imagegen/provenance and safe pipeline; 53 named + garrison, 108 renditions, 0.97 MiB; validation and production tests pass; user approved the sheet.                                           |
| T6  | Human / D | Explicitly deferred by D11                         | Four sessions remain unobserved; repeatable procedures and disposition preserved in the playtest record.                                                                                               |
| T7  | B / D     | Automated gates pass; hardware deferred            | Actual baseline/4× rendering near 60 fps, zero idle draws; 6× measured. SwiftShader battle about 25 fps remains a limitation. Real-machine gate deferred by D11.                                       |
| T8  | A         | Reviewed, rating retained                          | Guandu Yuan Shao survives elimination in all six normal-bot samples despite early city loss; no rating/truce manipulation.                                                                             |
| T9  | D         | Local checks complete; publication deferred by D12 | 353 unit, 53 gameplay-browser, 7 production tests; isolated performance/FPS and all diagnostics complete. No PR/remote CI result claimed.                                                              |

See [the validation ledger](v0.2-validation.md), [final balance notes](v0.2-notes.md) and [durable evidence](assets/v0.2-balance-evidence.json) for configurations, exact results and limitations.

### Historical starting measurements for T1

Before the October 20 implementation, R1.1 split every battle by its starting force ratio (48 months, 36 campaigns). This table and lever list describe that starting point, not the tuned candidate:

| Battle type        | Share | Median length | Ended by camp capture | Move-only turns |
| ------------------ | ----- | ------------- | --------------------- | --------------- |
| Contested (< 1.6×) | 30%   | 5 days        | 52.8%                 | 53%             |
| Uneven (1.6–3×)    | 25%   | 4 days        | 37.5%                 | 62%             |
| Lopsided (> 3×)    | 45%   | 3 days        | 9.9%                  | 74%             |

Of all move-only AI turns, 45.6% are units held back near their camp and 44.2% have no enemy in reach. The likely levers, in order:

1. the hold-near-camp radius (`holdNearCampRadius`, then 3);
2. the camp rush in contested battles;
3. the AI attack margins (`attackMultipliers.balanced`, then 1.35);
4. the damage rate (`normalDamageRate`, then 0.25);
5. the counter rates.

**Guardrails** (targets met today, which must stay met):

- day-limit endings < 10%;
- camp captured by day 3 < 10%;
- upsets in contested battles 15–30%;
- supply run-out 5–20%;
- raids that fight 40–80%;
- 48-month bot survival ≥ 80% for Approachable and Balanced houses;
- auto-resolve p95 < 50 ms;
- the mirrored v2-versus-v1 test.

## Design decisions

### Resolved during final implementation (October 20, 2026)

**Review D8:** the user accepted and explicitly documented the remaining balance misses with the selected defaults (camp radius 4; normal/fire/rockfall rates 0.18/0.1584/0.1296). Development/held-out 96-month results: overall median 4/4 days, close battles 5.6%/5.2%, contested upsets 30.7%/30.3%, and capture events 18.3/18.7 per campaign. The respective targets remain 5–12 days, ≥30%, 15–30%, and 3–15. Contested-only close rates also miss (11.7%/11.9%); the targets were not redefined to manufacture a pass. Other measured guardrails pass. Capture events can include the same officer more than once.

**Review D9:** the user accepted partial bot success for v0.2, retaining the broad original unification target as a documented miss. Hegemon and true unification remain separate outcomes. The improved bot achieved 3 unifications + 3 player Hegemon wins in development and 3 + 2 on held-out seeds. Balanced houses won 4/12 and 2/12 respectively; Guandu Sun Ce won 0/3 held-out runs. No 144-month extension or further bot iteration was requested. See [the validation record](v0.2-validation.md) and [balance evidence](v0.2-notes.md).

### Decided: gameplay plan (§7 of [the plan](archive/gameplay-improvement-plan.md))

| ID       | Decision                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan D1  | Plunder (掠夺) uses the scaled Atlas version: the original halving shape, with gains scaled to this economy.                                                      |
| Plan D2  | Enemy cities can be sacked on capture or raided without capture. _Amended by review D6:_ a raid fights only if the garrison is at least as strong as the raiders. |
| Plan D3  | No new battle randomness. Crits and tactic failure are in the backlog.                                                                                            |
| Plan D4  | Camp capture stays instant. A camp with hit points is in the backlog.                                                                                             |
| Plan D5  | No officer deaths in battle. Captives can be executed by their captor.                                                                                            |
| Plan D6  | Duels are in the backlog.                                                                                                                                         |
| Plan D7  | No tightening of city income or order costs. Scarcity comes from war.                                                                                             |
| Plan D8  | No free resources for the AI at any difficulty.                                                                                                                   |
| Plan D9  | v1 saves, mid-battle included, migrate to v2 with deterministic defaults.                                                                                         |
| Plan D10 | Historical events fire only when their historical conditions hold.                                                                                                |

### Decided: v0.2 review (October 20, 2026; D10 after Wave A)

| ID         | Decision                                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review D1  | A unit cannot end a move on its own camp, but may pass through it.                                                                                                                                                                            |
| Review D2  | Rally keeps curing confusion; the forecast, tooltip and rules page say so.                                                                                                                                                                    |
| Review D3  | Plunder grief (−8 loyalty) falls on the plunderer's benevolent officers, not the victims'.                                                                                                                                                    |
| Review D4  | Reorganizing troops requires an officer who leads troops.                                                                                                                                                                                     |
| Review D5  | On Standard, Challenging houses get a two-month opening truce (the AI never marches in month 1, so one month would protect nobody). The month-1 weak-border warning ranks first.                                                              |
| Review D6  | A garrison weaker than the raiders stays inside, and the raid meets no resistance (`RAID_SORTIE_SHARE` = 1).                                                                                                                                  |
| Review D7  | Ma Chao is added as a Guandu-only officer in Chang'an. Guandu saves made before that no longer load, which is acceptable while v0.2 is unreleased.                                                                                            |
| Review D10 | The Guandu turtle check (M6) covers only the small houses: Ma Teng, Liu Bei and Liu Zhang. Cao Cao, Yuan Shao and Sun Ce losing a border city to each other early is the Guandu war itself. The check is re-run after the battle tuning (T3). |
| Deferred   | P2-12 (AI alliance offers to the player) and P3-4 (scenarios as a JSON pipeline) move to v0.3.                                                                                                                                                |

**Review D11 (October 20, 2026, user decision):** explicitly defer the four human playtest sessions and real low-end-machine check for v0.2. Keep their procedures and unobserved status in [the playtest record](v0.2-playtest.md); retain all automated gameplay/performance checks. The user separately approved Ma Chao's portrait/contact sheet and the final four battlefield profile screenshots on the same date; see the review scope in that record.

**Review D12 (October 20, 2026, user decision):** defer push, PR creation and remote CI for now. The tested implementation is committed locally as `b773e91`; publication could not authenticate through local Git or the connected integration. All local suites and diagnostics pass. No PR or remote CI result is claimed.

## Historical v0.2 publication follow-up

1. Resume T9's branch push, PR to `main` and CI verification only when requested; these actions are explicitly deferred by D12. The validation record identifies the committed candidate and local results.
2. Review the PR before any separately authorized merge. The accepted D8/D9 exceptions remain visible in the notes and PR.
3. Perform the deferred human sessions and real low-end-machine check when resumed; retain the unobserved status until actual evidence exists.
4. v0.3 implementation is already underway on `v0.3`; use the [current P01–P11 plan](v0.3/implementation-plan.md), not the old instruction to begin from shared-interface scaffolding.

### Other backlog outside the confirmed v0.3 scope

These earlier candidates are not automatically part of the October 21 v0.3 plan. They remain unstarted backlog and need a separate scope decision.

- **Deferred from v0.2:** AI alliance offers to the player (P2-12); scenarios as validated JSON (P3-4).
- **Backlog from plan §8:** battle randomness (D3), duels 单挑 (D6), the camp as a structure with hit points or a one-day hold (D4), economy tightening (D7), and wounded soldiers who return after a battle. Officer death in battle stays excluded (D5).
- **From the README:** Firefox and Safari coverage, fuller accessibility testing, and richer authored content.
- **Engine clean-up:** the engine still swaps module-level scenario data through `activateScenario`; only the interface was moved off it (L10). Passing the scenario explicitly through the rules would remove the last hidden state.

## Working notes for the next v0.3 session

- **Commands:**
  - current checks: `npx vitest run tests/v03`, `npm test`, `npm run build`, `npm run format:check`, `npm run test:e2e` (run alone), `npm run test:perf:v03`, `npm run test:production` (after a build);
  - audit reproductions: `node docs/v0.3/evidence/reproduce-implementation-audit.mjs`; success means the diagnostic ran, not that reported defects are fixed;
  - legacy-only performance: `npm run test:perf:v02`, `npm run test:fps:v02`, `npm run test:production:v02`;
  - legacy hash regeneration is only for separately authorized old-engine changes; v0.3 does not require migration or legacy behavior parity.
- **Historical v0.2 diagnostics (do not use as v0.3 balance evidence):**
  - `$env:DIAGNOSTIC_MONTHS=48; node tools/ai-diagnostics.mjs --bot --scenario=divided-realm-190,guandu-200` writes `.artifacts/ai-diagnostics/bot.json`;
  - `DIAGNOSTIC_TUNING='{"normalDamageRate":0.2,"attackMultipliers":{"balanced":1.2}}'` overrides levers for one run;
  - `DIAGNOSTIC_BOT=turtle` plays the defensive bot;
  - `DIAGNOSTIC_FILE` names the output file.
- **Windows PowerShell 5.1 pitfalls:**
  - `Set-Content -Encoding utf8` writes a byte-order mark, so write files with `[IO.File]::WriteAllText` and `UTF8Encoding($false)`;
  - `git` is available on PATH in this session; if unavailable later, inspect the installed Git/GitHub Desktop runtime rather than assuming a fixed path;
  - here-strings expand `$` and backticks in double-quoted form.
- **Rules of the codebase:**
  - queries never consume RNG;
  - commands are atomic;
  - constants are named at the top of their file;
  - every new string is bilingual;
  - tests are never weakened;
  - for maintenance of v0.2, a rule change regenerates the legacy hashes, and a change that should not alter rules must pass without regenerating them; v0.3 is a new ruleset without legacy-save or behavior-hash compatibility, and uses its own deterministic fixtures and regression tests.
