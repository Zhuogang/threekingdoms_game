# v0.4 implementation and evidence

Active branch: `v0.4`. The [implementation plan](../implementation.md) defines the required scope and acceptance. The user's `CODEX_GOALS.md` attachment references its former name, `docs/improvement.md`; the October 29 documentation cleanup moved that plan without changing its tickets. Existing gameplay remains the [v0.3 baseline](../v0.3/README.md) until an implemented change below says otherwise.

## Ticket ledger

| Ticket                    | Status                                                                                      | Evidence / next acceptance                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| V04-00                    | Evidence foundation implemented; remaining behavior fixtures accompany their owning tickets | Ten-day telemetry, bounded actual-decision traces, full source fingerprints and six reproduced defects. Details below.       |
| V04-01                    | Implemented                                                                                 | Shared campaign legality, commit-time revalidation and bounded fallback.                                                     |
| V04-02                    | Implemented                                                                                 | Actual rations, next unsettled economic boundary and city obligations.                                                       |
| V04-03                    | Implemented                                                                                 | Next eligible Confuse activation and one-hit Inspired lifetime, including saves and both seats.                              |
| F05 / V04-07 early repair | Implemented                                                                                 | Replace dominated restore-loyalty choice with legal security.                                                                |
| V04-04                    | Implemented                                                                                 | Compare ordinary attacks, tactics and hold on consistent costs and benefits.                                                 |
| V04-05                    | Implemented                                                                                 | Bounded movement/action alternatives, preservation and coordination.                                                         |
| V04-06                    | Pending                                                                                     | Viable party sizes, defensive exposure, provisions and justified waiting.                                                    |
| V04-07                    | Pending                                                                                     | Governor work aligned with actual deadlines, effects, authority and budgets.                                                 |
| V04-08                    | Pending                                                                                     | One persistent faction objective, real support orders and compatible save defaults.                                          |
| V04-09                    | Pending                                                                                     | Paired tactical/campaign comparisons, full regression/browser/production/performance checks, player and hardware validation. |

## V04-00: observation before tuning

The pre-change `fb6a650` baseline passed all **820** unit/integration tests on October 29, 2026. The run completed before source edits. New trace-parity tests compare complete monthly and tactical results, including RNG, with tracing enabled and disabled; they reconcile actual campaign journeys and committed work against observed events.

- Diagnostics now report the current ten-day work period. Stale day-20 work and missing period information remain unobserved. Cumulative work counts actual committed actions, including free actions separately from work points; an endpoint budget is never summed as monthly history.
- Resolved battle duration and active battle age are separate measurements.
- Developer traces retain at most the requested 0–10,000 events (default 200) and keep cumulative counts after retention fills. Traces are scoped to synchronous simulation calls, disabled in normal play, excluded from saves and hidden from player reports.
- Campaign traces distinguish rejected/eligible/selected candidates, committed dispatches, execution rejection and no eligible campaign. Governor and tactical traces record actual execution. Detailed candidate values will expand with the corresponding policy tickets; existing observations do not claim to explain alternatives the old policy never evaluated.
- Source fingerprints cover the complete `src/v03/` and tool tree, package/lock/config inputs, new and deleted working files, commit and dirty state. Run configuration, scenarios, seed cohorts and Node version are recorded.
- New diagnostic output defaults to ignored `.artifacts/v04/`; older evidence is not overwritten.

[Known-failure fixtures](../../tests/v03/ai/known-failures.test.ts) reproduce allied-target masking, hopeless conquest, missing smaller parties, acted-target Confuse exclusion, unconsumed Inspired and dominated Fire. Unresolved cases are explicitly expected failures, **not fixed behavior**; fixed cases become ordinary passing regressions. Run `V04_REPRODUCE_FAILURES=1 npm test -- tests/v03/ai/known-failures.test.ts --maxWorkers=1` to expose their failing assertions. Each owning ticket must convert its cases into passing ordinary regressions. Add the remaining reviewed fixtures as the associated domains are repaired.

[Evidence tests](../../tests/v03/ai/decision-evidence.test.ts) cover trace parity, committed counts, bounded retention and nested/error cleanup, ten-day telemetry, duration/age separation, and source/config fingerprint sensitivity. The one-month two-seed diagnostic smoke completed with 200 retained events per run and complete cumulative counters; this proves tool execution, not gameplay improvement or campaign balance. Local raw reports live in `.artifacts/v04/baseline/` and are working outputs, not portable release evidence.

Validation for this foundation: **88 targeted tests passed, six expected failures reproduced**, TypeScript passed, and both existing tactical performance tests passed their 50 ms p95 limit. Changed-file formatting and whitespace checks passed.

## V04-01: legal campaigns and bounded fallback

Planning and dispatch now share source, officer, commitment, ownership and alliance checks. The alliance is checked before ranking; the reproduced day-29-to-30 case dispatches toward legal Jinyang. Expiring treaties permit attack at their actual expiry boundary. Dispatch revalidates the route, party readiness, cavalry count, food and remaining garrison before allocating IDs or spending resources.

