# v0.5 plan: the battlefield, officers who matter, and one place to tune

**Project:** Hegemony of the Three Kingdoms / 三国霸业

**Branch:** `v0.5`, from `v0.4` at `b543ee7`. Written November 4, 2026. Line references point to that commit.

**Status:** Plan. Supersedes the open questions in the [v0.5 brainstorm](brainstorm.md), whose decisions the owner made on November 4: keep the 24 cities and 6 houses, add leadership and politics to officers, keep day-by-day battle turns with persistent orders, siege later, no save compatibility, no new cities or named troop corps. The siege branch (`siege_v0.2`) continues on its own and is not merged here.

## 1. Direction

**Make a field battle a thirty-minute story the player watches and steers, fought by officers whose stats decide things, on a map and economy tuned from one table.** The current setup (24 cities, 6 houses, 98 officers, 3 arms, 6 tactics, 15 fields) stays. Two cities and ten officers must be enjoyable before more content is.

What the player should notice after v0.5:

1. A battle day is a few decisions and a resolution they watch, not forty clicks.
2. Where a formation stands and which way it faces decides the exchange.
3. The enemy commander does things: ambushes, feints, night raids, challenges. Signs of them can be read a day early.
4. Officers duel, shout, break, flee and get caught. Each battle leaves a story in the chronicle.
5. Guan Yu with 3,000 men is not the same as three militia captains with 1,000 each, because leadership exists.
6. Governing Chengdu with a politician is visibly different from governing it with a brawler.
7. Changing a number means editing `balance/` and re-running a probe that plots a curve.

### In scope

- Field battle v2: orders, facing, charge and brace, baggage train, army morale, commander cards with signs, duels, deployment arrangements, pursuit, battle tiers, playback, officer lines, highlights.
- Officer stats: leadership (统率) and politics (政治) for all 98 officers, used in battle and governance; leadership is a soft troop cap.
- Historical units of measure for money, grain, people, distance and dates.
- Unit table for the three arms, with sharper roles.
- `balance/` module holding every tuned number; probes that read it and plot curves.
- Land: per-city development caps and natural population growth; politics in governor work.
- City data as a table (the same 24 cities) instead of the modulo formulas.
- Evidence: an extended pacing harness, a wall-clock battle probe, rule fixtures, the AI performance gate.

### Out of scope

New cities, houses, scenarios, named corps or arms; sieges (the city still changes hands when the field battle is lost, as today); 2.5D field maps; audio; diplomacy, prisoner and succession changes; save migration. v0.5 saves get a new version and older saves are rejected, as the existing validator already does for old versions.

## 2. Field battle v2 (野战)

### 2.1 The day

Today a day is: for each of up to 10 formations, select, move, Attack, pick a target; then the enemy's day replays. In v0.5 a day is:

1. **Morning report (晨报).** Weather today and tomorrow, army morale of both sides, timeout standing, the enemy card played yesterday (now revealed), any **signs** of the enemy card for today, and formations whose order can no longer be carried out.
2. **Orders.** Each formation carries a standing order from the previous day. The player changes a few, or takes a formation under direct command for this day (the existing manual flow, unchanged). The commander picks one **card** or none.
3. **Commit day.** The player's formations execute their orders, then the enemy's; the whole day plays back as one sequence with the camera following the action. Skip and 2× are available.
4. **Evening.** Rollover as today (morale recovery, hunger, weather), plus army morale and the rout check. If a side breaks, the **pursuit** phase runs before the outcome.

Targets: at most 8 clicks on a day when nothing changes, about 90 seconds of orders and 45 seconds of playback, 8–10 days for an ordinary battle (section 7 has the numbers).

### 2.2 Standing orders (阵令)

An order is a per-formation policy that the existing evaluator (`battle/engine.ts:1449` `evaluateBattleTurn`) executes with a filter on legal candidates and a weight preset. Nothing in the damage rules changes because of an order; orders only decide what the formation tries to do. The enemy AI picks orders with the same machinery, so both sides look coherent.

