# Play-feel plan: a more enjoyable game from the systems it already has

**Project:** Hegemony of the Three Kingdoms / 三国霸业

**Review date:** October 29, 2026, against `v0.4` at `a5b028e`. Line references point to that commit.

**Status:** Accepted October 29, 2026, with every recommendation in section 5. Phases 0–3 are implemented on `v0.4` (sections 7.1–7.4); the owner merged Phases 2 and 3 before the v0.4 sign-off, so the pending v0.4 player sessions evaluate their battle rules, rival AI and economy changes. The owner's first play session led to the fixes in section 7.5. Phase 4 is not started. It does not replace the [v0.4 plan](implementation.md) or its pending player/hardware gates; section 7 explains how the two fit together.

## 1. Goal and guardrails

v0.4 made the rules trustworthy and the AI coherent. This plan targets the next problem: **a new player who plays correctly still has a flat, clerical, sometimes unfair-feeling experience.** The aim is more anticipation, more real decisions per minute, shorter and more readable battles, rivals with recognizable character, and results that land.

**No new systems.** The scenarios, map, roster, three troop types, six tactics, logistics, governance, diplomacy actions and victory conditions stay as they are. The allowed tools are:

- presenting state the game already computes (forecasts, threats, timeout standing, reasons);
- shortcuts and smart defaults that call existing commands;
- retuning existing numbers, and retiring options that are dominated or pointless;
- AI policy variation driven by data that already exists (officer stats, ruler traits, geography);
- bug fixes and corrections to stale documentation.

Each item below is tagged with an **effort** (S ≤ 1 day, M 2–4 days, L 1–2 weeks) and a **save impact** (none / compatible optional field / schema change). Every new string needs English and Chinese copy; the existing raw-English detection in Chinese flows applies.

### How this review was done

- Read the v0.3/v0.4 documentation, player guide, playtest scripts and v0.4 evidence.
- Played a fresh 190 Cao Cao campaign in Chromium at 1440×900: start screen, city screens, march builder, time controls, inbox and one complete defensive battle.
- Four focused code reviews of battle, campaign AI, campaign UI and the domestic economy, with headless probes of the real functions (12-month economy runs; 5v5 battles on all 15 maps; `tools/battle-pacing.mjs`). The key claims below were re-checked in source.

## 2. What a first session feels like today

A new Cao Cao player opens Chenliu and finds two officers with troops, two with none, two "free" officers and 2,100 reserve soldiers. They press **Next event** to see what happens.

The clock jumps **47 days**. Four ten-day work periods for the capital expire unused; unused points do not carry over. The jump ends at "The battle at Puyang begins." Each new campaign takes a fresh seed, so the attacker varies. In one run Liu Bei had dispatched the army from Pingyuan on day 30, with arrival on day 47. It was never drawn on the map and generated no report, so the danger was known to the simulation for 17 days and invisible to the player.

The battlefield opens zoomed on the player's own units; the enemy is about 21 columns away and off-screen. If the player only ends battle days, their units hold position. In a second run, with Yuan Shao attacking, 2,200 defenders were reduced to 0 healthy troops in 14 days while the attacker lost 196 of 1,900. Puyang was captured and 760 rear personnel disbanded.

None of this is a rules bug, but it is a poor first hour.

### Five core problems

| #   | Problem                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | **The player can't see the war coming.**        | Rival parties are filtered out of the map (`rendering/campaign-parties.ts:29`). Rival dispatches only reach the internal log (`engine.ts:1449-1452`). The AI and the player's own governors read `incomingCampaignThreats` (`ai/campaign-threats.ts`, `governance/autonomy.ts:318-325`); the player has no equivalent. "Next event" ignores threats and the player's own arrivals (`engine.ts:223-238`, `visibleToPlayer: false`), although the Wiki says it stops at arrivals (`wiki.ts:42`). City ownership is an ellipse at 18% opacity under the city art (`CampaignMapView.tsx:131-140`).               |
| P2  | **Busywork outnumbers decisions.**              | Recruit, assign and march take about 20 interactions across 9 screens. The recruit type defaults to infantry whatever the officers use (`CityWork.tsx:80`). Officers with 0 troops are hidden from the march builder (`ArmyBuilder.tsx:37`). Work points expire every 10 days. Choosing who executes a task is not a decision, since the screen already marks a "Recommended" executor. Restore-loyalty and relief are dominated, and food trade is too small to matter. Training adds +1 force every time (`city-actions.ts:668`), flattening officer identity.                                             |
| P3  | **Battles are long, static and samey.**         | Deployment columns are 10–13 vs 34–37 (`battle/battlefields/layout.ts:45`); first contact comes around day 4 (AI vs AI) or day 6 against a passive player. A unit that starts next to an enemy cannot move (`battle/engine.ts:280-281`). Morale starts at 80 and never recovers except by Rally. Fire's coefficient is 0.1584 against 0.3 for an ordinary hit (`battle/engine.ts:414-415`), and Rally is about 86% of AI tactic casts. A walking day costs about 20 clicks. The enemy turn resolves instantly with no playback, and the log shows only the last 3 days (`BattleLog.tsx:30`).                 |
| P4  | **Rivals are interchangeable; the map grinds.** | All factions share one policy; traits other than Cunning have no effect (`campaign/roster.ts:87`). In the 72 recorded 96-month runs there were no unifications and no Hegemon victory; about 0.67 cities change hands per month, yet the leader gains only 4–5 cities over 8 years (`docs/v0.4/evidence/campaign-long-run.json`). Alliances are 74–90% likely from day 1, retry monthly, and recall an ally's inbound army (`campaign/diplomacy.ts:60-81, 124-148`). Nobody reacts to a leading house. The AI releases captives with loyalty ≥ 75 along with their troops (`campaign/prisoners.ts:385-394`). |
| P5  | **Results don't land.**                         | `styles.css` has no transitions or animations, and there is no audio. There is one toast slot with no auto-dismiss; it overlapped the battle header and the outcome title in the recorded run. Battle outcomes are labelled Attacker/Defender rather than you/enemy and omit the reason and duration. Victory and elimination are inbox reports, after which every command fails while the time buttons stay enabled.                                                                                                                                                                                        |

## 3. Design pillars

1. **See it coming.** Every threat to the player is visible with an ETA early enough to respond. Every clock stop explains itself.
2. **Every click is a decision.** Remove steps that have only one sensible answer. Keep tradeoffs (army vs population, development vs recruitment) and make their costs visible.
3. **Battles are short, readable and varied.** Contact within about three days, a forecast the player can trust at a glance, all six tactics with a niche, and an enemy turn you can follow.
4. **Rivals have character and react.** Houses differ in recognizable, rule-driven ways, and the world responds to whoever is winning.
5. **Results land.** Conquest, defeat, a rescued officer and the end of a campaign each get a clear moment.

## 4. Workstreams

### 4.1 UI: information and feedback

**PF-UI-01 — Warn about hostile armies (M; save: none).** When a hostile campaign journey targets a player city (`incomingCampaignThreats`), do three things:

