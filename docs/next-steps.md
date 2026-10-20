# To-do, design decisions and next steps

Status on October 20, 2026, branch `v0.2` at `8e93b10`. This is the working list for finishing v0.2 and planning v0.3. It replaces the plan sections of [the v0.2 review](archive/v0.2-review.md); that review keeps the full history and the detailed task cards (R1–R8). [v0.2-summary.md](v0.2-summary.md) says what v0.2 already is.

## Release gate for v0.2

v0.2 merges to `main` when every box is ticked.

- [x] Every review item (H1–H3, M1–M11, L1–L17) is fixed or explicitly deferred. The exceptions are L15 and the battle-tuning targets below.
- [x] `npm test`, `npm run build`, `npm run format:check`, `npm run test:e2e`, `npm run test:perf` and `npm run test:production` pass.
- [ ] Battle tuning meets its targets, or decision D8 is recorded (T1 below).
- [ ] Bot unification is measured, and decision D9 is recorded if needed (T2).
- [ ] The Guandu turtle check passes, as scoped by decision D10 (T3).
- [ ] Ma Chao has a portrait, or it is deferred with the garrison fallback (T5).
- [ ] A human playtest is done, with its findings fixed or deferred (T6).
- [ ] The frame rate holds 30 fps with the CPU slowed 4× (already met) and on one real low-end machine (T7).
- [ ] Fresh diagnostics are in [v0.2-notes.md](v0.2-notes.md), and a pull request from `v0.2` to `main` is opened.

## To-do

Ordered. "Who" is a coding session unless it says you.