| Order       | Who     | Behaviour                                                                                         | Target            |
| ----------- | ------- | ------------------------------------------------------------------------------------------------- | ----------------- |
| 进 Advance  | any     | Move toward the target; attack when the forecast exchange is favourable or the target is adjacent | formation or cell |
| 守 Hold     | any     | Do not move; attack adjacent enemies; infantry **braces** (section 2.4)                           | none              |
| 游 Skirmish | archers | Keep distance 2–3 from the nearest enemy; volley the best target; fall back when approached       | optional          |
| 冲 Charge   | cavalry | Take the straightest route to the target and attack this day whatever the forecast                | formation         |
| 护 Screen   | any     | Stay adjacent to a friendly formation (the baggage by default) and attack whatever threatens it   | friendly          |
| 退 Withdraw | any     | Move toward the own map edge, avoiding zones of control; never attack                             | none              |
| 追 Pursue   | cavalry | Attack routed enemies in range; otherwise behave as Advance                                       | none              |
| 自 Free     | any     | The unconstrained evaluator, as auto-command today                                                | none              |

Rules:

- A new formation starts with the order from its deployment arrangement (section 2.8).
- An order persists until changed. The morning report lists orders that have become impossible (target destroyed, no route).
- Direct command for a day (select, move, act, as today) overrides the order for that day only. Manual control is kept whole; it is simply no longer the default.
- "Let officers command" becomes "all formations Free".

### 2.3 Facing (向)

Each formation faces one of four directions, set by its last move or attack, and shown by the sprite. A hit from a flank multiplies damage by 1.25 and from the rear by 1.5; the victim's counterattack is 0.5 from a flank and none from the rear. Turning is free when a formation acts; a holding formation keeps its facing. Archers volleying from range do not use facing on the attacker's side, only on the target's. The AI's exposure term (`battle/engine.ts:1081-1098`) adds the facing multiplier.

### 2.4 Charge and brace (冲与拒)

- **Charge:** cavalry that moves at least 3 cells with its last 3 steps in one direction and then attacks gets ×1.3. Cavalry that starts in contact has no charge. Forest and hill break the run.
- **Brace:** infantry under Hold that is charged from its front negates the charge bonus and counterattacks at ×1.2. From the flank or rear the brace does nothing. This gives Hold a reason and the player a visible counter to cavalry.
- Archers attacked in melee defend at ×0.7.

The three arms thus have a rock–paper–scissors that depends on positioning, not only on the matchup table.

### 2.5 Baggage train (辎重)

The attacker brings a baggage formation: porters equal to 5% of the army, force 30, move 2, no attack, carrying the field food. It is placed in the rear of the deployment band. If it is destroyed, routed or captured (an enemy formation attacks it when no friendly formation is adjacent), the attacker loses its remaining field food and 25 army morale. The defender of a city has no baggage; its supply is the city. The asymmetry is deliberate: the attacker must win within the day limit and guard a weak point, the defender must hold and can sortie for it.

### 2.6 Army morale (军心)

A per-side value 0–100 beside unit morale. Start: 50 + commander leadership ÷ 2. Changes: friendly formation routed −8, destroyed −12, enemy formation routed +5, baggage lost −25, duel won +10 / lost −10, commander's formation routed −20, attacker −2 per day after day 20. At 30 every formation loses 15 morale once. At 10, or when 60% of living formations are routed, or when the existing all-routed rule fires, the side breaks. Battles then end at the dramatic moment, not the last survivor.

### 2.7 Commander cards and signs (军令与征候)

The commander is the formation leader with the highest leadership. One card per day, paid from the existing side tactic pool (`battle/engine.ts:48-58`, cap 30, +2 a day). The six unit tactics stay as they are.

| Card            | Cost | Needs                                         | Effect                                                                                                                                                   |
| --------------- | ---- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 鼓舞 Rally all  | 6    | —                                             | Every formation +10 morale                                                                                                                               |
| 死守 Stand firm | 3    | —                                             | Holding formations take ×0.85 this day and ignore morale loss from any single hit under 20                                                               |
| 伏兵 Ambush     | 5    | a formation in forest, not yet engaged        | That formation is hidden until it attacks or an enemy moves adjacent; its first attack ×1.5                                                              |
| 诱敌 Feint      | 4    | a formation with morale ≥ 40                  | It withdraws 3 cells; any enemy that moves adjacent to it and to another friendly formation is hit once by each                                          |
| 火攻 Fire       | 8    | wind or dry weather, commander intellect ≥ 70 | A 3-cell fire line downwind of a chosen archer formation; spreads one cell a day while the wind holds                                                    |
| 夜袭 Night raid | 7    | a cavalry formation                           | That night it attacks a target within 6 cells at ×1.2 against anything not holding; against a holding target with Vigilance it takes ×1.5 and −10 morale |
| 戒备 Vigilance  | 2    | —                                             | Counters Night raid; reveals ambushes within 3 cells of any formation                                                                                    |
| 单挑 Challenge  | 2    | an enemy leader within 4 cells                | Offers a duel (section 2.8); refusing costs the refuser's formation 5 morale                                                                             |