- emit a warning-tier report at dispatch with source, target, ETA and strength rounded to hundreds;
- draw that party and its route on the map with an ETA badge (relax the filter in `campaign-parties.ts:29` and `useCommands.ts:381` for journeys aimed at the player);
- badge the threatened city.

Make "Next event" stop at that first warning. Rival-vs-rival wars stay in the chronicle. _Acceptance:_ in the Cao/Puyang case, the warning appears on day 30 with ETA day 47, and the party is visible until arrival. _Decision D1._

**PF-UI-02 — Campaign status strip (S–M; save: none).** Replace the static "Campaign · A divided realm" heading and hint (`CampaignScreen.tsx:26-41`) with live state:

- capital work points and days to refresh;
- total gold and food with the next-settlement net change (from `forecastCityEconomy`, `campaign/economy.ts:124`);
- threatened cities and active battles by city name, each clickable;
- pending decisions;
- officers who have troops but no orders.

The dock's battle buttons should name their city rather than all reading "Open battle".

**PF-UI-03 — Explain every stop (S; save: none).** Pass `stoppedFor` and the event id through `commands.ts:82-92` to `useCommands.ts`. Replace "Advanced 47 days." with "Stopped on Month 2 Day 18: The battle at Puyang begins [View]". After a multi-day skip, summarize what happened ("47 days: 2 rival battles, 1 monthly summary"). This removes the refused-click round trip before the inbox opens.

**PF-UI-04 — Triage the inbox (S–M; save: none).**

- Split it into **Needs decision** and **Updates**, with an "Acknowledge all updates" button and a "Go to city" link per report.
- The top-bar badge counts critical items only, in a danger colour.
- Monthly summaries lead with shortages and totals, then the per-city table.

**PF-UI-05 — Make the economy visible (M; save: none).** The city overview shows:

- next-settlement income, upkeep and net;
- food runway including income;
- "Can march now: N infantry / N cavalry", from the existing supply estimate with its 30-day battle reserve;
- reserve labelled "not defending the city" (reserves do not fight, `campaign/roster.ts:95-125`).

Work previews show marginal effects computed with `cityProduction` before and after:

- development: "+5 gold/month, pays back in about 16 months";
- recruitment: "population −710: −5 gold and −9 food per month, permanently";
- security: "+N gold/month".

This makes the game's biggest tradeoff, drafting people out of the tax base, visible for the first time.

**PF-UI-06 — A readable campaign map (M; save: none).**

- Raise the ownership ring's opacity and stroke, or add a faction-coloured banner, so ownership reads at Fit zoom.
- Add a faction legend with city counts.
- Replace the R/G/L letter badges and the CJK glyph markers (軍/调/任/兵/糧) in English with icons and a legend.
- Mark active battle sites on the map.
- Pan the camera to a city when it is focused from a report or the dock (`gameplayView.ts:269-274` currently only opens the window).

**PF-UI-07 — A readable battle screen (M; save: none).**

