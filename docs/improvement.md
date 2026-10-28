# v0.4 improvement plan: coherent AI and trustworthy rules

**Project:** Hegemony of the Three Kingdoms / 三国霸业  
**Review date:** October 28, 2026  
**Reviewed baseline:** `main` at [`86cd40e3f305f1ab24ee51a617365226d2953513`](https://github.com/Zhuogang/threekingdoms_game/tree/86cd40e3f305f1ab24ee51a617365226d2953513)  
**Status:** Proposed implementation plan. This change adds documentation only.

## 1. Direction for v0.4

**Make the existing game produce better decisions and more consistent consequences.** A faction should recognize an unaffordable or hopeless expedition, prepare a feasible alternative, protect its exposed cities, and continue a sensible objective across several decisions. A battlefield commander should compare the real benefits and costs of attacks, tactics, movement, holding, and withdrawal. Forecasts, AI reasoning, player previews, and execution should agree about the underlying rules.

The current code already provides a substantial foundation. Preserve the command boundary, deterministic simulation, daily calendar, journey and reservation accounting, ten-day city work, monthly settlement, wounded personnel, troop experience, captivity, strict saves, legal movement, terrain, and combat forecasts. Improve the policies that use them.

### Release scope

- Keep the existing scenarios, roster, map, units, six tactics, diplomacy, logistics, governance, and campaign endings as the content baseline.
- Use existing actions to create depth: choose an appropriate army, provision it, prepare a frontline city, preserve a threatened garrison, time a purchase, finish an enemy formation, or disengage when the exchange is bad.
- Add only the internal machinery needed to make these choices reliable: shared forecasts, bounded candidate evaluation, actual decision traces, and one small persistent objective per faction.
- Retain the current limit of **at most one new rival campaign per faction at a monthly boundary** during the core work. This is a dispatch-rate limit, not a statement that only one campaign may be active.
- Preserve the approved normal battle timeout of 30 days, raid timeout of 10 days, and survivor-count outcome with defender ties. Make AI understand these rules before experimenting with different rules.
- Keep manual command, direct administration of the player's capital, governor authority, and current control flows. Explain improved decisions through existing logs/reports where appropriate.

New scenarios, officer content, siege systems, technology trees, additional battle objectives, a new initiative system, elaborate diplomacy mechanics, and a replacement renderer are outside this plan. An LLM, reinforcement-learning policy, large search tree, or general planning framework is not a dependency for v0.4.

### What the player should notice

1. Rivals choose plausible wars and arrive with forces they can support.
2. A faction can prepare or recover without appearing to have forgotten its purpose.
3. Governors respond to the actual financial and military situation.
4. Tactical opponents make useful trades, preserve vulnerable formations, and use their limited tactic points deliberately.
5. The same effect works consistently for human command, auto-command, and NPC battles.
6. Losses and setbacks can be understood from the visible rules and the preceding decisions.

These are the acceptance goals. More battles, higher AI win rates, and faster unification are supporting measurements, not substitutes for them.

## 2. Review basis and evidence

This review follows the active `src/v03` implementation. Archived v0.1/v0.2 descriptions and earlier discussions are historical context, not evidence of current functionality. In particular, the current faction type and campaign planner do **not** implement the previously discussed persistent ruler personalities or multi-month goals. See [faction state][types] and [strategic planning][strategic].

### Existing strengths to retain

| Area               | Existing implementation worth building on                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign planning  | Pure deterministic planner; real route and supply estimates; whole-officer parties; reserved stocks; source/target conflicts; independent-city conquest.      |
| Campaign execution | Revalidation before dispatch; explicit journeys and manifests; wounded separation; arrival, return, battle, and captivity accounting.                         |
| Governors          | Shared action effects and authority; NPC-capital work; protected provisions; two work points every ten days; separate monthly talent counters.                |
| Battles            | Terrain-aware route fields, legal movement and ZOC, normal/tactic forecasts, water modifiers, morale, support-first ordering, route-aware whole-army retreat. |
| State integrity    | Invalid commands preserve source state; a serialized daily cursor; strict save validation; many conservation and boundary regressions.                        |
| Evaluation         | Existing strategic, tactical, governance, integration, save, diagnostic, and performance tests; historical matched-seed evidence with stated limitations.     |

Sources: [developer contracts][contracts], [strategic planner][strategic], [engine][engine], [governor autonomy][autonomy], [battle engine][battle], [storage][storage].

### Checks performed for this plan

The following existing suite selection passed **145 tests across 10 files** on the reviewed snapshot:

```bash
npm test -- \
  tests/v03/strategic-ai.test.ts \
  tests/v03/engine.rival-dispatch.test.ts \
  tests/v03/battle.test.ts \
  tests/v03/campaign-diagnostics.test.ts \
  tests/v03/campaign-bot.test.ts \
  tests/v03/governance/autonomy.test.ts \
  tests/v03/campaign/monthly-systems.test.ts \
  tests/v03/engine.integration.test.ts \
  tests/v03/month-boundary-arrivals.test.ts \
  tests/v03/platform/storage.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

Additional small, controlled probes executed the real exported game functions to check the findings below. They were review experiments; no implementation or regression-test changes are included in this documentation commit. Their results establish behavior in those fixtures, not its frequency in normal campaigns.

This review did not perform a new long-campaign balance matrix, browser playthrough, full repository test run, or low-end-device measurement. The existing player-session and hardware gates remain open. Historical diagnostic figures below retain their original scope.

### Findings that drive the plan

**Classification:** “Reproduced” means observed in a controlled runtime fixture; “source-confirmed” means visible in the current control flow or formulas; “design limitation” means a supported improvement opportunity whose campaign impact still needs measurement. Line references refer to the reviewed commit.

| ID  | Finding and evidence                                                                                                                                                                                                                                                                                              | Why it matters                                                                                                                                     | Priority              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| F01 | **Reproduced:** campaign candidate filtering allows an allied city; dispatch rejects it, with no fallback. `strategic-ai.ts:371–427`; `engine.ts:1464–1471,1607–1614`.                                                                                                                                            | An invalid first choice can waste the faction's monthly planning opportunity even when a legal alternative exists.                                 | P0                    |
| F02 | **Reproduced:** Confuse excludes already-acted targets; the normal day flow marks all human units acted before enemy AI. `battle/engine.ts:580–626,1244–1285`. **Source-confirmed:** Rally says “next attack +20%” but Inspired is not consumed by a hit.                                                         | Effect usefulness depends on control order, and a stated effect does not match its lifetime.                                                       | P0                    |
| F03 | **Reproduced/source-confirmed:** supply-tactic scoring uses `ceil(healthy troops / 1000)` food/day; real rations include healthy plus wounded, cavalry weighting, and a rate of 0.04. `battle/engine.ts:1036–1042`; `engine.ts:383–407`; `calendar/index.ts:440`.                                                 | The AI values supply denial using a different economy from the game it plays.                                                                      | P0                    |
| F04 | **Reproduced:** governor forecasting adds one to its month argument; monthly and ten-day callers pass different meanings of “month.” `autonomy.ts:129–164`; `engine.ts:1670–1672,1752,2136–2140`.                                                                                                                 | Ten-day decisions around September use the wrong harvest multiplier.                                                                               | P0                    |
| F05 | **Reproduced:** restore-loyalty costs 80 gold for +2 loyalty; security costs no gold and gives at least +8, with the same one-point work cost. The governor can prefer restore-loyalty. `city-actions.ts:78–80,130–177`; `autonomy.ts:340–354`.                                                                   | The AI spends scarce resources on a strictly weaker version of an available action.                                                                | P0                    |
| F06 | **Reproduced:** normal attacks are ranked by outgoing casualties, while tactics are compared with an ordinary attack against the lowest-troop target. `battle/engine.ts:318–327,1014–1058,1106–1121`.                                                                                                             | A tactic can lose to an available ordinary attack on every relevant term and still be chosen. Retaliation is omitted from ordinary target ranking. | P1                    |
| F07 | **Reproduced:** campaign planning ranks attacks but has no military viability gate or explicit alternative to attack. `strategic-ai.ts:246–331`.                                                                                                                                                                  | The best available attack can still be a disastrous attack.                                                                                        | P1                    |
| F08 | **Reproduced:** only one greedily filled party is quoted; an unaffordable large party eliminates the target even when a smaller party is affordable. `strategic-ai.ts:131–181,262–304`.                                                                                                                           | The AI misses opportunities and uses army size inefficiently.                                                                                      | P1                    |
| F09 | **Source-confirmed:** an incoming foreign journey can stop all governor work, while strategic source filtering does not evaluate the impending invasion. `autonomy.ts:114–123,239–243`; `strategic-ai.ts:371–372`.                                                                                                | Defense preparation and army dispatch can respond inconsistently to the same situation. Campaign frequency is unmeasured.                          | P1                    |
| F10 | **Reproduced/source-confirmed:** a routed unit can move toward enemy attack positions; units with any current attack skip movement comparison; threat scoring sees current enemy range only. `battle/engine.ts:944–1008,1106–1145`.                                                                               | The AI misses safer or stronger complete actions and can expose units unable to attack.                                                            | P1                    |
| F11 | **Design limitation:** campaign planning emits immediate conquests; domestic work follows a fixed priority ladder; there is no persistent faction objective connecting preparation to deployment. `strategic-ai.ts:43–64`; `autonomy.ts:329–491`; `types.ts:32–42`.                                               | Existing logistics and personnel systems cannot yet support a coherent NPC preparation plan.                                                       | P1, after foundations |
| F12 | **Reproduced/source-confirmed:** diagnostic work counters still use the old monthly interpretation; manually listed fingerprints omit current simulation modules; actual rejected-option reasons are not reliably observed. `v03-campaign-diagnostics-helpers.mjs:120–139`; `v03-campaign-diagnostics.mjs:19–39`. | Tuning can optimize an inaccurate or incomplete measurement.                                                                                       | P0 enabler            |

Primary sources: [strategic][strategic], [campaign engine][engine], [battle engine][battle], [calendar][calendar], [autonomy][autonomy], [city actions][city-actions], [diagnostic runner][diagnostics], [diagnostic summaries][diagnostic-helpers].

### Concrete examples to turn into regression fixtures

| Fixture                                                                                                                                                         | Observed current result                                                                                                                                                  | Required improvement                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yuan at Ye; allied undefended Pingyuan; legal independent Jinyang with 1,000 defenders; six 1,000-troop officers and ample food; advance day 29 to 30.          | Planner chooses Pingyuan; monthly dispatch produces no campaign. Removing that allied candidate makes the planner choose Jinyang.                                        | Filter the alliance before ranking and preserve fallback after a stale rejection.                                                                                                            |
| A 5,000-troop expedition has only a 50,000-defender target.                                                                                                     | Planner proposes conquest.                                                                                                                                               | Recognize an obviously unfavorable routine conquest and choose a justified preparation/defense/wait outcome.                                                                                 |
| Empty target; current maximal party is 5,000 troops requiring 10,304 food; a one-officer 1,000-troop party requires 2,944 using the same route/supply services. | With 2,944 source food the planner returns no plan.                                                                                                                      | Consider smaller legal parties. The improved policy must also protect the home city's obligations; this example proves missing alternatives, not that spending every food unit is desirable. |
| Archer with 1,000 troops, force 80, intellect 70; both a 20-troop enemy and a 3,000-troop infantry target are in range.                                         | Ordinary attack on the large target forecasts 417 casualties and no counterattack. Fire forecasts 114–139, costs four tactic points, and is chosen; the probe dealt 131. | Compare the tactic against the best ordinary candidate, not a different low-value target.                                                                                                    |
| Infantry can attack a strong enemy for 533 casualties with 752 retaliation, or eliminate a 100-troop enemy without retaliation.                                 | AI selects the first exchange.                                                                                                                                           | Apply a consistent retaliation/preservation score and elimination value.                                                                                                                     |
| AI intellect 120, 100 troops; enemy intellect 0, 5,000 troops, three cells away.                                                                                | Direct AI invocation can choose Confuse at 90%; the normal day flow makes Confuse unavailable against the human.                                                         | Test effect timing through the real day flow and campaign wrapper in both seats.                                                                                                             |
| 1,200 infantry with 500 food.                                                                                                                                   | Actual demand is 48/day, about 10.42 days of food. The tactic evaluator assumes 2/day, or 250 days.                                                                      | Use the actual ration model, including fractional accounting.                                                                                                                                |
| A morale-10 infantry unit at `(5,5)`, healthy ally elsewhere, enemy at `(10,5)`.                                                                                | Routed unit moves to `(8,5)` toward the enemy.                                                                                                                           | Prefer a safe legal position, useful rally access, or holding.                                                                                                                               |
| Puyang with farming 100, population 20,000, food 1,000, monthly upkeep 444.                                                                                     | On absolute day 220 the planner projects 1,206 instead of 1,026 food; on day 250 it projects 1,026 instead of 1,206.                                                     | Derive the next settlement from the absolute calendar.                                                                                                                                       |
| Same capital state, loyalty 50, Cao Cao as actor; independent command attempts.                                                                                 | Restore-loyalty: −80 gold, +2 loyalty, one work point. Security: 0 gold, +12 loyalty, one work point.                                                                    | Remove the dominated autonomous choice and reconcile the legacy action name.                                                                                                                 |
| Day 20; city has `workMonthIndex=0`, `workPeriodIndex=0`, `workPointsUsed=2`.                                                                                   | Authoritative current-period use is 0; diagnostic summary counts two completed points.                                                                                   | Distinguish current-period counters from accumulated completed work.                                                                                                                         |

Numeric combat results are fixture observations. Preserve the behavioral comparisons in tests; do not freeze incidental damage numbers when a separately approved combat-rule change legitimately changes them.

## 3. Implementation principles

### 3.1 Share rules; keep policy separate

Extract small pure queries where duplication has caused disagreement. Forecast food demand, the next settlement, attack legality, action effects, and incoming threats from the same underlying rules used by execution. Existing `predictBattleAttack`, `predictBattleTactic`, route services, city-action availability, and personnel summaries are starting points.

A legal action and a wise action are separate concepts. A protected reservation or invalid alliance is a legality constraint. An AI preference to retain an extra food buffer is policy. Do not silently forbid the human from making a risky legal choice merely because the AI avoids it.

Keep final command/dispatch validation. The planner's snapshot can become stale after another faction or formation acts. A rejection must be harmless, explained, and followed by a bounded fallback or deliberate wait.

### 3.2 Compare complete alternatives

Campaign candidates should include different whole-officer parties and a preparation/defense/wait alternative. Tactical candidates should include `(destination, action, target)`, with staying and holding represented explicitly. City work should compare the effects of available actions against the actual deficit and time horizon.

Keep scoring terms inspectable. A useful starting form is:

```text
utility = objective progress
        + expected enemy capability removed
        + useful resources or future income gained
        - expected own capability lost
        - supply and defensive exposure
        - action/resource opportunity cost
```

This is a design outline, not a universal formula to paste into every layer. Tactical and campaign scores need different units and calibration. Normalize terms within each layer, document their ranges, and keep hard legality outside the score. Avoid mixing “food units,” “tiles,” and “soldiers” through unexplained coefficients.

### 3.3 Use short horizons and bounded computation

Start with current state, the next economic settlement, actual travel ETA, and one likely tactical response. A small set of sound alternatives is sufficient for the reproduced failures.

Initial implementation limits, to be checked against the existing performance gate:

- Campaign: shortlist up to three useful targets per faction, with up to three distinct legal party compositions per target. Always include a safety/hold alternative. Shared legality filters run before this shortlist.
- Tactical: retain current route fields; shortlist up to six destinations per formation, including its current tile. Keep tactically distinct options such as the best immediate attack, a safe position, and progress along a legal route. Evaluate legal normal/tactic/hold actions at those destinations.
- Add a cheap opponent-reply estimate only to the best few tactical candidates. Cache reachability/threat information per board revision and invalidate it after movement, elimination, or another relevant change.
- Avoid whole-world rollouts, enumeration of every officer subset, and unbounded per-unit searches. If the deterministic evaluation budget is exhausted, use the best fully evaluated legal candidate.

These caps are proposed starting budgets, not measured optima. A stable operation budget must decide behavior; variable wall-clock timing must not make the same seed choose different actions. Profile representative late and congested battles before increasing caps.

### 3.4 Preserve reproducibility and authority

Planning must not consume live gameplay RNG, allocate IDs, mutate reservations, move officers, or advance time. Use pure expected-value forecasts or isolated scratch state. Never inspect future RNG outcomes to choose an action. The information available to AI must match the game's existing information policy; this version does not need a new fog-of-war system.

For NPC use of existing transfers/requisitions, extract an internal executor with an explicit acting faction and the same authority checks. Public player commands continue to derive their actor from the player session. **Never temporarily change `state.playerFactionId` to impersonate an NPC.** Current transfer and requisition paths are player-bound, so this boundary is real implementation work, not a simple extra function call. See [officer transfers][transfers] and [authority][authority].

### 3.5 Keep the change local

Work incrementally inside the current source structure. Small policy/forecast modules can be extracted when they have a concrete caller and regression fixture. Renaming `src/v03`, replacing the engine, or creating a generic AI framework is not a prerequisite.

Developer traces should be bounded and disabled or cheaply summarized in normal play. Use typed reason codes and values, such as “destination is allied,” “next settlement food deficit,” or “source threatened before reinforcements arrive.” Player-facing text should explain observed events or the player's own administration; internal enemy plans do not automatically become public reports.

## 4. Prioritized implementation work

Complete each ticket with its behavior fixtures and a small reviewable change. Do not combine formula repairs, new policy weights, and a campaign-rate change in one experiment.

### V04-00 — Establish trustworthy decision evidence

**Priority:** P0 enabler. **Dependencies:** none. **Main files:** [diagnostic runner][diagnostics], [summaries][diagnostic-helpers], [campaign bot][bot], and the real planner/dispatch/action boundaries.

**Work**

- Convert the concrete review examples into focused regression fixtures. They should initially demonstrate the current failures and then accompany their corresponding fixes.
- Capture actual decision records: day, faction/unit/city, objective if present, candidate legality, predicted costs/outcomes, selected candidate, decisive terms, execution result, and fallback.
- Report constrained waiting, deliberate waiting, no legal options, failed execution, and missing observations separately.
- Correct work telemetry for ten-day periods. Use actual completed-action events/counters for cumulative work; do not sum or reinterpret a single endpoint counter as monthly history.
- Record reviewed/run commit, clean/dirty state, policy configuration, seed, scenario, runtime version, and a complete simulation/config fingerprint. Hash the relevant tracked source tree or imported closure rather than maintaining a fragile hand-picked list.
- Preserve historical JSON and its caveats. New runs use new output paths under `.artifacts/` until evidence is intentionally retained.

**Acceptance**

Observed execution counts reconcile with committed commands. The day-20 stale-work fixture is classified correctly. Changing battle rules, personnel, roster, transfer, or policy code changes the source fingerprint. Enabling traces produces identical game state and RNG to a run without traces. Trace retention is bounded.

### V04-01 — Align strategic legality and preserve fallback

**Priority:** P0. **Dependencies:** V04-00 fixture/trace support. **Main files:** [strategic planner][strategic], [engine dispatch][engine], [monthly alliance rules][monthly].

**Work**

- Apply the authoritative active-alliance/attack check before ranking targets.
- Share the relevant source, officer, commitment, ownership, and target-legality queries between planning and dispatch. Keep commit-time revalidation.
- Keep an ordered, bounded set of alternatives. After a stale rejection, refresh the needed facts and try the next legal option. Count successful dispatches against the one-new-campaign monthly limit; cap attempts separately to prevent loops.
- Record why a proposed campaign failed. Do not leave failed alternatives reserving stock or blocking targets.

**Acceptance**

F01 chooses legal Jinyang. Alliance expiry is handled at the correct boundary. A target changing ownership or becoming busy between planning and dispatch triggers a harmless fallback. No attempt spends resources, changes RNG, or allocates committed IDs on failure. At most one new rival campaign per faction succeeds at that boundary.

### V04-02 — Unify food and calendar forecasts

**Priority:** P0. **Dependencies:** V04-00. **Main files:** [calendar][calendar], [campaign engine][engine], [autonomy][autonomy], [battle scoring][battle], personnel summaries.

**Work**

- Extract a pure ration-demand calculation with healthy/wounded headcount, cavalry weighting, and fractional remainder. Use it in battle charging and AI supply evaluation.
- Derive the next unsettled economic boundary and its harvest month from absolute-day/calendar state. Remove the ambiguous use of `settledMonth` in ten-day forecasting.
- Provide a short post-action city forecast: current stock, outstanding reservations, accrued upkeep, remaining service days, production at the next settlement, and known arrivals before the relevant deadline.
- Use the existing food-credit logic for already-paid personnel and transfers. Do not charge the same people twice when they move between city, journey, and battlefield.
- Distinguish current raw stock, legally available stock, and projected balance after obligations. An arrival after the bill is due cannot prevent that bill's shortage.

**Acceptance**

F03 and F04 are corrected. Forecasts and settlement agree for unchanged fixtures with infantry, cavalry, wounded, prisoners, fractional food, and previously paid rations. Check day 10/day 20, August/September, year rollover, and a same-day arrival/settlement. A preview is pure and survives save/reload without changing results.

**Boundary:** forecast refinement does not change monthly billing or introduce a new supply resource. Any later accounting-rule change needs its own demonstrated defect and test.

### V04-03 — Make status lifetime match the promised effect

**Priority:** P0. **Dependencies:** V04-00. **Main files:** [battle engine][battle], battle types, [save validation][storage], existing battle copy and tests.

**Proposed v0.4 contract**

- Confuse denies the target's **next eligible activation**, whether cast before or after its current activation. An activation means its next scheduled opportunity to take an otherwise legal action, ignoring Confuse itself; this includes a routed unit's move/hold opportunity. The effect may therefore cross a day boundary. It is consumed once when that activation is skipped, or removed by Rally. Repeated casts do not stack multiple lost activations.
- Rally keeps its morale recovery and confusion removal. Its advertised +20% damage is consumed by one qualifying hit. Start with the damage paths that currently use Inspired: ordinary attack, counterattack, or Ambush. It does not add a bonus to Fire/Rockfall. Consumption and forecasts must use one definition.
- A missed opportunity to attack does not silently consume the promised next-hit bonus at global rollover. Reapplying Rally refreshes the existing effect without stacking multipliers. Test that this cannot accumulate bonuses indefinitely.

This is an explicit clarification/change of current effect semantics. Update previews, Wiki, bilingual log text, and serialization together. Keep current side order and move/action limits.

**Acceptance**

Run mirrored tests with the player as attacker and defender, manual and auto command, and NPC-only battles. Confuse applied after an enemy action denies exactly the next activation, can be cleared, and never locks a unit permanently. Save/load before consumption preserves the effect. An inspired unit receives one bonus across attack/counterattack/Ambush sequences, and subsequent hits use normal damage. A routed unit consumes Confuse when its next move/hold opportunity is skipped; a dead unit creates no phantom activation.

### V04-04 — Use one tactical action evaluator

**Priority:** P1. **Dependencies:** V04-02 and V04-03. **Main files:** [battle engine][battle] and existing pure forecasts.

**Work**

- Build legal normal-attack, tactic, and hold candidates before choosing among them.
- Compare each tactic against the best ordinary alternative available to that formation in that position.
- Include retaliation, enemy elimination or rout, preservation of valuable healthy/wounded forces, denied enemy action, useful rally recovery, supply consequences, and the opportunity cost of the side-wide tactic pool.
- Use expected outcomes from existing forecasts. Handle remaining tactic points and regeneration explicitly instead of relying on unrelated constants scattered across selectors.
- Keep a stable deterministic tie-break after meaningful score terms. Target or unit ID should decide genuine ties only.

**Acceptance**

The 417-damage ordinary shot beats the 114–139-damage Fire option when all other effects are equal. The 533/752 exchange loses to the safe finishing hit in its controlled fixture. A low-food supply raid can gain value under the real consumption model. An appropriate Rally can beat an attack, and an unnecessary Rally cannot consume the army's last useful tactic points. Candidate evaluation leaves source state and RNG unchanged.

### V04-05 — Improve movement, preservation, and formation coordination

**Priority:** P1. **Dependencies:** V04-04. **Main files:** [battle engine][battle], [movement/range rules][battle-rules], [performance tests][performance].

**Work**

- Compare bounded move-plus-action candidates even when a current attack exists.
- Preserve route-distance fields, terrain costs, ZOC, water rules, and occupied-cell legality. Estimate the enemy's next reachable attacks, not just damage from its current cells.
- Give individually routed formations a preservation/rally-access objective; they may move legally or hold but should not blindly seek attack range.
- After committing an action, recompute the best next formation/action among the remaining candidates. This allows an inexpensive finishing hit, a timely Rally, and useful sharing of tactic points without building a new tactical planning system.
- Penalize blocking an ally's useful movement or access to a firing position where it can be determined cheaply. Re-evaluate after a kill opens a path. Preserve current ranged-attack legality; intermediate formations do not introduce a new line-of-sight rule.
- Include days remaining and the existing timeout policy in action value. Compare withdrawal with the likely next exchange and available return route; preserve existing retreat thresholds as the initial baseline while collecting evidence for changes.

**Acceptance**

An archer considers a materially better legal move-and-shot. A routed formation stops advancing without a rescue benefit. A cheap finisher can free a stronger unit for another enemy. Water is crossed when the objective/exchange warrants it; safe play does not become universal refusal to engage. No unit receives an extra action. Narrow passages, mixed troop types, late timeout, and both control seats pass behavior fixtures.

Keep the existing 10v10 48×32 battle-day **p95 below 50 ms** test target on the measured test environment. Add representative mid-battle/congested fixtures because first-day travel alone does not bound the new evaluator's worst useful workload. Record hardware and timing conditions; this is not a claim that the current review measured low-end performance.

### V04-06 — Choose viable, affordable campaign forces

**Priority:** P1. **Dependencies:** V04-01 and V04-02. **Main files:** [strategic planner][strategic], [army helpers][army], [dispatch][engine], [threat/authority helpers][authority].

**Work**

- Build a bounded set of whole-officer party alternatives: sufficient small force, balanced force, maximum safe force. Deduplicate identical parties; preserve the ten-officer cap and recompute travel/supply for each composition.
- Evaluate existing troop type, officer force/intellect, troop experience, readiness, route/battlefield context, supply, and expected losses. Reuse actual combat/roster calculations where practical. Avoid treating raw headcount as a calibrated win probability.
- Introduce a conservative viability gate for obviously poor routine conquests. Then rank viable choices by objective value, expected cost, travel delay, and home exposure. A favorable legal opportunity must still beat aimless waiting.
- Derive a shared incoming-threat summary from actual hostile campaign journeys, alliances, ETA, and likely deployable strength. Do not classify every foreign journey as a military invasion.
- Preserve the existing minimum legal garrison, then apply additional AI prudence based on credible threats and the next-settlement food forecast. Keep this prudence separate from human command legality.
- Explicitly score holding/preparing when no attack is useful. Record the force, food, route, or defensive blocker and the condition that would change the decision.

**Acceptance**

F07 and F08 pass. A plainly hopeless 1:10 routine conquest is rejected; a viable inexpensive conquest is considered; a superior opponent does not make a faction permanently inert. A funded departure does not knowingly create an avoidable home shortage or abandon a city before a credible invasion. In all cases the committed officer IDs, healthy troops, wounded handling, food, and journey composition agree.

The estimator is a heuristic until measured. Calibrate it against resolved battles across compositions and maps, inspect systematic errors, and use a safety margin. Do not report its score as a precise probability without calibration evidence.

### V04-07 — Make governor work solve the actual problem

**Priority:** P1, with the dominated-action repair suitable for an early P0 patch. **Dependencies:** V04-02 and the threat summary from V04-06. **Main files:** [autonomy][autonomy], [shared city actions][city-actions], existing monthly and work-period tests.

**Work**

- Replace the dominated restore-loyalty branch with the better legal security action. Prefer one authoritative effect; retain an explicit compatibility alias for the obsolete action name if needed by stored reports/callers.
- For imminent food shortages, compare buying food with farming by their actual effect before the next bill. Farming can win a longer-horizon investment decision; it cannot be assumed to solve an immediate deficit merely because it is below its cap.
- Use current projected obligations before recruiting, selling food, equipping, or developing. Compare meaningful marginal gains rather than repeatedly taking the first legal item in a fixed ladder.
- Allow legal preparation before an approaching battle: preserve defenders, organize existing reserves, obtain food, and restore city/officer loyalty when relevant. Keep active battle commitments as hard restrictions.
- Retain monthly search/first-assignment limits, ten-day work budgets, officer reorganization, protected order stock, and existing authority. Report a constrained wait when no productive action is feasible.

**Acceptance**

Low loyalty with insufficient relief food selects the useful existing recovery action. An imminent shortage chooses a measure that can actually cover it. A safe city can still invest for future return. An allied/noncombat journey does not freeze domestic work. Neither changing governors nor save/reload refreshes used work or monthly talent quotas. Player and NPC effects/costs remain identical.

### V04-08 — Give each faction one persistent objective using existing actions

**Priority:** P1 after the preceding decisions are trustworthy. **Dependencies:** V04-06 and V04-07. **Main files:** [strategic planner][strategic], [types][types], [storage][storage], [transfers][transfers], [orders][orders], [authority][authority], [engine][engine].

**Minimal design**

Store one compact internal objective per NPC faction:

```text
mode: defend | recover | prepare-conquest | conquer
sourceCityId / targetCityId where applicable
startedDay / reviewDay
force and food targets or current deficits
reasonCode / cancellation reason
associated existing order IDs
```

This is AI memory, not a new player management system. Start with a one-to-three-month planning horizon and review at normal planning/work boundaries or a material event. Final retention periods are tuning parameters.

Objective memory is advisory. A force/food target or preparation deficit does not reserve or debit anything by itself. Only an actual existing order creates a hard reservation or resource transfer. Donor and recipient forecasts account for that order once, and the recipient receives usable stock only on legal delivery.

**Work**

- Choose one primary objective and connect governor choices and existing resource/officer movement to it.
- Begin with a bounded support operation from one suitable donor to one frontline city. Use actual transfers/requisitions, route time, costs, reservations, donor needs, and arrival handling. Do not create extra armies or instant resource transfers.
- Keep an objective while it remains useful; switch when a competing objective is materially better or a hard condition invalidates it. Record ownership change, alliance change, incoming invasion, a route no longer legally usable, unavailable commander, or impossible budget as explicit reasons.
- Give each preparation objective a review deadline and a measurable deficit. It must progress, revise, or terminate; it must not hoard resources forever.
- Reuse existing return/cancel behavior if the destination changes hands. Revalidate order associations after succession, conquest, captivity, and load.
- Expose only an appropriate short reason in existing own-governor reports; detailed rival goals stay in developer diagnostics unless the established information rules justify disclosure.

**Acceptance**

A rear city can support a real frontline shortage through an actual journey; it retains enough defense/provisions. The frontline prepares and launches only when ready. A threat can interrupt preparation, and an alliance/ownership change cancels an obsolete attack. Reloading halfway through preparation preserves meaningful choices, consumes no extra RNG, and does not duplicate reservations, orders, or deliveries. Both NPC previews and commits validate the acting faction's authority over the relevant cities, officers, and orders; public player commands reject or ignore supplied actor overrides. The monthly campaign-dispatch cap remains unchanged.

**Save policy**

Keep the existing v3 envelope if this can be an optional, bounded state extension under current validation conventions. A compatible save without objective memory receives a deterministic empty/default objective and no free resources or progress. Reject or safely discard invalid objective references during validation/reconciliation according to the documented schema. If a mandatory incompatible change proves necessary, use an explicit versioned contract and retain raw-export recovery; never silently reinterpret an old save. This plan does not create a broad old-version migration project.

### V04-09 — Calibrate and decide the release

**Priority:** release gate. **Dependencies:** completed core tickets. **Main files:** existing test/diagnostic tools and current documentation.

**Work**

- Compare the frozen v0.3 policy, the P0-corrected baseline, and each policy increment. Distinguish improvement caused by fixing a rule error from improvement caused by a new heuristic.
- Use the evaluation protocol below, including mirrored tactical seats and scenario/faction breakdowns.
- Update the player guide/Wiki only for actual changed semantics, and record release status without declaring human validation from automated passes.
- Remove dead policy branches and temporary tuning switches once an increment is accepted. Keep useful diagnostic configuration and preserved baseline evidence.

**Acceptance**

The reproduced failures are resolved, new decision fixtures pass, state/authority/performance contracts hold, and paired runs show no unexplained regression in another faction or scenario. Human sessions find understandable decisions and useful counterplay. Any remaining limitation is documented with a reproduction or measurement, rather than hidden by adjusting aggregate targets.

## 5. Evaluation protocol and release gates

### 5.1 Test decisions before campaign averages

| Layer             | Required cases                                                                                                                                                | What a pass establishes                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Rule parity       | Alliance eligibility, forecast/settlement food, seasonal boundaries, status consumption, action costs.                                                        | The AI is evaluating the rules that execute.                             |
| Tactical choices  | Dominated Fire, retaliation trap, finishing hit, timely Rally/Confuse, low supplies, routed-unit preservation, move-and-shot, water/chokepoint, late timeout. | Specific useful behaviors under controlled conditions.                   |
| Strategic choices | Allied target masking an alternative, excessive defense, smaller affordable army, threatened source, food liability, support ETA, preparation cancellation.   | Attack/prepare/defend/wait alternatives work for their intended reasons. |
| Continuation      | Save before dispatch/status consumption/arrival/month boundary; interrupted multi-battle day; stale plan after conquest/alliance/succession.                  | Choices and resource transfers remain deterministic and exactly once.    |
| Conservation      | Officers, healthy/wounded/prisoner pools, XP/type, food and prepaid credits across city/journey/battle/return.                                                | Better planning has not bypassed existing bookkeeping.                   |
| Performance       | Existing 10v10 fixtures plus representative congested/late battles and a full monthly planning pass.                                                          | Bounded reasoning fits the existing turn budget.                         |

Test behavior and invariants. Avoid tests that simply assert the implementation's current coefficient or duplicate its scoring formula. For near-equal choices, accept a set of sound actions instead of overfitting one ID.

### 5.2 Tactical comparisons

Keep the existing pacing harness for what it measures. Its current symmetric 3v3 armies use force 70, intellect 65, and 100,000 supplies. It can exercise several tactics, but it does not cover high-intellect Confuse users or representative caster/composition diversity, and it does not invoke campaign ration charging. See [battle pacing][pacing].

Add a small fixed fixture matrix covering mixed experience, high-intellect casters, wounded-heavy and cavalry-heavy armies, low supplies, threatened shooters, narrow passages, and both water directions. Start with a declared development seed set and a separate held-out set; do not tune repeatedly on held-out results. Run baseline/candidate on paired seeds and swap both side and control seat where the comparison permits.

Report victory/outcome, casualties and retained capability, wasted/dominated actions, useful tactic-point spending, unnecessary exposure, idle/stalled days, battle duration, and p50/p95 time. Separate resolved-battle duration from the age of an active battle. A longer battle can be better if it reflects maneuver and preservation; endless non-engagement is a failure.

### 5.3 Campaign comparisons

The historical 24-row, 96-month final matrix reported zero true unifications/Hegemon victories and average selected-faction ownership of 3.25 cities. The user accepted that v0.3 diagnostic miss. Experiments increasing offensive fronts produced mixed or worse outcomes and were rejected. Those results belong to their recorded source fingerprints and narrow adjacent-city bot; they are not measurements of the October 28 review tree or human win rates. See the [evidence record][evidence].

Use a staged evaluation budget:

1. **During each ticket:** its targeted regressions and a short deterministic continuation check. Do not run a full campaign matrix for every coefficient edit.
2. **At policy integration:** both scenarios and their six playable factions, using the existing development/held-out structure, first for 90 days and then 12 months. This checks early collapse, invalid plans, and preparation progress.
3. **Before accepting strategic tuning:** a matched long run, up to the existing 96-month horizon, once short runs are stable. Preserve raw outcomes and source/configuration fingerprints.
4. **Coverage beyond the existing bot:** add small scripted diagnostic policies for passive defense, normal economy-first preparation, and a deliberate border attack. These are evaluation drivers using real commands, not gameplay features or claims to simulate all human strategies.

Useful campaign metrics include:

- Actual proposed/committed/rejected campaigns and reasons; fallback success; affordable opportunities skipped.
- Clearly unfavorable routine attacks, premature departures, source exposure, avoidable provision shortfalls, and known-arrival timing errors.
- Objective duration, switches with reasons, preparation deficits resolved, and obsolete objectives terminated.
- Real support departures/deliveries, donor conditions, ten-day work use, and blocked work reasons.
- Ownership, capture/recapture, faction survival, ruler loss, true unification, and Hegemon outcomes, broken down by scenario/faction.

Do not require every faction to survive, every campaign to unify, or a fixed percentage of battles to be close. Do not infer a missing metric as zero. Interpret small paired samples as evidence with uncertainty; an aggregate average must not hide an opening-specific collapse.

### 5.4 Human and release checks

Retain the existing four player sessions of 12 campaign months with at least three manual battles each. Use at least one weak opening and one strong opening, and both scenarios across the sessions. Review exported saves at moments where the AI seemed foolish, unfair, inactive, or inexplicably clever.

Ask concrete questions: Could the player anticipate the risk? Did the AI respond to an exposed city? Did preparation lead somewhere? Was a failed attack understandable? Did battle tactics affect decisions without becoming compulsory spam? Was a good human plan rewarded by the rules?

Before release, run the full applicable unit/integration suite and build, affected browser/production flows, and the existing performance checks. Status-effect persistence, changed reason text, and any save extension require their relevant UI/save checks. The documentation-only review is not evidence that those future gates have passed. A real low-end-device check remains separate from a test-container timing result.

## 6. Optional follow-ups after the core passes

These are **not required for the v0.4 core** and must not delay correcting the reproduced failures.

| Candidate                      | Condition for doing it                                                                                 | Bounded form                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruler differences              | Shared competent policies are stable, but repeated play still feels too similar.                       | Small explicit risk/reserve/commitment weights applied to existing choices. Derive much of the difference from actual geography, resources, officers, and troop composition. No new personality simulation or scripted historical victories. |
| Diplomacy judgment             | Controlled tests show exploitable alliance decisions after military/legal fixes.                       | Improve valuation within existing alliance/coalition actions using threat, geography, and opportunity cost. Keep treaty rules and costs visible; add no new treaty types.                                                                    |
| Retreat threshold tuning       | Correct action/supply evaluation still produces avoidable destruction or excessive withdrawal.         | Paired experiments on current thresholds and route-valid outcomes, with wounded/experience preservation and campaign consequences measured.                                                                                                  |
| Additional campaign dispatches | Corrected reasoning and logistics still show a measured limit caused specifically by the dispatch cap. | Isolated matched experiment; preserve the conservative baseline and inspect weak-opening harm. Do not bundle with target or economy changes.                                                                                                 |

The game does not need all existing action types to be selected equally often. An unused action may need consolidation, clearer conditions, or removal from AI candidates. Adding another subsystem to justify it is unnecessary.

## 7. Handoff and completion checklist

### Work order

1. Establish V04-00 fixtures and minimal traces.
2. Complete V04-01, V04-02, V04-03, and the F05 dominated-action repair. These form the corrected baseline.
3. Improve tactical comparison/movement through V04-04 and V04-05.
4. Improve campaign force choice and governor reasoning through V04-06 and V04-07.
5. Add the small persistent objective and existing-action support flow in V04-08.
6. Calibrate, run release evidence, and update current docs through V04-09.

Steps 3 and 4 can proceed in parallel after shared forecasts are settled. Assign one editor at a time to shared engine, battle engine, types, commands, and storage files. Each ticket should include the problem fixture, minimal implementation, observed result, and any new constraint; no ticket is permission for unrelated refactoring or content expansion.

### Definition of done

- [ ] Reproduced legality, status, ration, calendar, and dominated-action problems have regressions and fixes.
- [ ] Tactical choices compare the best legal alternatives, including meaningful movement and preservation.
- [ ] Campaigns consider viability, party size, home defense, and post-action provisions.
- [ ] Governors use correct deadlines and shared effects while preserving budgets and authority.
- [ ] Each NPC faction can maintain, progress, and cancel one bounded objective through existing actions.
- [ ] Traces observe actual choices, fingerprints identify the real rules, and missing data stays explicit.
- [ ] Save/reload, invalid-command atomicity, conservation, and deterministic continuation remain intact.
- [ ] Core tests, affected browser/save flows, build, performance, and staged paired comparisons pass their declared scope.
- [ ] Player sessions assess intentional behavior, fairness, pacing, and counterplay; low-end testing is recorded separately.
- [ ] Current documentation states implemented behavior and remaining limits without rewriting historical evidence.

**Release goal:** the same game world offers stronger opposition, more credible preparation, better tactical trades, and rules the player can reason about.

## Source index

All findings above refer to the reviewed commit. Relative links follow the current repository files; consult the pinned baseline when line positions or behavior have changed.

- [Current implementation contracts][contracts] and [current next steps](next-steps.md).
- [Strategic campaign planner][strategic] and [integrated campaign engine][engine].
- [Tactical engine and AI][battle], [movement/combat rules][battle-rules], and [battle types](../src/v03/battle/types.ts).
- [Calendar/logistics][calendar] and [serialized day resolution](../src/v03/calendar/day-resolution.ts).
- [Governor autonomy][autonomy], [shared city actions][city-actions], [authority][authority], [orders][orders], [army assembly][army], and [officer transfers][transfers].
- [Monthly campaign systems][monthly] and [diplomacy commands](../src/v03/campaign/diplomacy.ts).
- [Personnel accounting](../src/v03/campaign/personnel.ts), [daily recovery](../src/v03/campaign/personnel-recovery.ts), and [battle aftermath](../src/v03/campaign/battle-aftermath.ts).
- [Game state][types], [command boundary](../src/v03/commands.ts), and [save validation][storage].
- [Campaign diagnostics][diagnostics], [summary helpers][diagnostic-helpers], [diagnostic player bot][bot], [battle pacing][pacing], and [performance tests][performance].
- [Historical campaign evidence and limitations][evidence].

[contracts]: v0.3/00-decisions-and-contracts.md
[strategic]: ../src/v03/strategic-ai.ts
[engine]: ../src/v03/engine.ts
[battle]: ../src/v03/battle/engine.ts
[battle-rules]: ../src/v03/battle/rules.ts
[calendar]: ../src/v03/calendar/index.ts
[autonomy]: ../src/v03/governance/autonomy.ts
[city-actions]: ../src/v03/governance/city-actions.ts
[authority]: ../src/v03/governance/authority.ts
[orders]: ../src/v03/governance/orders.ts
[army]: ../src/v03/governance/army.ts
[transfers]: ../src/v03/governance/officer-transfer.ts
[monthly]: ../src/v03/campaign/monthly-systems.ts
[types]: ../src/v03/types.ts
[storage]: ../src/v03/platform/storage.ts
[diagnostics]: ../tools/v03-campaign-diagnostics.mjs
[diagnostic-helpers]: ../tools/v03-campaign-diagnostics-helpers.mjs
[bot]: ../tools/v03-campaign-bot.mjs
[pacing]: ../tools/battle-pacing.mjs
[performance]: ../tests/v03/performance.test.ts
[evidence]: v0.3/evidence/README.md