**Signs.** At the start of each day the player's commander rolls to read the enemy's card for the day: chance = clamp(40 + (own intellect − enemy intellect), 20, 80). On success the report shows a sign ("Dust in the north woods", "Torches lit along the enemy line") that names the card type, not its target. Yesterday's card is always revealed. The enemy commander reads the player's card the same way; the AI's planner uses the revealed card as a constraint. This is the move-and-counter layer the siege plan found to be the fun part, without dice on ordinary hits.

The AI chooses cards by trait and situation: fierce leaders favour Challenge and Night raid, cunning ones Ambush, Feint and Fire, and everyone buys Vigilance after taking a night raid.

### 2.8 Duels (单挑)

A duel is offered by the Challenge card, or when a fierce leader's formation declares a normal attack on an officer-led formation (not militia). The target accepts by trait and force: fierce accepts; cunning accepts only with ≥ 10 force advantage; others accept at even force or better. Resolution uses the battle's seeded RNG: up to 5 rounds, each a hit chance from the force difference and traits, three hits to win. Win: the loser's formation −20 morale, the winner's +10, army morale ±10; the loser is wounded (his formation fights at militia stats for the rest of the battle) and is captured if his formation is later routed. Draw after 5 rounds: both +5 morale. The duel plays as a short portrait exchange with officer lines. Duels are the game's missing signature moment and cost only content and a small rules module.

### 2.9 Deployment (布阵)

Before day 1 the player chooses one of four arrangements, which set positions inside the existing deployment band (`battle/battlefields/layout.ts:45`) and the initial orders. Arrangements have no hidden bonuses; their value comes from the rules above.

| Arrangement | Layout                                                | Initial orders                                 |
| ----------- | ----------------------------------------------------- | ---------------------------------------------- |
| 鱼鳞 Scale  | infantry centre forward, archers behind, cavalry rear | centre Advance, archers Skirmish, cavalry Free |
| 鹤翼 Crane  | infantry centre, cavalry on both wings                | centre Hold, wings Charge the nearest          |
| 方圆 Circle | everything around the baggage                         | all Hold, cavalry Screen the baggage           |
| 长蛇 Column | one deep column, fast front                           | all Advance                                    |

The player may then drag formations within the band. The AI picks an arrangement from its commander's temperament and the map.

### 2.10 Pursuit (追击)

When a side breaks, one pursuit step runs before the outcome. The winner's cavalry formations with morale ≥ 40 choose Pursue or Hold: each pursuing formation adds 10% to the losers' wounded share and +5% to every capture roll in `campaign/battle-aftermath.ts:92-97` (cap +30%). The loser may name one formation with morale ≥ 40 as a rear guard, which halves those effects and takes one free hit from each pursuer. The AI decides by temperament.

### 2.11 Battle tiers

Not every battle deserves thirty minutes. The tier is set by the larger side's formation count and whether a ruler is present:

| Tier          | Condition                                    | Days | Default                                                 |
| ------------- | -------------------------------------------- | ---- | ------------------------------------------------------- |
| 遭遇 Skirmish | ≤ 3 formations on the larger side, or a raid | 14   | Orders and cards available; expected 10 minutes         |
| 会战 Battle   | otherwise                                    | 30   | The full loop; expected 25–35 minutes                   |
| 决战 Decisive | both rulers present, or ≥ 8 formations each  | 30   | As Battle; the outcome screen writes a longer chronicle |

Any battle can still be handed to the officers (all Free) or resolved instantly from the campaign with the same engine. The campaign's **Resolve quickly** option shows the highlights afterward.