Each faction receives at most three planning/commit attempts against the latest state and stops after one successful campaign. A stale ownership, alliance or target commitment triggers a legal alternative; failed candidates reserve nothing. This preserves the existing one-new-campaign-per-faction monthly allowance.

Validation: **69 passing tests and five remaining expected failures** across campaign legality, strategic planning, real monthly dispatch, arrival ordering, save validation and evidence tools; TypeScript passed. Fifteen new tests cover harmless rejection, fallback, expiry and the dispatch limit, plus a real month-boundary regression. The previous F01 expected failure is now a passing regression. The frozen baseline completed 24 paired scenario/faction/cohort runs at both 90 days and 12 months; policy comparison is still pending.

## V04-02: food forecasts that follow the bill

Battle charging and AI supply evaluation now use one pure fixed-point ration calculation: healthy and wounded personnel, double cavalry weight, and the saved unpaid fraction. A 1,200-person infantry force consumes 48 food/day; 500 food covers about 10.42 days. The campaign passes its existing fraction to tactical evaluation without duplicating saved state.

The next economic deadline comes from absolute day and the saved settlement cursor. August work forecasts August's bill; September retains its larger harvest; a pending saved bill remains due immediately. After all city bills are paid, monthly autonomy forecasts the following boundary. The old optional month argument remains accepted for callers but cannot alter the forecast.

A pure city forecast separates stock, legal availability, reservations, accrued debt, remaining service, production and projected balances. Current paid-personnel credits reduce today's service once. Known friendly arrivals use the actual route ticks and march rations, destination ownership/commitment, warehouse capacity and delivery deadline. Arriving troops incur city service only after arrival; a late convoy cannot fund the current bill. Forecasts assume no new orders, battles or random monthly events. They can evaluate the state returned by an existing city action; previewing never applies the action. Actual monthly billing rates and accounting order are unchanged.

Validation: the 26-file governance/campaign/battle/save selection passed **407 tests**, with five unrelated expected failures remaining. **18 economic fixtures** (including two additional day-10/day-20 continuations) passed. Both battle sides match actual fractional charges after save/reload; mixed healthy/wounded/reserve/prisoner and prepaid fixtures match real food and gold settlement. Deadline, September, rollover, pending cursor, reservations, post-purchase and on-time/late convoy checks passed. TypeScript and changed-file formatting passed.

## V04-03: one activation or one qualifying hit

Confuse now targets a living enemy even after that enemy acted. The status persists across rollover and is consumed once when the unit next skips its scheduled move/action opportunity, including a routed unit's hold. Rally can clear it first; repeated Confuse does not stack skipped activations. Dead formations do not acquire phantom turns.

Inspired persists until one ordinary attack, counterattack or Ambush hit consumes the bonus. Fire/Rockfall neither benefit nor consume it, and repeated Rally does not stack multipliers. Forecasts retain the same damage calculation as execution. The existing status enum already serializes these pending effects, so no save field or format migration was necessary. Previews, status labels, English/Chinese logs and Wiki explain the clarified lifetime.

Validation: **11 focused status tests** passed, including mirrored seats, acted targets, routed/dead units, repeated casts, Rally removal, ordinary/counterattack/Ambush consumption and unused-day persistence. **Seven campaign/save tests** cover both seats under manual/auto/NPC control and an unused Inspired effect. Existing battle and bilingual-feedback checks passed; TypeScript and formatting passed. The two V04-03 expected failures are now ordinary passing regressions; three policy defects remain expected failures.

## F05: useful loyalty recovery

Reproduced the 80-gold, +2 loyalty choice when relief cannot spare protected food. Governors now choose the existing free security action (at least +8 loyalty, one work point). Shared player/NPC action costs and effects are unchanged; the old restore-loyalty command/report name remains compatible, but autonomy no longer selects it. The focused regression verifies the committed gain, unchanged food/gold and work cost; governance tests passed.

## V04-04: compare useful actions before spending the turn

The tactical AI now evaluates every legal ordinary target, tactic target and hold in the current position. A single score includes expected casualties, retaliation and veteran preservation, formation elimination/rout, retained wounded, useful Rally/Confuse, near-term supply shortages and tactic-point recovery/scarcity. An immediate winning hit receives explicit value. These are deterministic policy preferences, not calibrated win probabilities. Existing damage, tactic costs, ration rates, retreat thresholds and battle endings are unchanged.

Developer traces include compared scores and their damage, retaliation, finishing, support, supply and point-cost terms, followed by the actual committed action. Evaluation itself is pure. The old tactic-first selector and separate AI attack executor were removed; execution uses the same attack/tactic validation as other command paths.

The dominated-Fire case is now a passing ordinary regression. New fixtures verify a safe finishing hit over a worse retaliation exchange, useful recovery, preservation of the last points when Rally adds nothing, effective low-supply denial, an immediate win over optional recovery, and trace/state/RNG parity. The old forest fixture now permits either useful Fire or Confuse instead of prescribing one policy choice. Two status fixtures also now explicitly set infantry's one-tile range when replacing an archer fixture.

