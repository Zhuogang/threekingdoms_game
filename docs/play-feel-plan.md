# Play-feel plan: a more enjoyable game from the systems it already has

**Project:** Hegemony of the Three Kingdoms / 三国霸业

**Review date:** October 29, 2026, against `v0.4` at `a5b028e`. Line references point to that commit.

**Status:** Proposal. Nothing in this plan is implemented. It does not replace the [v0.4 plan](implementation.md) or its pending player/hardware gates; section 7 explains how the two fit together.

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

## 8. Not in this plan

Siege, new tactics, units, resources, treaty types or scenarios; a fog-of-war system beyond D1's narrow reveal; population growth as a new rule (relief is retuned instead); randomness in ordinary attacks; audio, which would need new assets; a non-modal city window that picks destinations on the map (L, reconsider after PF-CT-03); and multiple save slots.