### 2.12 Playback and spectacle

- The day's resolution plays back from the log, extending `ui/hooks/useBattlePlayback.ts` (which already replays the enemy day) to both sides, with the camera following the acting formation, 1× / 2× / Skip, and reduced motion respected.
- Sprites gain facing. The siege branch's 3-facing × 3-pose sheets exist for infantry and archers; cavalry needs one sheet. Formation size on the map scales with troops.
- Arrows arc on volleys, dust on charges, fire tiles burn and spread, casualty numbers float, routed formations stream toward their edge.
- **Officer lines (台词):** one line per officer, or per trait as fallback, for charge, rout, duel start, duel win, duel loss, capture and victory, in both languages. This is the humour and character layer.
- **Highlights:** the outcome screen shows the three biggest events (largest casualty swing, rout, duel, baggage), written from the player's side, and writes them to the campaign chronicle.

## 3. Officers: leadership and politics

Add `leadership` (统率) and `politics` (政治), 1–100, to the catalog and the officer type (`src/v03/types.ts:142-170`). Values are content assigned from historical reputation with a provenance note per officer, in the same style as the roster data; the owner reviews the table before it is used.

Effects, all read from `balance/`:

| Stat       | In battle                                                                                                                                                                                                   | In the city                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Leadership | Soft capacity = leadership × 100 (section 3.1); starting morale 60 + L ÷ 5; ordinary-hit quality term uses 0.6·L + 0.4·F in place of F (`battle/engine.ts:391-426`); commander selection; army morale start | Governor plan quality (which step of `planGovernorMonthlyWork` is reached first)                            |
| Force      | Duels, counterattacks, charge                                                                                                                                                                               | Training yield                                                                                              |
| Intellect  | Tactics and cards, signs, as today                                                                                                                                                                          | Search, security as today                                                                                   |
| Politics   | —                                                                                                                                                                                                           | Development yield × (0.7 + P ÷ 200); security + P ÷ 20 replaces intellect ÷ 20; relief and trade efficiency |

### 3.1 Capacity is a soft cap