Validation: **164 passing targeted tests and two remaining strategic expected failures** across tactics, statuses, campaign continuation and evidence. TypeScript passed; both existing 10v10 performance checks passed their 50 ms p95 limits. The movement and formation-order extension is recorded under V04-05 below.

## V04-05: bounded maneuver and formation coordination

Each unspent formation compares at most six legal destinations, including its current tile. The shortlist preserves a useful shot, a safe position and route progress; full ordinary/tactic/hold comparisons then account for the next exchange. Actual movement still uses the existing terrain, water, ZOC and occupied-cell rules. After every action, the remaining formations are reconsidered; a cheap finisher can leave the stronger formation free, and a kill can open a passage for the next formation. Ranged attacks retain the existing range-only legality.

Enemy threats include reachable firing positions and return hits. Forecasting omits the moving unit's old occupancy/ZOC so a vacated cell cannot provide imaginary protection. Its destination can constrain the enemy further; this is a conservative one-response estimate, not a simulation of all future formation orders. Long route fields allow friendly formations to move later, while every immediate move enforces all current blockers. Geometry-keyed threat fields, per-board capability values and unchanged exchange forecasts avoid duplicate work; a replay fixture compares cached choices with fresh evaluations and commits them through player commands.

Scores remain heuristic casualty-equivalent preferences: a full approach move earns approximately 90% of a forecast normal hit, with a 40-per-cell floor; entering contact is weighed against the next exchange, including return fire. Ordinary formations discount next-exchange exposure to 65%; routed formations use the full estimate and prefer survival or legal Rally access. Blocking an ally's sole exit costs 80 (15 for two exits). A 0.1-per-movement-cost tie-break favors staying when positions are otherwise equivalent. The last day has no approach reward; the final three days halve that reward when the current timeout policy already favors the side, and add 15% immediate hit/finish value when behind. Formation ordering adds half the best action's advantage over its next different target, capped at 100. These weights need the paired calibration in V04-09 and do not predict victory probabilities.

Withdrawal still uses the existing opening-force/enemy-force thresholds and campaign-provided return-route permission. At that threshold, developer traces compare reachable next-hit exposure with an advisory withdrawal cost using the existing orderly capture risk and non-returning militia; this collects evidence without changing retreat or capture rules. No extra formation actions, RNG draws, saved fields or battle-ending rules were introduced.

Validation: **189 targeted cases passed, including the two unresolved strategic expected failures**, across battle rules, statuses, campaign/save continuation, experience, inspection, feedback and evidence. Ten new movement/coordination cases cover both seats, safe move-and-shot, routed wounded troops, cheap finishing hits, a kill opening a narrow passage, fresh/cache decision parity, legal command replay, vacated-cell threats, Rally access, final-day holding and permitted/blocked withdrawal. Existing water-crossing, detour and fixed-seed non-stalling cases passed. TypeScript passed. The former fixed-position Fire fixture now gives the already-acted enemy no future activation; the campaign status fixture gives the caster no remaining move and ample supplies, so escape or a useful supply raid cannot replace the cast whose lifetime it tests.

All four isolated performance gates passed their unchanged **50 ms p95** limit, with 30 measured days and three warm-up days per fixture. Opening-turn p95 was 24.6 ms (24×20) and 21.5 ms (48×32); mixed 10v10 engaged and congested 48×32 p95 was 46.6 ms and 47.6 ms respectively. Measurements used Node 22.23.2 on the container's ARM Neoverse-V2, Linux 6.8.0-1046-nvidia-64k, with no concurrent agent test/simulation jobs. Raw results are in `.artifacts/v04/movement-tests.json` and `.artifacts/v04/movement-perf.log`. This is a test-container measurement; the real low-end-device gate remains open.

## Frozen correctness checkpoint

Commit `9ce0346` is the frozen P0-corrected policy, before tactical scoring. Its full suite passed **889 cases (including three then-unresolved expected failures)** and its production build passed. Baseline `10c6866` and P0 each completed all **24** paired scenario/faction/cohort runs at 90 days and 12 months. Neither matrix recorded player elimination, unification or Hegemon victory. These narrow-bot results do not establish release balance or human gameplay quality. Raw fingerprinted reports remain in `.artifacts/v04/baseline/` and `.artifacts/v04/p0/`; tactical/strategic policy comparisons and longer evaluation remain open.

## Completion boundary

V04-01 through V04-05 and the F05 repair are implemented; remaining policy tickets and release acceptance are still open. Four real player sessions (12 campaign months and at least three manual battles each), real low-end hardware measurement and artwork approval remain outstanding. Automated play and browser checks will be recorded separately and cannot substitute for those gates. The existing 40 formatting failures in unchanged asset/source records predate v0.4; changed files must pass formatting.
