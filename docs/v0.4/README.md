# v0.4 implementation and evidence

Active branch: `v0.4`. The [implementation plan](../implementation.md) defines the required scope and acceptance. The user's `CODEX_GOALS.md` attachment references its former name, `docs/improvement.md`; the October 29 documentation cleanup moved that plan without changing its tickets. Existing gameplay remains the [v0.3 baseline](../v0.3/README.md) until an implemented change below says otherwise.

## Ticket ledger

| Ticket                    | Status                                                                                      | Evidence / next acceptance                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| V04-00                    | Evidence foundation implemented; remaining behavior fixtures accompany their owning tickets | Ten-day telemetry, bounded actual-decision traces, full source fingerprints and six reproduced defects. Details below.       |
| V04-01                    | Implemented                                                                                 | Shared campaign legality, commit-time revalidation and bounded fallback.                                                     |
| V04-02                    | Pending                                                                                     | Actual rations, next unsettled economic boundary and city obligations.                                                       |
| V04-03                    | Pending                                                                                     | Next eligible Confuse activation and one-hit Inspired lifetime, including saves and both seats.                              |
| F05 / V04-07 early repair | Pending                                                                                     | Replace dominated restore-loyalty choice with legal security.                                                                |
| V04-04                    | Pending                                                                                     | Compare ordinary attacks, tactics and hold on consistent costs and benefits.                                                 |
| V04-05                    | Pending                                                                                     | Bounded movement/action alternatives, preservation and coordination.                                                         |
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

[Known-failure fixtures](../../tests/v03/ai/known-failures.test.ts) reproduce allied-target masking, hopeless conquest, missing smaller parties, acted-target Confuse exclusion, unconsumed Inspired and dominated Fire. They are explicitly expected failures, **not fixed behavior**. Run `V04_REPRODUCE_FAILURES=1 npm test -- tests/v03/ai/known-failures.test.ts --maxWorkers=1` to expose their failing assertions. Each owning ticket must convert its cases into passing ordinary regressions. Add the remaining reviewed fixtures as the associated domains are repaired.

[Evidence tests](../../tests/v03/ai/decision-evidence.test.ts) cover trace parity, committed counts, bounded retention and nested/error cleanup, ten-day telemetry, duration/age separation, and source/config fingerprint sensitivity. The one-month two-seed diagnostic smoke completed with 200 retained events per run and complete cumulative counters; this proves tool execution, not gameplay improvement or campaign balance. Local raw reports live in `.artifacts/v04/baseline/` and are working outputs, not portable release evidence.

Validation for this foundation: **88 targeted tests passed, six expected failures reproduced**, TypeScript passed, and both existing tactical performance tests passed their 50 ms p95 limit. Changed-file formatting and whitespace checks passed.

## V04-01: legal campaigns and bounded fallback

Planning and dispatch now share source, officer, commitment, ownership and alliance checks. The alliance is checked before ranking; the reproduced day-29-to-30 case dispatches toward legal Jinyang. Expiring treaties permit attack at their actual expiry boundary. Dispatch revalidates the route, party readiness, cavalry count, food and remaining garrison before allocating IDs or spending resources.

Each faction receives at most three planning/commit attempts against the latest state and stops after one successful campaign. A stale ownership, alliance or target commitment triggers a legal alternative; failed candidates reserve nothing. This preserves the existing one-new-campaign-per-faction monthly allowance.

Validation: **69 passing tests and five remaining expected failures** across campaign legality, strategic planning, real monthly dispatch, arrival ordering, save validation and evidence tools; TypeScript passed. Fifteen new tests cover harmless rejection, fallback, expiry and the dispatch limit, plus a real month-boundary regression. The previous F01 expected failure is now a passing regression. The frozen baseline completed 24 paired scenario/faction/cohort runs at both 90 days and 12 months; policy comparison is still pending.

## Completion boundary

V04-01 is implemented; remaining policy tickets and release acceptance are still open. Four real player sessions (12 campaign months and at least three manual battles each), real low-end hardware measurement and artwork approval remain outstanding. Automated play and browser checks will be recorded separately and cannot substitute for those gates. The existing 40 formatting failures in unchanged asset/source records predate v0.4; changed files must pass formatting.