Any officer can still be assigned up to 10,000 troops. Troops above leadership × 100 are **unmanaged** (the owner's choice, November 4). A 30-leadership captain with 10,000 men really controls 3,000; the other 7,000:

- desert at 5% of the excess per month in a city and 10% per month on the march (balance numbers), reported as "N men slipped away from X's camp";
- fight badly: the formation's incoming damage is multiplied by (1 + 0.5 × excess share), so a formation that is 70% unmanaged takes ×1.35, and its starting morale is reduced by 20 × excess share;
- are the first to be counted as casualties.

The troop-count screen shows "controls N of M" and the city page recommends splitting. The AI's reserve organizer respects the soft cap when it has enough officers. Rookie officers thus carry men badly rather than being forbidden to carry them, and a great general with a large army is visibly different.

Level-ups give +1 leadership alongside the existing +2 force. The officer directory, the city page's "recommended executor" and the wiki show the two new stats.

## 4. Units of measure (量制) and the three arms

### 4.1 Historical units of measure

The owner's "units are not correct" meant the units that gold, food and the rest are counted in. Today the game shows bare numbers labelled gold (金钱) and food (粮食), and routes in kilometres. v0.5 names them as a Han official would, in both languages, without changing the stored quantities:

| Quantity    | Stored as        | Shown as (zh)                                 | Shown as (en)                   | Note                                                                                             |
| ----------- | ---------------- | --------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Money       | gold             | 钱, 1,000 钱 = 1 贯; large sums in 万钱       | cash; strings of 1,000; 10,000s | Han coinage was copper 五铢 cash; "gold" (金) was weighed in 斤 and is not a daily unit          |
| Grain       | food             | 石 (dan)                                      | shi of grain                    | One 石 of unhusked grain is roughly a soldier's month; the existing food numbers read well as 石 |
| Troops      | troops           | 人 / 兵                                       | men                             | unchanged                                                                                        |
| Population  | population       | 口, with 户 = 口 ÷ 5 beside it                | people, households              | The census counted both                                                                          |
| Distance    | km               | 里 (Han 里 ≈ 415 m)                           | li                              | Route kilometres convert for display; the ETA rule is unchanged                                  |
| Time        | days             | 日 / 月 / 年, with reign-era years (初平元年) | days, months, 190 AD            | Reign eras are content: 中平, 初平, 兴平, 建安, 黄初                                             |
| Development | farming/commerce | 田亩 / 市集 levels                            | farmland, markets               | labels only                                                                                      |

One formatter module (`i18n/units.ts`) owns these; every screen, report, forecast and the wiki call it. Whether to also **rescale** gold so that sums read like Han figures (a Han soldier's monthly pay was a few hundred 钱, a city's revenue tens of thousands) is a tuning decision taken in L-04 after the formatter exists, because rescaling touches every cost in `balance/`.

### 4.2 The three arms, done right

A unit table `content/units.ts` holds everything about infantry, cavalry and archers that today sits in `battle/rules.ts:20-80`, `battle/engine.ts:127-161, 391-426` and `campaign/recruitment.ts:9-47`: move, terrain costs, range, matchup row, melee defence, charge and brace, food and gold rates, recruit cost and multiplier by region. No new arms. The roles sharpen through the rules in section 2.4 and these starting values:

| Arm      | Move | Range | Charge | Brace                   | Melee defence | Note                                          |
| -------- | ---- | ----- | ------ | ----------------------- | ------------- | --------------------------------------------- |
| Infantry | 3    | 1     | —      | ×1.2 counter under Hold | 1.0           | The line; holds ground and forests            |
| Cavalry  | 5    | 1     | ×1.3   | —                       | 1.0           | Shock and pursuit; forest and hill break runs |
| Archers  | 3    | 3     | —      | —                       | 0.7           | Volleys; must be screened                     |

The existing matchup table (cavalry vs archers 1.3, infantry vs cavalry 1.2, archers vs infantry 1.15) stays and moves into the table. Elite presentation at troop level 11 stays.

## 5. Land: one table, growth and ceilings

### 5.1 `balance/`

`src/v03/balance/` with one file per domain (`economy.ts`, `recruitment.ts`, `battle.ts`, `cards.ts`, `morale.ts`, `ai.ts`, `limits.ts`), each a frozen object with a comment per number. Rules code imports from here only. The wiki, forecasts, previews and every probe read the same objects. The siege plan made the same decision (`tuning.ts`, DV13), so a later merge has one convention.

### 5.2 City data

`content/cities.ts` replaces the modulo formulas in `content/scenario.ts:237-258` with one record per existing city: population, farming, commerce, their caps, loyalty, and a tier (S/A/B/C/D) from the Han census scale described in the brainstorm. No city is added, moved or renamed. Chengdu, Wancheng, Luoyang and Xuchang become large; Tianshui, Beiping and Hanzhong small. The scenario files keep ownership and placements.

### 5.3 Growth and ceilings

- Farming and commerce caps come from the city record (S 800, A 650, B 500, C 400, D 300 as starting points) instead of the flat 500 (`governance/city-actions.ts:207-252`).
- Natural population growth at month end: +0.3% at loyalty ≥ 70 with food in stock, +0.1% at 50–69, 0 below 50, −0.5% in a food shortfall. Relief stays as the fast fix.
- Politics applies to development, security, relief and trade (section 3).
- Governors (`governance/autonomy.ts:124`) use the caps and the growth forecast when choosing between development and recruitment.

### 5.4 Curves

The economy probe (`tools/v04-campaign-probes.mjs`) and campaign diagnostics gain a `--curves` output: per month, per house, gold, food, population, fieldable troops and cities, written to `.artifacts/` as JSON and a text table. Proposed targets, to be argued about and then fixed in the ticket:

| Curve                                 | Target                                               |
| ------------------------------------- | ---------------------------------------------------- |
| 3-city house gold and food, 10 years  | Positive from year 1, about ×2 by year 4, no runaway |
| 3-city house fieldable troops         | 8k in year 1, 20k by year 3                          |
| Chengdu untouched for 10 years        | Population +40%                                      |
| A city drafted every month            | Population collapses by year 3                       |
| Leading house cities at month 48 / 96 | 10 / 16, with occasional unifications                |

## 6. Tickets

Effort: S ≤ 2 days, M about a week, L 2–4 weeks. Every rule ticket ships with fixtures (behaviour, not coefficient snapshots), English and Chinese strings, and wiki and player-guide text. Owner approval is needed where marked.

### F — Foundations

| ID   | Ticket                                                                                                                                                                                                             | Effort | Acceptance                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| F-01 | `balance/` module; move every tuned constant from economy, recruitment, city actions, battle rules, engine, AI weights and limits into it. No behaviour change.                                                    | M      | Full test suite green with no fixture edits; a grep finds no magic numbers left in the listed modules |
| F-02 | Unit table `content/units.ts` (section 4); rules, recruitment and presentation read it.                                                                                                                            | S      | As F-01; pacing harness output identical                                                              |
| F-03 | City data table `content/cities.ts` (section 5.2); scenario builds cities from it.                                                                                                                                 | S      | Owner reviews the 24 records; the 12-month economy probe runs                                         |
| F-04 | Save version bump to 4; reject older saves with the existing message. Add the v0.5 fields as they land.                                                                                                            | S      | Storage tests updated                                                                                 |
| F-05 | Harness: `tools/battle-pacing.mjs` runs 8v8 with orders and cards, reports days, first contact, outcome reasons, rout share, baggage captures, duels, card usage, Rally share, and distinct outcomes across seeds. | M      | Baseline recorded on `v0.5` before any rule change                                                    |
| F-06 | Wall-clock probe: a Playwright scripted player plays one Battle-tier fight with orders at 1× playback and reports minutes, clicks per day and days.                                                                | M      | Baseline recorded against the v0.4 flow for comparison                                                |

### O — Officers

| ID   | Ticket                                                                                                                                                                                             | Effort | Acceptance                                                                                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-01 | Leadership and politics for 98 officers, with a provenance column; type and catalog changes; directory, city page and wiki show them.                                                              | M      | **Owner approves the table.** Catalog validator passes                                                                                                                                                                     |
| O-02 | Leadership in battle and in camp: soft capacity with desertion and the unmanaged damage multiplier, starting morale, hit quality term, commander selection; "controls N of M" in the troop screen. | M      | Fixtures: a 90-leadership officer with 3,000 men beats three 40-leadership officers with 1,000 each in a mirrored field; a 30-leadership officer with 10,000 loses men monthly and takes ×1.35; forecast equals resolution |
| O-03 | Politics in the city: development, security, relief, trade; governor planner reads it; "recommended executor" prefers politics for civil tasks.                                                    | S      | Fixtures per action; 12-month probe shows the spread between a 90 and a 40 politics governor                                                                                                                               |

### B — Battle rules (one paired experiment each, in this order)

| ID   | Ticket                                                                                                                                                                      | Effort | Acceptance                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | Standing orders: state, executor as a filter and weight preset over `evaluateBattleTurn`, AI order selection, impossible-order detection. Free equals today's auto-command. | L      | Fixtures per order; with all Free, pacing output matches the F-05 baseline within noise; a scripted day with unchanged orders needs ≤ 8 clicks |
| B-02 | Facing: state, update rules, flank and rear multipliers, counterattack reduction, AI exposure term.                                                                         | M      | Fixtures: same hit from front/flank/rear; AI prefers a flank when free; p95 gate                                                               |
| B-03 | Charge and brace; archer melee defence.                                                                                                                                     | S      | Fixtures: straight run vs broken run; Hold infantry vs charge from front and flank                                                             |
| B-04 | Baggage train: roster, placement, capture rule, food and army morale consequences; Screen order defaults to it.                                                             | M      | Fixtures: capture by an unscreened attack; no capture when screened; AI defender sorties for an exposed baggage in a matched run               |
| B-05 | Army morale and the break rule; the pursuit step and its aftermath effects.                                                                                                 | M      | Fixtures per delta; pacing: rout or break ends ≥ 60% of battles, timeouts ≤ 5% at 30 days                                                      |
| B-06 | Commander cards (eight), costs, legality, signs roll, AI card policy by trait; yesterday's card revealed.                                                                   | L      | Fixtures per card; card usage spread across the pool; Rally-all plus unit Rally under 40% of all casts                                         |
| B-07 | Duels: offer rules, acceptance by trait, seeded resolution, consequences, AI challenge policy.                                                                              | M      | Fixtures: deterministic replay from `rngState`; acceptance matrix; a duel loss followed by a rout captures the loser                           |
| B-08 | Deployment arrangements and drag placement within the band; AI arrangement choice.                                                                                          | M      | Fixtures: every arrangement fits every one of the 15 fields, including the wetland override; no layout throws                                  |
| B-09 | Battle tiers; Resolve quickly from the campaign using the engine; highlights afterward.                                                                                     | S      | Raids and ≤ 3-formation fights are Skirmish; a Decisive fight writes a longer chronicle                                                        |

### P — Presentation

| ID   | Ticket                                                                                                                                                                          | Effort | Acceptance                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Morning report panel; orders UI (order chips and target pick on the map); card picker; Commit day; direct command for a day kept.                                               | L      | F-06 probe: Battle tier 25–35 minutes, ≤ 8 clicks on an unchanged day; Chinese flows have no raw English                         |
| P-02 | Playback v2: both sides, camera follow, speeds, facing sprites (cavalry sheet added), scaled formation size, arrows, dust, fire, floats, rout streaming, reduced motion.        | L      | 60 fps at 1440×900 on the owner's laptop for an 8v8 day; reduced motion shows the summary only                                   |
| P-03 | Duel scene: portraits, rounds, lines, result.                                                                                                                                   | M      | Plays under 15 seconds; skippable                                                                                                |
| P-04 | Officer lines: content table for 98 officers plus trait fallbacks, both languages, seven moments.                                                                               | M      | **Owner reviews the lines.** Raw-English detection passes                                                                        |
| P-05 | Highlights on the outcome screen and in the chronicle; the campaign's battle buttons name the tier and the city.                                                                | S      | Fixture: a scripted battle yields the expected three highlights                                                                  |
| P-06 | Historical units of measure (section 4.1): `i18n/units.ts` formatter for 钱/贯/万钱, 石, 人, 口/户, 里 and reign-era dates; every screen, report, forecast and the wiki use it. | M      | **Owner reviews the unit names.** No bare "gold"/"food" labels remain; the raw-English check passes; stored quantities unchanged |

### L — Land

| ID   | Ticket                                                                                          | Effort | Acceptance                                                |
| ---- | ----------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------- |
| L-01 | Per-city caps from the city record; governor planner and previews use them.                     | S      | Fixtures; development preview shows the city's cap        |
| L-02 | Natural population growth and famine decline at month end.                                      | S      | Fixtures per loyalty band; curves probe                   |
| L-03 | `--curves` output for the economy probe and campaign diagnostics; targets fixed with the owner. | M      | Curves recorded on `v0.5` before and after L-01/L-02/O-03 |
| L-04 | Tuning pass against the curves, numbers in `balance/` only.                                     | M      | Every target in section 5.4 met or the miss explained     |

## 7. Evaluation protocol

Carried over from v0.4: decisions before averages, paired experiments with one rule change each, matched seeds, behaviour fixtures, trace parity, the 10v10 battle-day p95 < 50 ms gate after every battle AI change, and both languages for every string.

Proposed targets (fixed when F-05 and F-06 record their baselines):

| Measure                                        | v0.4 record               | v0.5 target                          | Tool          |
| ---------------------------------------------- | ------------------------- | ------------------------------------ | ------------- |
| Median battle length (30-day tier, AI vs AI)   | 11 days                   | 8–10 days                            | F-05          |
| Battles ending by rout or break                | about 55% (rout only)     | ≥ 60%                                | F-05          |
| Timeouts at 30 days                            | 3.3%                      | ≤ 5%, with baggage and break in play | F-05          |
| Equal-army raids ending on the timeout         | 16.3%                     | ≤ 15%                                | F-05          |
| Rally (unit + card) share of casts             | 58%                       | < 40%; every card used where legal   | F-05          |
| Distinct outcomes over 200 seeds, one field    | not measured              | ≥ 150                                | F-05          |
| Attacker win rate, equal armies                | not recorded per side     | 40–55%                               | F-05          |
| Wall-clock, Battle tier, scripted player at 1× | not measured              | 25–35 minutes                        | F-06          |
| Clicks on a day with unchanged orders          | about 40 (10 formations)  | ≤ 8                                  | F-06          |
| 10v10 battle-day AI p95                        | 47 ms ARM / 104 ms laptop | < 50 ms ARM; laptop recorded         | existing gate |
| Economy curves                                 | not plotted               | section 5.4                          | L-03          |

Owner sessions (four, as in the v0.4 packet) add these debrief questions: Which order did you change most? Did you read a sign and act on it? Which duel do you remember? Did a battle feel too long, and at which day?

## 8. Work order

| Phase | Tickets                                                      | Notes                                                                                                      |
| ----- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 0     | F-01 … F-06                                                  | No gameplay change. Baselines recorded. Everything after this is measurable.                               |
| 1     | O-01 … O-03                                                  | Owner approves the stat table first. Can run alongside Phase 2 (different modules).                        |
| 2     | B-01 … B-05                                                  | The battle core: orders, facing, charge, baggage, break and pursuit. One paired experiment each, in order. |
| 3     | B-06 … B-09, P-01                                            | The command layer and the new day flow. P-01 lands with B-06 so cards have a UI.                           |
| 4     | P-02 … P-06                                                  | Spectacle. Can start its art (cavalry sheet, effects) during Phase 2.                                      |
| 5     | L-01 … L-04                                                  | Land tuning. Independent of battles; a second editor can take it after Phase 0.                            |
| 6     | Owner sessions, curves re-run, wiki and guide, release notes | Sign-off.                                                                                                  |

The one-editor-at-a-time rule stays for `engine.ts`, `battle/engine.ts`, `types.ts`, `commands.ts` and `platform/storage.ts`. Phases 1 and 5 touch governance and content, not the battle engine, so they can proceed in parallel with Phases 2–3.

Stopping after Phase 3 still leaves a coherent game: shorter, steerable, readable battles with officers that matter. Phase 4 is what makes them beautiful.

## 9. Owner answers (November 4, 2026)

1. **"The units are not correct"** meant units of measure: gold, food and the rest should carry historical names such as 石 and 钱. Section 4.1 and ticket P-06 cover it.
2. **Dice.** Ordinary hits stay exact; chance lives only in duels, cards and signs.
3. **Capacity by leadership** is a soft cap: anyone can take 10,000, but troops above leadership × 100 desert gradually and the formation suffers much higher losses. Section 3.1 and O-02.
4. **Baggage** belongs to the attacker only.

## Source index

- Battle engine: `src/v03/battle/engine.ts` (units `:127-161`, damage `:391-426`, tactics `:50-58, 569-608`, forecasts `:491-730`, evaluator `:1449-1714`, AI turn `:1784-1945`, timeout `:1969-1993`, day `:2018`); rules `src/v03/battle/rules.ts`; types `src/v03/battle/types.ts`; deployment `src/v03/battle/battlefields/layout.ts:45`.
- Rosters: `src/v03/campaign/roster.ts` (one officer leads each formation, up to 10 a side); aftermath and captures `src/v03/campaign/battle-aftermath.ts:92-97, 257-282`; conquest `src/v03/engine.ts:408-690`.
- Battle UI: `src/v03/ui/screens/BattleScreen.tsx`, panels `src/v03/ui/panels/Battle*.tsx`, playback `src/v03/ui/hooks/useBattlePlayback.ts`, renderer `src/v03/rendering/BattlefieldMapView.tsx`.
- Officers: `src/v03/content/officer-catalog.ts`, `src/v03/types.ts:142-170`, traits `src/v03/content/traits.ts`.
- Economy and governance: `src/v03/campaign/economy.ts:34-96`, `src/v03/governance/city-actions.ts`, `src/v03/governance/autonomy.ts:124`, `src/v03/campaign/recruitment.ts:9-47`, city seeds `src/v03/content/scenario.ts:237-258`.
- Evidence tools: `tools/battle-pacing.mjs`, `tools/v04-campaign-probes.mjs`, `docs/evidence/play-feel-phase2-pacing.json`.
- Siege design borrowed from: `origin/siege_v0.2:docs/siege/03-chencang-v0.2-plan.md` (one order per day, visible preparations, scoring, `tuning.ts`).