- **Opening view:** frame both armies when a battle opens (`useGameSession.ts:330` currently centres on the player).
- **Battle conditions:** collapse the panel into a one-line strip (weather → next, food yours/enemy, selected unit's move/range). Keep the multiplier table behind the existing "?".
- **Rosters:** list your units and enemy units separately; enemies should not read "Ready to act" as if they were yours.
- **On-map forecast:** when targeting, show "You deal X · take Y · morale A→B · ROUTS/DESTROYED" next to the target token. Return the morale delta from `forecastAttack`, and rename "Est. losses" (`i18n/en.ts:159`), which is actually damage to the enemy.
- **Status:** label and icon Wavering and Routed, not only Confused/Inspired.
- **Timeout standing:** add a header line "If time ran out now: you win / lose (ties go to the defender)", using `getBattleTimeoutOutcome`.
- **Enemy detail:** show enemy tactic points, and enemy force/intellect on hover.

**PF-UI-08 — Enemy turn playback and a better log (M; save: none).**

- Diff the battle state before and after `completeBattleDay`.
- Tween token transforms and float casualty numbers drawn from that day's log entries.
- End with a dismissible summary: "Enemy: 3 attacks, you lost 1,240; Zhang Fei's cavalry is wavering." Include Skip, and respect `prefers-reduced-motion`.
- Log changes: side colours, a counterattack tag (an optional log parameter), one collapsed line per side for moves and holds, no repeated rules paragraph on every Rally/Confuse line (`i18n/formatters.ts:52-60`), 1-based coordinates matching the readout, and more than 3 days of history.

**PF-UI-09 — Moments (M; save: none).**

- **Battle outcomes** are written from the player's side ("Victory: Puyang held"). They include the reason (rout, withdrawal, timeout, elimination), the day count, and per-formation dealt/received figures already present in battle data (`battle/types.ts:111-113`).
- **City changes** get a conquest banner and a short ownership pulse on the map.
- **End of campaign:** an end screen built from the existing victory and elimination events, with time controls disabled.
- **Motion:** a small set of transitions (dialog fade, toast slide, marker tween) that respects reduced motion.
- **Toasts** queue, auto-dismiss on success, and never cover headers or modal titles. Remove the per-battle-day "the campaign advanced one day" toast.

**PF-UI-10 — An officer directory that answers "who is idle?" (S; save: none).** Default to your own house. Show location, troops and orders. Add filters for "has troops, no orders" and "no troops". "Visit" pans to the city. Show traits once they mean something (PF-CA-01).

**PF-UI-11 — Copy and help cleanup (S; save: none).**

- Deadlines are entered as "in N days" or a date, not an absolute day number (`OrderForm.tsx:90`).
- "Request supplies" from a sending city becomes "Send from Chenliu".
- Remove "schematic city link".
- F1 opens the Wiki over the city window without discarding its page.
- Esc on the conquest-governance prompt must not silently mean "Decide later"; Esc closes the battle outcome.
- Fix the start screen so "New campaign" is visible without scrolling at 1440×900, and house names don't break over two lines.

### 4.2 Controls: fewer clicks per decision

**PF-CT-01 — Campaign hotkeys (S; save: none).** Space advances 1 day, Shift+Space 10 days, N goes to the next event, I opens the inbox, O orders, C the capital, D diplomacy, M the minimap. Show the keys on the buttons, and ignore them while an input has focus. In battle, make Tab/W/E work anywhere in the battle view except inputs; today they need map focus (`BattleScreen.tsx:64`).

**PF-CT-02 — Recruit → assign → march in about 10 interactions (M; save: none).**

- Skip the executor screen and pre-select the recommended officer; the existing "Change executor" link remains.
- Default the recruit type to the type with the most open officer capacity, and list who can absorb it.
- After recruiting, offer "Assign to <officer>" (assignment is free).
- Add one free action, "Fill officers from reserve", that reuses the governors' reserve-organizing logic and the existing assignment command.
- List 0-troop officers in the march builder as disabled, with an inline "Set troops".
- Default the troop-count input to the maximum assignable amount, not 0.

**PF-CT-03 — Validate the march before Confirm (S–M; save: none).**

- "March here" chooses the nearest source that actually has usable officers, preferring the capital (`CityOverview.tsx:40-62`).
- Sort destinations by ETA and show only reachable ones; disable a destination that fails a dispatch check (alliance, raid cooldown, existing directive, food) and show the reason before Confirm (checks in `governance/army.ts:97-123`).
- Show provisions needed vs available at the source.
- Changing the source city must not move the global selection (`ArmyBuilder.tsx:70`).

**PF-CT-04 — Battle command flow (S–M; save: none).**

- **Attack button:** the menu's **Attack** executes immediately when there is exactly one target. Today it only closes the menu and shows help (`BattleUnitMenu.tsx:58-69`).
- **Unit selection:** after a unit finishes, select the next ready unit and centre the camera on it.
- **Clicking:** clicking a non-reachable cell only inspects it; only green cells move. Hovering a green cell rings the enemies attackable from it.
- **End-day confirmation:** appears only when an unacted unit has a legal attack or tactic (`gameplayView.ts:322-327`).
- **Remaining units:** the confirmation offers **Let remaining officers act** (the existing auto-command AI applied to unacted units only) alongside **Hold**. Units that simply hold are the main reason the passive defence above collapsed.

**PF-CT-05 — Undo the last move (M; optional).** A move that has not been followed by an action consumes no RNG, so it can be reverted from a UI snapshot. Autosave and revision handling make this medium risk; do it after PF-CT-04 if playtests still ask for it.

### 4.3 Rules and logic tuning

Run each change as its own experiment with the existing pacing and campaign tools (section 6). Do not bundle several retunes into one comparison.

#### Economy and officers

**PF-RL-01 — Bank unused work (S–M; save: compatible optional field).** Unused points carry over up to 6, one month's worth, for every city, AI included. The yearly maximum is unchanged, but skipping time no longer destroys work, and the capital needs a visit once a month instead of three times. `CITY_WORK_PERIOD_DAYS` and the 10-day governor cadence stay. _Decision D2._

**PF-RL-02 — Retire or repair dead actions (S; save: none).**

- **Restore-loyalty** (80 gold for +2) is strictly worse than the free security action (+8 + intellect/20). Remove it from the player and AI paths and keep the type only for old reports.
- **Relief** grants +1,500 population instead of +300, about a 12-month payback, as a real counter to recruitment's permanent population drain.
- **Food trade** moves 2,000 food per point instead of 800, a size that matters against march reserves of 13–27k. Update the planner's `protectedFood + 800` threshold (`autonomy.ts:612`) to match.

**PF-RL-03 — Officers grow through deeds, not drills (S; save: none).**

- Training keeps its XP and level-up gains but no longer adds a flat +1 force per session (`city-actions.ts:668`). Twenty trainings currently turn a 35-force strategist into a 65.
- Officers receive half of their troops' battle XP gain at settlement (`campaign/battle-aftermath.ts`), so veterans of real battles level up.

Existing saves keep their already-raised stats. _Decision D3._

**PF-RL-04 — Make southern cavalry a choice, not a trap (S; save: none).** Cavalry costs 0.95 / 2.45 / 5.7 gold per soldier in the north / centre / south, about 20× infantry in the south, and eats double food. Narrow the regional spread (`campaign/recruitment.ts:19-38`) so cavalry stays a premium everywhere but is never absurd.

**PF-RL-05 — Captivity is a ticking clock (S–M; save: none).** Captured officers lose 5 loyalty at each month boundary. The AI holds and retries recruitment while it can feed prisoners, rather than releasing anyone at loyalty ≥ 75 (`prisoners.ts:385-394`). This gives rescue campaigns urgency and gives feasts and rewards a purpose for high-loyalty officers. Add a "retry all prisoner recruitments" helper for the player. _Decision D6._

**PF-RL-06 — Conquest unrest (S; save: none).** A normal conquest caps the city's loyalty at about 50, slightly higher for benevolent conquerors (`engine.ts:450-499`). New governors then spend points on security, which opens a short counterattack window and slows blitzes.

#### Battle

**PF-RL-10 — Reach contact sooner (S; save: none for new battles).** Move deployment to about columns 13–16 vs 31–34 (`layout.ts:45`), a gap of about 15 instead of 21. Raise the raid limit from 10 to about 14 days; 11 of 15 equal-army raids currently end on the survivor-count timeout. Validate the river maps (`bf02`, `bf05`), where deployment may meet water; layout creation throws if a side runs out of cells. _Decision D4._

**PF-RL-11 — Morale that breathes (S; save: none).** At rollover (`battle/engine.ts:1886-1899`), a unit that took no losses that day regains 5 morale, up to 80. Pulling a wavering unit back becomes meaningful, and Rally stops being mandatory upkeep.

**PF-RL-12 — Give every tactic a niche (S; save: none).** Starting points for a paired experiment:

- Fire coefficient 0.1584 → about 0.21, so it beats an ordinary hit in Wind or in forest;
- Rockfall 0.1296 → about 0.18, plus a morale hit;
- Rally cost 2 → 3.

Target: Rally under 50% of casts, and each tactic chosen where its conditions hold. The AI's tactic opportunity cost (`battle/engine.ts:1019-1024`) must be re-checked alongside.

**PF-RL-13 — Let routed units leave contact (S–M; evaluate).** Today a unit that starts adjacent to an enemy cannot move at all (`battle/engine.ts:280-281`), so routed units can't flee and melee freezes. Allow routed units, and optionally any unit starting in contact, a one-tile disengaging step. Keep ordinary zone-of-control blocking for movement through enemy zones.

Deliberately unchanged: ordinary attacks stay deterministic. Exact forecasts are a strength once they are visible (PF-UI-07); variety should come from AI behaviour and tactic choice, not dice.

### 4.4 Battle AI

**PF-BA-01 — Commanders with temperament (M; save: none).** Scale the AI's exposure weight (0.65) and approach value by the commander's force vs intellect, and tactic appetite by intellect and Cunning, all deterministically. The fierce trait leans aggressive. A Lü Bu army should charge and a Zhuge Liang army should hold ground and use tactics. Today, an identical map, roster and set of moves produces an identical battle.

**PF-BA-02 — Feel the clock earlier (S; save: none).** Start "behind on troops" urgency in the last ~30% of the day limit instead of the last 3 days (`battle/engine.ts:1365-1377, 1591-1592`). This fixes river standoffs and raid timeouts.

**PF-BA-03 — Use the whole kit (S, after PF-RL-12).** Verify that the AI picks Fire, Ambush and Rockfall where they win, and Raid supplies when the enemy's food runway is shorter than the days remaining. Add behaviour fixtures, not coefficient snapshots.

**PF-BA-04 — Less clairvoyant caution (S–M).** Exposure currently sums every player unit able to reach a cell (`battle/engine.ts:1466-1474, 1511-1514`). Count only the strongest two likely attackers, reducing edge-of-reach stalemates.

**PF-BA-05 — Readable intent (S).** When an AI army changes posture (advance, hold, withdraw), add one observable log line such as "Yuan Shao's army holds the ford." Use the existing trace reason codes, limited to behaviour the player can see.

**PF-BA-06 — Auto-command asks before withdrawing (S).** "Let officers command" can withdraw the player's whole army without a prompt (`battle/engine.ts:1722-1731`). Pause and ask instead.

### 4.5 Campaign AI

**PF-CA-01 — Rulers with temperament from existing traits (M; save: none).** Every ruler already has a trait that does nothing. Apply it in `assessCampaignDeparture` and the candidate score; succession then changes a house's personality for free.

| Trait      | Rulers                      | Proposed effect                                                                          |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| Fierce     | Sun Jian, Sun Ce, Dong Zhuo | Lower power threshold (≈0.7), tolerates more home risk, may raid below the threshold.    |
| Benevolent | Liu Bei, Liu Yan, Liu Zhang | Higher threshold (≈0.95), ruler stays home, smaller conquest unrest, releases prisoners. |
| Cunning    | Cao Cao                     | Weighs expected losses twice as heavily; prefers weak and isolated targets.              |
| Greedy     | Yuan Shao, Dong Zhuo        | Values rich targets (commerce, population).                                              |

Trait assignments come from `content/traits.ts`. Ma Teng, the 200-scenario Ma ruler, has no trait and keeps the neutral policy unless content gives him one. A ruler with two traits applies both. Show traits in officer and diplomacy screens, with the actual effect in the Wiki. Re-run the existing campaign calibration tool; fierce houses will waste armies by design, but must not collapse in their opening.

**PF-CA-02 — Wars with a purpose (S–M; save: none).** Add small, capped value terms to target ranking (`strategic-ai.ts:484-491`): Luoyang, a city the faction lost recently, the leading house's cities, and rich cities for greedy rulers. Today every city is worth the same.

**PF-CA-03 — Move troops to the front (M; save: none; measure).** Faction-objective support shipments always carry 0 troops (`ai/faction-objectives.ts:459`), and AI officers never move between their own cities except by conquering forward, so interior armies idle forever. Let support orders carry reserve troops from cities with no hostile neighbour, through the existing order path. This is the main fix for map stagnation; measure it with matched 12-month runs because it raises AI strength considerably.

**PF-CA-04 — Diplomacy as a decision (S; save: none).**

- Apply −30 when the player is the strongest house, mirroring the existing penalty against the strongest target (`diplomacy.ts:60-81`).
- Apply −30 if the target has an army en route to the player.
- Stop the automatic recall of an ally's inbound army (`diplomacy.ts:124-148`), or apply it only to armies more than N days out.
- Raise the treaty-break penalty to −30 for 24 months.
- Apply trait modifiers (benevolent +, fierce −).
- Keep a bonus for a player with two or fewer cities so weak openings like Liu Bei survive.

_Decision D7._

**PF-CA-05 — AI raids below the conquest threshold (S–M; save: none).** Fierce and greedy houses may use the existing raid intent at a force ratio of about 0.5–0.8 once the plunder cooldown has expired. Dispatch currently rejects anything but conquest (`engine.ts:1290-1295`). Weaker rivals stay a threat without snowballing the map.

**PF-CA-06 — Check the leader (M; save: schema change; Phase 4).** Generalize the anti-Dong coalition (`campaign/monthly-systems.ts:417-446`) to fire when any house holds about 10–12 cities or starts a Hegemon claim:

- only houses bordering the leader join, for 6 months, with a cooldown;
- the player is invited when the leader is an AI house.

The event id is a literal type in saves (`monthly-systems.ts:214`, `platform/storage.ts:188`), so this needs a versioned schema decision. _Decision D5._

**PF-CA-07 — Scale the dispatch cap with size (S; Phase 4; measure).** Allow `1 + floor(cities / 8)` new campaigns per month, only after PF-CA-03 and only as an isolated experiment. The cap is not binding today (0.36 dispatches per faction-month), so on its own it does nothing.

### 4.6 Fixes found during the review

These are correctness or consistency problems rather than tuning; most are S.

| ID       | Problem                                                                                                                                                                                                            | Fix                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| PF-FX-01 | The requisition wait estimate uses `farming/4` and `commerce/5` per month (`governance/authority.ts:98-105`), 13–26× slower than real production; a 2,000-food shortfall shows about 700 days instead of about 27. | Derive it from `cityProduction`.                                                  |
| PF-FX-02 | "Next event" never stops at the player's own arrivals (`engine.ts:237`), contradicting the Wiki (`wiki.ts:42`).                                                                                                    | Make player arrivals visible stop events, or correct the Wiki. Recommended: stop. |
| PF-FX-03 | `docs/v0.3/player-guide.md:158` says troop assignment uses the work budget; it is free (`city-actions.ts:79`). The assignment screen also shows the work-point counter next to "Uses no work points".              | Correct the guide (both languages); hide the counter on free actions.             |
| PF-FX-04 | Governor work reported as `development-capped` also covers cities with under 80 gold (`autonomy.ts:625-641`), so telemetry mislabels most idle passes.                                                             | Record a separate reason.                                                         |
| PF-FX-05 | After victory or elimination, the time controls stay enabled and every command fails with "This campaign has ended."                                                                                               | Disable them; show the end screen (PF-UI-09).                                     |
| PF-FX-06 | `CampaignSidebar`, `CityPanel`, `GovernancePanel`, `CityActions`, `DiplomacyPanel` and `SupplyOrders` are not reachable in the campaign view; `CityActions` still says "one point per stationed officer up to 3".  | Delete them before the UI work so nobody updates dead code.                       |
| PF-FX-07 | Traits fierce, greedy, loyal and benevolent describe legacy rules that do not exist in this ruleset.                                                                                                               | Give them effects through PF-CA-01/PF-BA-01, or hide them.                        |

## 5. Decisions for the owner

On October 29, 2026, the owner accepted the recommendation for every decision below (D1 a, D2 a, D3 a, D4 a, D5 a, D6 a, D7 b).

| ID  | Question                                                        | Options                                                                            | Recommendation                                                                                                                                                                      |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | How much of a hostile army aimed at the player may be revealed? | (a) at dispatch; (b) within N days of arrival; (c) keep hidden                     | **(a)**, with strength rounded to hundreds. The player's own governors already react at dispatch; hiding it only makes losses feel unfair. Rival-vs-rival wars stay chronicle-only. |
| D2  | Work-point cadence                                              | (a) bank up to 6; (b) a monthly pool of 6; (c) keep expiring 10-day points         | **(a)**. It keeps the deliberate 10-day governor cadence and removes the penalty for skipping time.                                                                                 |
| D3  | Training's flat +1 force                                        | (a) remove, and add officer XP from battle; (b) cap it lower; (c) keep             | **(a)**. Officer identity is the game's strongest content.                                                                                                                          |
| D4  | Battle approach distance                                        | (a) gap of about 15; (b) keep 21                                                   | **(a)**, after the river-map check.                                                                                                                                                 |
| D5  | Anti-leader coalition                                           | (a) Phase 4 with a versioned save change; (b) never                                | **(a)**, only if Phase 3 still shows runaway leaders or a stagnant map.                                                                                                             |
| D6  | Prisoner stakes                                                 | (a) loyalty decay plus AI holding and recruiting; (b) also AI executions; (c) keep | **(a)**. Executions by the AI are dramatic but likely to feel punitive; revisit after playtests.                                                                                    |
| D7  | Alliances recalling an inbound army                             | (a) remove; (b) only for armies more than N days out; (c) keep                     | **(b)** with N ≈ 5, so an alliance cannot be used as an instant shield.                                                                                                             |

## 6. How to measure "more enjoyable"

Use the existing tools for what they measure, and human sessions for the rest. These targets are proposals for comparison, not release gates.

| Measure                                                         | Today                              | Proposed target                                                       | Tool                                                      |
| --------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Warning before the first defensive battle                       | None                               | At dispatch, typically ≥ 10 days                                      | Fresh-game browser script                                 |
| Interactions for recruit → assign → march                       | ≈ 20 across 9 screens              | ≤ 10                                                                  | Browser walkthrough                                       |
| Median day of first contact (AI vs AI)                          | ≈ 4                                | ≤ 3                                                                   | `tools/battle-pacing.mjs`                                 |
| Rally share of AI tactic casts                                  | ≈ 86%                              | < 50%, every tactic used where legal                                  | Pacing harness plus the v0.4 tactical comparison fixtures |
| Equal-army raids ending on the timeout                          | 11 of 15                           | ≤ 40%                                                                 | Pacing harness                                            |
| Clicks for a 10-unit walking day                                | ≈ 20                               | ≤ 8                                                                   | Browser script                                            |
| Capital work points expired unused (12 months, Next event only) | Most                               | 0 beyond the bank cap                                                 | Economy probe                                             |
| Leader's cities at month 48 / month 96                          | 7.6 / 9.6, no victories in 72 runs | Higher variance, with occasional AI Hegemon claims                    | `npm run diagnostics:ai`                                  |
| Factions behaving differently                                   | Identical policy                   | Distinguishable dispatch rate, raid rate and prisoner policy by trait | Campaign diagnostics grouped by ruler trait               |

Add four questions to the existing [player validation packet](v0.4/player-validation.md):

- Did you see each attack on your cities coming?
- Which clicks felt pointless?
- Did one enemy house feel different from another?
- Which battle moment was memorable?

## 7. Phases and relationship to v0.4

The v0.4 player sessions still evaluate AI behaviour and rule clarity. Presentation-only work helps those sessions and does not change the rules being evaluated; rule and AI tuning would.

| Phase                     | Contents                                                                                                   | When                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 0 — Quick wins            | PF-FX-01..07, PF-UI-03, PF-UI-11, PF-CT-01, PF-CT-04 (no rule effect), battle opening framing, toast fixes | Can land on `v0.4` before the player sessions              |
| 1 — See it coming         | PF-UI-01 (after D1), PF-UI-02, PF-UI-04, PF-UI-05, PF-UI-06, PF-UI-10, PF-CT-02, PF-CT-03                  | Before or alongside the v0.4 sessions; presentation only   |
| 2 — Battles that move     | PF-RL-10..13, PF-UI-07, PF-UI-08, PF-BA-01..06                                                             | After v0.4 sign-off; one rule change per paired experiment |
| 3 — Rivals with character | PF-CA-01, PF-CA-02, PF-CA-04, PF-CA-05, PF-RL-01..06, PF-UI-09                                             | After phase 2 pacing settles; matched 12-month runs        |
| 4 — Optional, measured    | PF-CA-03, PF-CA-06, PF-CA-07, PF-CT-05                                                                     | Only if phase 3 still shows stagnation or runaway leaders  |

Work rules carried over from v0.4: one editor at a time for the shared engine, battle engine, types, commands and storage; behaviour fixtures instead of coefficient snapshots; trace parity and deterministic continuation preserved; the 10v10 battle-day p95 < 50 ms gate re-run after any battle AI change; and updates to the player guide, Wiki and both languages for every changed rule.

### 7.1 Phase 0 status

Implemented on `v0.4` on October 29, 2026. Regression tests are in `tests/v03/play-feel-phase0.test.ts`.

| Item            | Result                                                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-FX-01        | Requisition wait estimates use the settlement production formula for the next boundary.                                                                                                                                                                    |
| PF-FX-02        | "Next event" stops when a player party arrives; one-day and ten-day advances still do not pause for it.                                                                                                                                                    |
| PF-FX-03        | English guide corrected (assignment is free); free actions no longer show the work-point counter.                                                                                                                                                          |
| PF-FX-04        | Governor passes that cannot fund development below its cap report `insufficient-budget`.                                                                                                                                                                   |
| PF-FX-05        | A finished campaign replaces the time controls with a "Campaign ended · New campaign…" button.                                                                                                                                                             |
| PF-FX-06        | The unreachable campaign sidebar panels were deleted.                                                                                                                                                                                                      |
| PF-FX-07        | No change needed yet: traits are not shown in the current interface. Their effects arrive with PF-CA-01/PF-BA-01.                                                                                                                                          |
| PF-UI-03        | Each advance says why and when it stopped, counts new reports, and opens the inbox for a report that needs attention.                                                                                                                                      |
| PF-UI-11        | Order deadlines are entered as days from today; "Request supplies" is "Send supplies" (调拨物资); route tooltips drop "schematic city link"; Esc no longer defers conquest governance; Esc closes the battle outcome; start-screen cards and button fixed. |
| PF-CT-01        | Space, Shift+Space, N, I, O, C, D on the campaign map; W and E anywhere in battle view. Buttons show their keys.                                                                                                                                           |
| PF-CT-04        | Attack executes on a single target; clicking outside green cells only inspects; the camera follows the selected unit; the end-day prompt appears only when a ready unit can strike and offers **Let remaining officers act** (never withdraws the army).   |
| Framing, toasts | Battles open framing both armies. Toasts dismiss after six seconds and hide behind the battle outcome; the per-day "campaign advanced" toast is gone.                                                                                                      |

Deferred from Phase 0: opening the Wiki over the city window (it needs the Wiki in the dialog top layer) and the hover preview of attackable enemies, which moves to Phase 2 with the on-map forecast (PF-UI-07).

### 7.2 Phase 1 status

Implemented on `v0.4` on October 30, 2026. Regression tests are in `tests/v03/play-feel-phase1.test.ts`.

| Item     | Result                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-UI-01 | A new `hostileApproach` report (notice tier, compatible optional save value) is issued when a rival campaign departs toward a player city, with source, strength rounded to hundreds and arrival date. **Next event** stops that day; it never blocks day advances or simulations. Hostile parties aimed at the player are drawn in red and never merged with friendly markers. |
| PF-UI-02 | The static map heading is replaced by a status strip: capital work and refresh, gold and food totals with the next-settlement change, threatened cities with days, battles by city, waiting decisions, officers with troops, and a house legend with city counts. Dock battle buttons name their city.                                                                          |
| PF-UI-04 | The inbox separates **Needs your decision** from **Updates**, can acknowledge all updates at once (`acknowledgeEvents`), offers **Go to city**, lists monthly shortages first with totals, and the inbox button turns to danger styling only when something needs a decision.                                                                                                   |
| PF-UI-05 | The city overview shows monthly gold and food (income and upkeep) and food runway from the governors' forecast; the reserve is labelled as not defending. Work previews show each action's lasting monthly effect and a development's payback.                                                                                                                                  |
| PF-UI-06 | Stronger ownership ring plus a house pennant, a capital star only on the player's capital (the R/G/L letters are gone), battle and threat badges on cities, icons instead of CJK glyphs on army markers, and jumps from reports, the strip and the directory pan the map to the city.                                                                                           |
| PF-UI-10 | The directory gains a **Show** filter (all, yours, yours with troops, yours without troops); the strip opens it on "yours with troops". Cards for your officers show location and troops. The dock keeps the full catalogue by default.                                                                                                                                         |
| PF-CT-02 | City work opens on its review with the recommended executor; Back returns to City affairs. Recruitment suggests the cheapest type a local officer can lead and names who can. **Fill officers from reserve** is a free command over the ordinary assignment rule. The troop-count field defaults to the most the reserve allows.                                                |
| PF-CT-03 | **March here** picks the nearest city with officers ready to march. The march form lists reachable destinations by travel time, disables blocked ones with the shared dispatch reason, shows provisions needed against stock, lists officers still without troops, and no longer moves the city window when the source changes.                                                 |

Deviation from the plan text: the officer directory keeps the full catalogue as its default when opened from the dock, because it is also the historical reference; the "who is idle" view is one click away from the status strip.

### 7.3 Phase 2 status

Implemented on October 30, 2026 on the `play-feel-phase2` branch (from `v0.4` at `59c6fff`) and, at the owner's request, fast-forwarded into `v0.4` the same day as `ab1c3b8`. This is earlier than the phase table's "after v0.4 sign-off": the pending v0.4 player sessions now play these battle rules and AI, and the four questions in section 6 should be asked alongside them. Regression tests are in `tests/v03/play-feel-phase2.test.ts`.

Each rule change was measured on its own with `tools/battle-pacing.mjs`, which now reports tactic casts, outcome reasons and timeouts and accepts `--canvas-only` and `--day-limit=N`. Every run uses the same 300 seeded AI-vs-AI battles (20 per canvas battlefield; 3v3, force 70, intellect 65). The portable summary is [docs/evidence/play-feel-phase2-pacing.json](evidence/play-feel-phase2-pacing.json); raw reports are in `.artifacts/play-feel-phase2/`.

| Step                                  | First contact (median day) | Length (median days) | Timeouts, 30-day | Timeouts, raid | Rally share of casts |
| ------------------------------------- | -------------------------: | -------------------: | ---------------: | -------------: | -------------------: |
| Baseline (`59c6fff`)                  |                          3 |                   12 |             9.3% | 73.0% (10-day) |                  75% |
| PF-RL-10 deployment, 14-day raids     |                          2 |                   10 |             8.0% |          36.0% |                  81% |
| + PF-RL-11 morale recovery            |                          2 |                   10 |             7.7% |          35.3% |                  81% |
| + PF-RL-12 Fire/Rockfall/Rally retune |                          2 |                   10 |            10.0% |          25.3% |                  70% |
| + PF-RL-12 Rally valuation recheck    |                          2 |                   10 |             6.7% |          16.7% |                  60% |
| + PF-RL-13 routed disengage           |                          2 |                   10 |             7.0% |          17.3% |                  60% |
| + PF-BA-01..06 battle AI              |                          2 |                   11 |             3.3% |          16.3% |                  58% |

Against the section 6 targets: first contact ≤ 3 days and raids ≤ 40% on the timeout are met. Rally falls from 75–81% to 58% of casts but misses the < 50% target; most remaining casts top up an ally about to attack (+20% on its next hit), a legitimate use. The harness's identical intellect-65 officers cannot cast Confuse, so it understates tactic variety; no weights were tuned to hit the number. The battle AI's 10v10 day costs the same as `59c6fff` on the same machine (median of 90 engaged/congested samples: 103.6/107.5 ms vs 103.6/107.3 ms). The absolute 50 ms gate fails on this Windows laptop for both versions; it was recorded passing on the v0.4 ARM container and needs re-running there.

| Item     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-RL-10 | Deployment columns x 13–16 vs 31–34 (fronts 15 apart). The two wetland maps keep the attacker on the channel's west bank (x 11–14); Yangtze crossing's cliff puts its defender 16 apart. Raids last 14 days and are provisioned for 14 (`campaignBattleDays`). Existing battles keep their saved maps.                                                                                                                                                                                                                                                                                                                                          |
| PF-RL-11 | At rollover a formation that lost no troops (or Rockfall morale) that day regains 5 morale, up to 80, if its side can pay that day's ration; a starving side does not recover, so hunger still breaks armies. Derived from the day's structured log; no save field.                                                                                                                                                                                                                                                                                                                                                                             |
| PF-RL-12 | Fire 0.1584 → 0.21, Rockfall 0.1296 → 0.18 (its −10 morale kept), Rally costs 3. The AI recheck: Rally's morale term now counts only morale restored below 80, since rested formations recover to 80 anyway; its damage effect is still valued through capability.                                                                                                                                                                                                                                                                                                                                                                              |
| PF-RL-13 | A routed formation in contact may step to any free neighbouring cell; ordinary formations stay pinned. Evaluated for routed units only, as one change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PF-BA-01 | Each formation leader's temperament (force vs intellect, fierce +0.35) scales next-exchange exposure 0.42–0.88 (0.65 balanced) and approach value ±30%; intellect and Cunning lower the tactic opportunity cost by up to 30%. Fierce reaches battle as an optional roster/unit field (compatible save). Deterministic.                                                                                                                                                                                                                                                                                                                          |
| PF-BA-02 | A side behind on the timeout count gets its hit urgency in the last 30% of the day limit (9 days of 30, 5 of 14), not the last 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PF-BA-03 | Behaviour fixtures: Ambush from a forest, Rockfall from a hill in rain, Fire on a forest target, Raid supplies when the enemy's food runs out before the battle ends.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PF-BA-04 | Next-exchange exposure counts the two strongest likely attackers, in both the destination shortlist and the full evaluation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| PF-BA-05 | The enemy's posture (presses the attack, advances, holds its ground, falls back) is logged when it changes, from what its formations did that turn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PF-BA-06 | When auto-command would withdraw the player's army it turns itself off, leaves the day open and issues a critical report ("Your officers at X ask to withdraw"); the player commands or withdraws. AI-only battles still withdraw on their own.                                                                                                                                                                                                                                                                                                                                                                                                 |
| PF-UI-07 | Header line "If time ran out now: you win/lose" (tie rule on hover). Conditions collapse to one line (weather → next, food, move/range) with the multiplier table behind **Terrain and multipliers**. Your and enemy formations are listed separately; enemies show no "Ready to act", but force/intellect and the enemy's tactic points. Wavering/Routed have labels and token badges. While attacking, each target shows "Deal X · take Y / Morale A→B · ROUTS/DESTROYED" on the map (from new `forecastAttack` fields); "Est. losses" became "You deal". Hovering a green cell rings the enemies attackable from it (deferred from Phase 0). |
| PF-UI-08 | After a day ends, the rest of the day replays from the log: tokens glide, casualty numbers float, Skip/Esc or a click jumps to the end, and a summary gives attacks, tactics, your losses and formations that began wavering or routing. Reduced motion shows the summary at once. The log colours lines by side, tags counterattacks, collapses each side's moves and holds into one expandable line, uses 1-based coordinates, drops the repeated Rally/Confuse rules text and keeps older days in a collapsible section.                                                                                                                     |

Validation: TypeScript, the UI lint and changed-file formatting pass. All 1,043 unit/integration tests pass, 23 of them in the new Phase 2 file; on this machine the fingerprint test needs GitHub Desktop's git on PATH and a 60-second timeout. All 84 battle-related browser tests pass (battle display, campaign smoke, conquest, multi-battle, playability, unit squads, troop progression, wounded lifecycle); the one test updated asserts the split rosters. The other browser specs were not re-run. Existing fixtures in four unit test files were updated for the new numbers: Rally's cost, the deployment columns, and three tactical fixtures that held exactly 2 tactic points.

Not covered by automated checks: how the replay pacing (650 ms per formation) and the on-map labels feel in real play, and the effect on the v0.4 campaign matrices, which were not re-run.

Phase 3 later re-ran the 12-month campaign matrix on `59c6fff` and on Phase 2 (`2ae44ad`) with the same harness: rival activity barely moves (606 vs 595 dispatches, 208 vs 215 captures), while the diagnostic bot is eliminated in 7 of 24 runs instead of 3. Final city counts move in both directions run by run; the bot's habit of sending small armies at large garrisons makes these outcomes noisy, so this is recorded, not tuned.

### 7.4 Phase 3 status

Implemented on October 30, 2026 on the `play-feel-phase3` branch (from `v0.4` at `2ae44ad`), one commit per item, and at the owner's request fast-forwarded into `v0.4` the same day as `8d10ee6`. As with Phase 2, this is earlier than the phase table's "after v0.4 sign-off". Regression tests are in `tests/v03/play-feel-phase3.test.ts`.

Each rule change was measured on its own with matched 12-month runs: the 24 scenario/faction/cohort cases of `tools/v03-campaign-diagnostics.mjs`, each step on its own commit in a separate worktree, with rival houses on the real AI and the usual adjacent-city bot as the selected player. The diagnostics now record each rival campaign's intent and the house holding each prisoner, and `tools/play-feel-campaign-summary.mjs` groups rival houses by their starting ruler's traits. The portable summary is [docs/evidence/play-feel-phase3-campaign.json](evidence/play-feel-phase3-campaign.json); raw reports are in `.artifacts/play-feel-phase3/`. The RL-01 and final runs also passed `--validate-saves` (311 and 313 checkpoints).

| Step                               | Rival campaigns | Captures / repulses | Raids | Leader's cities (median / max) | Dispatches per year, fierce / benevolent | Bot eliminated |
| ---------------------------------- | --------------: | ------------------: | ----: | -----------------------------: | ---------------------------------------: | -------------: |
| Before Phase 2 (`59c6fff`)         |             606 |           208 / 329 |     0 |                          6 / 9 |                              4.00 / 4.45 |              3 |
| Baseline, Phase 2 (`2ae44ad`)      |             595 |           215 / 311 |     0 |                        6.5 / 9 |                              3.95 / 4.25 |              7 |
| + PF-CA-01 ruler temperament       |             598 |           224 / 299 |     0 |                          6 / 8 |                              4.25 / 4.10 |              4 |
| + PF-CA-02 target value            |             567 |           206 / 308 |     0 |                          6 / 8 |                              4.28 / 3.80 |              7 |
| + PF-CA-05 raids                   |             619 |           205 / 344 |    48 |                          6 / 9 |                              4.58 / 3.75 |              5 |
| + PF-CA-04, PF-RL-01 work bank     |             612 |           200 / 335 |    61 |                          6 / 9 |                              4.90 / 3.80 |              5 |
| + PF-RL-02 relief and trade        |             610 |           204 / 333 |    71 |                        6.5 / 8 |                              4.75 / 3.95 |              6 |
| + PF-RL-03 officer XP              |             629 |           206 / 348 |    63 |                          6 / 9 |                              4.95 / 3.85 |              5 |
| + PF-RL-04 cavalry cost            |             618 |           211 / 339 |    55 |                         6 / 10 |                              4.83 / 3.85 |              6 |
| + PF-RL-05 captivity               |             643 |           190 / 378 |    54 |                          6 / 8 |                              5.05 / 3.88 |              4 |
| + PF-RL-06 conquest unrest (final) |             618 |           196 / 344 |    43 |                          6 / 8 |                              4.95 / 3.83 |              4 |

Final behaviour by the rival ruler's trait (24 runs, 12 months):

| Trait      | Dispatches per house-year | Raids per house-year | Prisoners released | Cities at month 12 |
| ---------- | ------------------------: | -------------------: | -----------------: | -----------------: |
| Benevolent |                      3.83 |                    0 |                 10 |               3.50 |
| Fierce     |                      4.95 |                 0.65 |                  0 |               4.08 |
| Greedy     |                      5.90 |                 0.63 |                  0 |               4.17 |
| Cunning    |                      7.85 |                    0 |                  0 |               5.80 |

Against the section 6 targets: houses are now distinguishable by trait in dispatch rate (fierce above benevolent, reversed from the baseline), raid rate (only fierce and greedy houses raid) and prisoner policy (only benevolent rulers release; across all houses releases fall from 120 to 10 and successful recruitments rise from 39 to 132). The thresholds alone move dispatches modestly, because most AI campaigns already leave at odds well above them. Capital work no longer expires below the six-point bank (unit-tested).

The same 24 cases were also run for 48 months on the baseline and the final rules. The leading house holds a median of 8 cities (7.5 before) and at most 11 (12 before); neither version produces a Hegemon claim. Rivals dispatch 1,501 campaigns (1,377 before), 195 of them raids; over the four years a fierce house dispatches 12.3 against 8.4 for a benevolent one (8.9 and 9.8 before), and benevolent rulers account for all 38 releases. Phase 3 gives rivals character but does not unstick the map, which by section 7's rule points to Phase 4, starting with PF-CA-03 (moving reserve troops to the front).

| Item     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PF-CA-01 | A house's policy follows its current ruler's content traits (`ai/temperament.ts`); nothing is saved, so succession changes it. Fierce: marches at an estimated force ratio of 0.7 (neutral 0.8) and tolerates home risk up to 1.1 (0.9). Benevolent: 0.95, and the ruler never leads a campaign. Cunning: expected losses count twice. The planner, preparation objectives and dispatch revalidation share one assessment.                                                                                                                                                                                                                                                                                   |
| PF-CA-02 | Target ranking and scores gain value terms capped at +50% together: Luoyang +25%, a city the house lost by conquest within 360 days +25%, the strictly leading house's cities +20%, up to +25% for cities richer than average (greedy) and +15% for a target with no friendly neighbour (cunning). Conquest records the loser on the city (`lostBy`, a compatible optional save field): battle history is trimmed on save, so it could not support a deterministic "recent loss".                                                                                                                                                                                                                            |
| PF-CA-04 | The proposal page itemizes the acceptance chance. New terms: −30 when you hold strictly the most cities, −30 while their army marches on you, +10/−10 for a benevolent/fierce ruler, +15 while you hold two cities or fewer; breaking a treaty costs 30 for 24 months (was 20 for 12). D7 (b): a treaty (proposed or via a coalition) turns back only campaigns more than five days out; closer armies are marked `pressesThroughTreaty` (compatible optional journey field), attack on arrival and still count as threats. The diplomacy page names the ruler and character; officer profiles list fierce, benevolent, cunning and greedy with their effects (PF-FX-07; loyal has no effect and is hidden). |
| PF-CA-05 | Fierce and greedy rulers raid another house's city when the conquest ratio falls short but stays at 0.5 or better and the plunder cooldown has passed. A raid scores half a conquest, is provisioned for 14 battle days, uses the existing raid battle and plunder, and does not become the preparation objective. Raids on the player are reported as "Raiders marching on X".                                                                                                                                                                                                                                                                                                                              |
| PF-RL-01 | D2 (a): every owned city still gains two points per ten days; unused points carry over up to six for player, governors and AI. The record stores points carried into its period (`workPointsBanked`, compatible optional field); a period may spend up to six, and the monthly summary accepts up to 30 governor actions per city (was 10, which a banked governor exceeded). The capital readout shows "available/6 · +2 in N days".                                                                                                                                                                                                                                                                        |
| PF-RL-02 | Restore loyalty is refused for every authority. Relief settles 1,500 people (was 300). Market trade moves 2,000 food for 200 gold per point (was 800 for 80); the governor's surplus sale needs 2,000 above its protected reserve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PF-RL-03 | D3 (a): training adds 25 XP and no flat force, so it stops at 500 XP or level 5. Formation officers gain half their troops' battle XP at settlement (20–70 per battle fought), with the same level-up gains.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| PF-RL-04 | Cavalry yields 60% / 50% / 40% of the infantry headcount for 400 / 500 / 600 gold north / centre / south (was 60% / 35% / 20% for 400 / 600 / 800): about 1.0 / 1.5 / 2.3 gold per soldier at force 70 (was 1.0 / 2.6 / 6.2), against 0.3 for infantry.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PF-RL-05 | D6 (a): captives lose 5 loyalty at each month boundary. Rival houses hold captives and ask them every month while the city can feed them; only benevolent rulers still release those at 75 loyalty or more. **Ask every prisoner here to serve** tries each captive in a city once a month. Prisoner reports name the holding house.                                                                                                                                                                                                                                                                                                                                                                         |
| PF-RL-06 | A conquered (or sacked) city starts at no more than 50 loyalty, 60 under a benevolent ruler; lower values are kept.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PF-UI-09 | Battle outcomes read from the player's side ("Victory: Ye taken", "Defeat: Puyang lost", raid wording), with the reason and the battle day it ended; armies are labelled Your army / Enemy and a formation table shows each leader's casualties dealt and received. A city taken in the last five days pulses its ownership ring. A finished campaign shows an end screen (united realm, Hegemon, fallen house or a rival Hegemon) with length, cities, officers, **New campaign** and **View the map**. Dialogs fade in and toasts slide in; all motion stops under reduced motion.                                                                                                                         |

Deviations: PF-CA-02 and PF-CA-04 each needed one compatible optional save field, where the plan expected none. Toasts still show one message at a time (the newest replaces the last), and campaign map markers do not tween; both were left as they are. The Chinese diplomacy article, previously in Traditional characters, is now Simplified like the rest of the interface, and a new **Rival houses** Wiki article covers temperament, raids, prisoners and conquest unrest.

Validation: TypeScript, the UI lint and changed-file formatting pass. All 1,067 unit and integration tests pass, 28 of them in the new Phase 3 file. As in Phase 2, the git-fingerprint test (it needs GitHub Desktop's git on PATH here) and the 50 ms tactical performance gates (which fail on this laptop at any commit; Phase 3 changes no battle code) were run separately. Existing assertions in 15 unit test files were updated to the new numbers: trade sizes, relief population, cavalry prices, the treaty-break penalty, training without +1 force and banked work. One forecast test now accounts for the random monthly festival instead of relying on the RNG stream. The full browser suite ran all 211 cases. 203 passed; the other 8 failed on intended changes: the end screen over a finished campaign, relief population, Wiki wording and banked governor work. With those 7 specs updated, all 8 pass.

Not covered by automated checks: how the outcome wording, end screen and capture pulse feel in play, and how human players respond to rival temperament. The pending v0.4 player sessions now play these rules, so the four questions in section 6 should be asked alongside them.

### 7.5 First play-session feedback

On October 30, 2026 the owner played `v0.4` with Phases 0–3 and reported three problems. Each is fixed on `v0.4`; regression tests are in `tests/v03/playtest-feedback.test.ts` and the governor suites.

| Feedback                                                                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A governor appointment should wait only for travel, not for the month boundary | Appointing an officer already in the city, dismissing a governor and personal rule where the ruler stands take effect at once. A candidate from another city takes office the day the party arrives. The change is reported as a notice, not a report that must be acknowledged. The month-boundary sweep remains for pending appointments in older saves and for transfers that fail on the road, but no longer issues "delayed" reports.                                                                                                                                                                                                                                                                                               |
| Reports that need no action should not interrupt a battle                      | While the player commands a battle, only battle reports (a new or handed-back battle, a result) stop **End battle day**. Other critical reports stay unread in the inbox, whose button turns red, and a toast counts the new ones. Once no battle is commanded, every critical report blocks the campaign clock as before.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Battle order and feel (attack, movement, range, selection) were strange        | The owner chose each option. Nothing is selected for the player: not at the start of a battle, and not after a formation acts (Tab still cycles ready formations). Clicking an enemy only shows its details; attacks come from the formation's orders (**Attack**, or A), which show the red attack range and per-target forecasts. A move stays provisional, as a UI preview, until the formation acts, so Esc, right-click or **Undo move** returns it. Esc and right-click step back one layer at a time, and clicking open ground deselects. Clicking the selected formation again opens its orders where it stands. The orders menu opens beside the formation, on the side with more room, so it does not cover an adjacent enemy. |

Deviation from the option as offered: the option said a second click on the selected formation would deselect it. That click instead opens the formation's orders where it stands, since attacks no longer start from clicking an enemy. Deselecting is by Esc, right-click or clicking open ground. A provisional move is committed when another formation is selected, the day ends or any battle order is given; the engine and save format are unchanged.

## 8. Not in this plan

Siege, new tactics, units, resources, treaty types or scenarios; a fog-of-war system beyond D1's narrow reveal; population growth as a new rule (relief is retuned instead); randomness in ordinary attacks; audio, which would need new assets; a non-modal city window that picks destinations on the map (L, reconsider after PF-CT-03); and multiple save slots.