| #   | Task                                                                                                                                                                                                                                                                       | Who                       | Done when                                                                                                    | Detail                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| T1  | **Battle tuning.** Sweep the levers with `DIAGNOSTIC_TUNING`, pick the best combination, confirm it at 96 months, and make it the default.                                                                                                                                 | session                   | Median battle length 5–12 days, close battles ≥ 30%, no action > 60%, every guardrail kept (or D8 recorded). | [R1](archive/v0.2-review.md#r1-battle-tuning-t44)                          |
| T2  | **Bot unification.** Record why the bot holds back, then teach it to move troops to the front, attack jointly and pick better targets. Measure months to unify.                                                                                                            | session, after T1         | Balanced houses unify in 48–96 months, or D9 recorded.                                                       | [R2](archive/v0.2-review.md#r2-bot-unification)                            |
| T3  | **Guandu turtle check.** Decide D10, then re-run `DIAGNOSTIC_BOT=turtle` after T1.                                                                                                                                                                                         | you (D10), then a session | The houses in scope keep every starting city for 6 months in ≥ 2 of 3 seeds.                                 | [Wave A status](archive/v0.2-review.md#wave-a-status-october-20-2026)      |
| T4  | **L15 art.** Level pips on officer badges, a colour palette per battlefield profile, and the profile named in the battle header.                                                                                                                                           | session                   | Readable in both themes; screenshots reviewed by a human.                                                    | [R4](archive/v0.2-review.md#r4-l15-level-pips-and-distinct-battlefields)   |
| T5  | **Ma Chao's portrait.** Generate the image from `tools/portrait-spec-pending.json`, then run the portrait pipeline and update the 52 → 53 counts.                                                                                                                          | you, then a session       | `validate:portraits` and `test:production` pass; contact sheet reviewed.                                     | [R5](archive/v0.2-review.md#r5-ma-chaos-portrait-user-step-then-a-session) |
| T6  | **Human playtest.** Each scenario on Standard, with one Challenging and one Balanced house: at least 12 months and 3 hand-fought battles each. Use the checklist in plan §6, and record results in a new `docs/v0.2-playtest.md`.                                          | you                       | Every checklist item ticked or explained; issues fixed or deferred.                                          | [R7](archive/v0.2-review.md#r7-human-playtest-release-gate-user-step)      |
| T7  | **Weak-GPU frame rate.** The map runs at about 10 fps under software graphics, because Pixi redraws the whole stage up to 30 times a second. Draw only when the state or camera changes, cache text, and cap the pixel ratio. Then do one manual run on a low-end machine. | session, then you         | ≥ 30 fps under SwiftShader in `npm run test:fps`, if reachable; the manual run is recorded.                  | [R8](archive/v0.2-review.md#r8-frame-rate-on-slower-hardware)              |
| T8  | **Review Yuan Shao's rating.** He is rated Approachable, yet loses Pingyuan in month 2 in every turtle run.                                                                                                                                                                | session, with T2          | The ratings match the measured survival.                                                                     | —                                                                          |
| T9  | **Release.** Re-run all checks and the diagnostics, update the notes, push `v0.2`, and open the pull request to `main`.                                                                                                                                                    | session, on your go-ahead | The pull request is open with green CI.                                                                      | —                                                                          |

### What the measurements say for T1

R1.1 split every battle by its starting force ratio (48 months, 36 campaigns):

| Battle type        | Share | Median length | Ended by camp capture | Move-only turns |
| ------------------ | ----- | ------------- | --------------------- | --------------- |
| Contested (< 1.6×) | 30%   | 5 days        | 52.8%                 | 53%             |
| Uneven (1.6–3×)    | 25%   | 4 days        | 37.5%                 | 62%             |
| Lopsided (> 3×)    | 45%   | 3 days        | 9.9%                  | 74%             |

Of all move-only AI turns, 45.6% are units held back near their camp and 44.2% have no enemy in reach. The likely levers, in order:

1. the hold-near-camp radius (`holdNearCampRadius`, now 3);
2. the camp rush in contested battles;
3. the AI attack margins (`attackMultipliers.balanced`, now 1.35);
4. the damage rate (`normalDamageRate`, now 0.25);
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

### Open

| ID  | Question                                                                              | Options                                                                                                                            | Recommendation                                                                                            |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| D8  | If no tuning meets all three battle targets, how should they be read?                 | (a) Measure them on contested battles only. (b) Accept and document the misses.                                                    | Decide from the T1 sweep. (a) if contested battles meet them and the lopsided ones drag the totals down.  |
| D9  | If the bot still cannot unify within 96 months?                                       | (a) Measure Hegemon victories instead, and report unification beside them. (b) Extend the horizon to 144 months. (c) Accept.       | (a). The Hegemon title is the game's main victory path, and coalitions resist a runaway leader by design. |
| D10 | Should the Guandu turtle criterion cover the big houses (Cao Cao, Yuan Shao, Sun Ce)? | (a) Yes, and strengthen their frontier garrisons. (b) No: only the small houses (Ma Teng, Liu Bei, Liu Zhang), which already pass. | (b). The giants losing a border city to each other early is the Guandu war itself. Re-check after T1.     |

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

### Decided: v0.2 review (October 20, 2026)

| ID        | Decision                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review D1 | A unit cannot end a move on its own camp, but may pass through it.                                                                                                               |
| Review D2 | Rally keeps curing confusion; the forecast, tooltip and rules page say so.                                                                                                       |
| Review D3 | Plunder grief (−8 loyalty) falls on the plunderer's benevolent officers, not the victims'.                                                                                       |
| Review D4 | Reorganizing troops requires an officer who leads troops.                                                                                                                        |
| Review D5 | On Standard, Challenging houses get a two-month opening truce (the AI never marches in month 1, so one month would protect nobody). The month-1 weak-border warning ranks first. |
| Review D6 | A garrison weaker than the raiders stays inside, and the raid meets no resistance (`RAID_SORTIE_SHARE` = 1).                                                                     |
| Review D7 | Ma Chao is added as a Guandu-only officer in Chang'an. Guandu saves made before that no longer load, which is acceptable while v0.2 is unreleased.                               |
| Deferred  | P2-12 (AI alliance offers to the player) and P3-4 (scenarios as a JSON pipeline) move to v0.3.                                                                                   |

## Next steps

1. **Now:** decide D10 (T3). It needs no code.
2. **Wave B, one session:** T1, then T2 and T8. T1 changes every battle, so T2 and the T3 re-check run on the tuned rules.
3. **In parallel with Wave B:** T4 (art) and T7 (renderer). Both touch `GameMap.tsx`, so run them one after the other, or in one session.
4. **Whenever ready:** T5 (your portrait), then its session.
5. **Last:** T6 (your playtest on the release candidate), then T9 (release).

### v0.3 candidates

Not started; each needs a decision before it becomes a task.

- **Deferred from v0.2:** AI alliance offers to the player (P2-12); scenarios as validated JSON (P3-4).
- **Backlog from plan §8:** battle randomness (D3), duels 单挑 (D6), the camp as a structure with hit points or a one-day hold (D4), economy tightening (D7), and wounded soldiers who return after a battle. Officer death in battle stays excluded (D5).
- **From the README:** Firefox and Safari coverage, fuller accessibility testing, and richer authored content.
- **Engine clean-up:** the engine still swaps module-level scenario data through `activateScenario`; only the interface was moved off it (L10). Passing the scenario explicitly through the rules would remove the last hidden state.

## Working notes for the next session

- **Commands:**
  - the checks: `npm test`, `npm run build`, `npm run format:check`, `npm run test:e2e` (run it alone; overlapping runs give false failures), `npm run test:perf`, `npm run test:production` (after a build) and `npm run test:fps` (opt-in);
  - legacy hashes: `$env:REGENERATE_LEGACY=1; npx vitest run tests/legacy-fixtures.test.ts`, run twice, then run once more without the variable.
- **Diagnostics:**
  - `$env:DIAGNOSTIC_MONTHS=48; node tools/ai-diagnostics.mjs --bot --scenario=divided-realm-190,guandu-200` writes `.artifacts/ai-diagnostics/bot.json`;
  - `DIAGNOSTIC_TUNING='{"normalDamageRate":0.2,"attackMultipliers":{"balanced":1.2}}'` overrides levers for one run;
  - `DIAGNOSTIC_BOT=turtle` plays the defensive bot;
  - `DIAGNOSTIC_FILE` names the output file.
- **Windows PowerShell 5.1 pitfalls:**
  - `Set-Content -Encoding utf8` writes a byte-order mark, so write files with `[IO.File]::WriteAllText` and `UTF8Encoding($false)`;
  - `git` is not on PATH here, so use GitHub Desktop's bundled git;
  - here-strings expand `$` and backticks in double-quoted form.
- **Rules of the codebase:**
  - queries never consume RNG;
  - commands are atomic;
  - constants are named at the top of their file;
  - every new string is bilingual;
  - tests are never weakened;
  - a rule change regenerates the legacy hashes, and a change that should not alter rules must pass without regenerating them.
