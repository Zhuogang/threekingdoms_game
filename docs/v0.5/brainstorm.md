# v0.5 brainstorm: a historical realm and battles worth thirty minutes

**Project:** Hegemony of the Three Kingdoms / 三国霸业

**Date:** November 4, 2026. Written against `v0.4` at `b543ee7` (the tip of `v0.4`, which `v0.5` branches from) and `siege_v0.2` at `44cb0b8`.

**Status:** Brainstorm, superseded by the [v0.5 plan](plan.md). The owner decided on November 4, 2026: keep the 24 cities and 6 houses (D1 a, D2 a), add leadership and politics (D3 b), keep day-by-day turns with persistent orders (D5 a), siege later (D8 b), ignore save compatibility (D11 a), and no new cities or named troop corps (D4 a). The plan limits v0.5 to the battlefield, officers, one balance module and land tuning.

---

## 1. Why the game feels stuck

v0.3 built a complete simulation. v0.4 made the rules trustworthy and the AI coherent. The play-feel plan removed busywork and added warnings, moments and rival character. All of that work was on the **machinery**. The thing that was never built is the **world the machinery runs on**, and the owner's three complaints are all symptoms of that:

| Complaint                        | What the code actually does today                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The cities are not historical." | Every city's population, farming, commerce and defense are computed from its **position in an array**: `population = 65000 + (i % 6) × 13500`, `farming = 240 + (i % 5) × 35`, `commerce = 220 + (i % 4) × 45` (`src/v03/content/scenario.ts:237-258`). Chengdu, Ye, Luoyang and Tianshui differ only by where they sit in the list. There is no specialty, wall, river or horse country. |
| "The units are not correct."     | Three troop types exist (`infantry`, `cavalry`, `archer`); their numbers are scattered across `battle/rules.ts`, `battle/engine.ts` and `campaign/recruitment.ts`. There is no unit table. "Elite" is a label swap at troop level 11. No named corps (虎豹骑, 白马义从, 陷阵营, 丹阳兵…), no crossbows, no marines.                                                                       |
| "Heavy tuning of parameters."    | There is **no central balance file**. Every constant is hardcoded next to the code that uses it. Population never grows (only relief, plague, sack and recruitment change it). Tuning today means editing a dozen modules and re-running probes by hand.                                                                                                                                  |
| "The field fight should change." | A battle for a city **is** a field battle at the gate; the city falls the moment the defenders lose (`engine.ts:408-690`). Contact comes on day 2, battles run about 11 days, each day is roughly 4 clicks × up to 10 formations, ordinary hits have no dice, and the only objective is attrition (survivor count at timeout). Fights are readable now, but they are not stories.         |

Meanwhile `siege_v0.2` contains the richest piece of game design in the repository: frontage caps, engines, visible move-and-counter (招与拆), a foothold bar, night orders, one commander order per day, both sides playable, scoring tiers, a sim harness with "distinct outcomes" as a target, and a 2.5D renderer with tweened unit poses. It is finished as a v0.1, planned as a v0.2, hardcoded to Chencang, unmerged, and about 0.9 GB of art.

The way out is not another round of polish on the existing numbers. It is to give the simulation a real world (data), real units (a table), one place to tune (a balance module), and two different kinds of war (field and siege).

## 2. What v0.5 should be

**One sentence:** _Play a real 190 AD map, with real commanderies, real corps and real houses, where a war is a campaign of maneuvers in the field and a city only falls to a siege._

Four pillars:

1. **A historical realm (史实天下).** Cities, houses, ownership, population and specialties come from the historical record, expressed as data files, not formulas.
2. **Real units (兵种).** A unit table with base arms plus a small set of named regional corps, each with one property the player can feel.
3. **One tuning table and a growth loop (调参).** Every balance constant in one module, population growth and per-city development ceilings, and probes that produce curves the owner can read.
4. **Battles as thirty-minute stories (野战).** Deployment, persistent orders, flanks, a baggage objective, a commander card per day, duels, and a resolution the player watches rather than clicks through. City conquest becomes a siege, ported from `siege_v0.2`, either in v0.5 or immediately after (decision D8).

Guardrails carried over from v0.4: deterministic core, command boundary, pure forecasts shared by UI and AI, evidence before averages, English and Chinese for every string. New guardrail: **v0.5 breaks save compatibility** (new save version, no conversion). The content and unit schema change too much to be worth migrating v0.3/v0.4 saves.

## 3. Pillar 1: a historical realm

### 3.1 Cities as data

Replace the `citySeeds` tuples and the modulo formulas with one data file per city (JSON or a typed TS record), roughly:

```
id, nameZh, nameEn, historicalName (per scenario: 秣陵 in 190, 建业 after 212)
commandery, province (州), lat, long   (keep the existing A/B/C anchor grades)
populationTier S/A/B/C/D  →  population, farming cap, commerce cap
terrain: plain | river | mountain | frontier | coast
wall: 1–5 (siege strength; Chang'an, Luoyang, Ye, Chengdu, Xiangyang are 5)
specialties: subset of { grain 粮, horses 马, salt 盐, iron 铁, ships 船, trade 商 }
battlefield profile, routes (unchanged structure)
```

**Population from the census.** The 后汉书·郡国志 (140 AD) counts give a credible relative scale. Use tiers rather than raw numbers so that the data file can be corrected later without re-tuning:

| Tier | Household scale (140 AD) | Candidate commanderies                                                                                                     |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| S    | > 300k households        | Nanyang (Wancheng), Runan, Shu (Chengdu), Ba (Jiangzhou)                                                                   |
| A    | 150k–300k                | Yingchuan (Xuchang), Henan (Luoyang), Chenliu, Changsha, Lingling, Beihai, Pingyuan, Nan (Jiangling), Wu, Danyang (Moling) |
| B    | 80k–150k                 | Wei (Ye), Xiapi, Kuaiji, Lujiang, Jiujiang (Shouchun), Pengcheng, Guanghan (Zitong), Guiyang                               |
| C    | 30k–80k                  | Jingzhao (Chang'an, in decline), Hanzhong, Jiangxia, Taiyuan (Jinyang), Guangyang (Ji), Wuling                             |
| D    | < 30k                    | Hanyang (Tianshui), Youbeiping, Liangzhou seats, Nanzhong                                                                  |

(These placements are from memory and should be checked against the census table during implementation; the point is that the scale is set by history, not by array index.)

**Specialties** give each region one thing the player feels. Keep it to one rule each:

- 粮 grain: higher farming cap and the autumn harvest multiplier.
- 马 horses: cavalry recruits cheaper and faster (replaces the hardcoded north/centre/south lists in `recruitment.ts`).
- 盐/铁 salt and iron: commerce cap and a gold bonus; iron also unlocks fine arms at half price.
- 船 ships: can recruit marines (水军), the only arm that fights at full strength on water.
- 商 trade: food trade at a better rate.

**Walls** matter only once sieges exist (Pillar 4), but the data should be there from the start.

**Coordinates.** Today the scenario has hand-placed x,y and the geography module has lat/long. Keep only lat/long and the projection.

### 3.2 How many cities

24 cities cover the map thinly: nothing south of about 29.5°N, no Ji/Youzhou (the current "Beiping" is 土垠, not 蓟), no Runan, Pengcheng, Lujiang, Kuaiji, Changsha, Liangzhou or Yong'an. Each city costs routes, a battlefield selection, AI target evaluation, and labels. Three options:

| Option            | Count | Adds                                                                                                                                          | Cost                                                         |
| ----------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Fix only          | 24    | Rename Beiping→Ji, Jianye→Moling (190), Xuchang→Xu (190); fix ownership                                                                       | Smallest; still no south, no Xuzhou                          |
| **Fill the gaps** | ~36   | Ji, Nanpi, Shangdang, Wuwei, Runan, Pengcheng, Langya, Lujiang, Kuaiji, Changsha, Wuling/Lingling (one "Jingnan"), Yong'an, Nanzhong (Yunnan) | ~25 new routes, ~12 new battlefield selections, AI re-tuning |
| Full commandery   | 50+   | Every 郡 of consequence                                                                                                                       | Doubles content and AI cost; campaigns get long              |

Recommendation: **~36**. It makes Liu Biao, Yuan Shu, Tao Qian, Gongsun Zan and the Jingnan campaigns possible without turning every war into a slog. (Decision D1.)

### 3.3 Houses and ownership

The 190 scenario gives Sun Jian Jiangdong plus Shouchun, Cao Cao three cities including Xuchang, Yuan Shao Beihai, and Liu Bei Pingyuan. Six houses hold 19 cities and five are "unowned". Historically 190 is a map of **many small houses**: Yuan Shu at Nanyang, Liu Biao at Xiangyang, Han Fu at Ye, Gongsun Zan at Ji/Youbeiping, Tao Qian at Xuzhou, Kong Rong at Beihai, Liu Yan in Shu, Zhang Lu later at Hanzhong, Ma Teng and Han Sui in Liang, Sun Jian under Yuan Shu at Changsha, Cao Cao with almost nothing.

The strategic AI (`strategic-ai.ts`, `ai/faction-objectives.ts`) is already generic over factions. The scenario should therefore model **about 12 houses, 6 playable**, with the minor houses as real AI factions that can be conquered, allied with or absorbed. "Unmodeled houses" (`officer-roster-setups.ts:108-124`) go away. (Decision D2.)

Scenario set for v0.5: **190 群雄割据** and **200 官渡** rebuilt on the new map, plus optionally **208 赤壁** (three big houses, the classic entry point) if the roster can carry it. A **220 三分天下** scenario is tempting but is a late-game sandbox with few decisions; defer.

### 3.4 Officers

Officers are the game's strongest content and have only force and intellect. The wiki even credited a "leadership" stat that did not exist. A historical-sim player expects something like 统率 / 武力 / 智力 / 政治 (leadership, force, intellect, politics). Proposal:

- **Add 统率 leadership**: the troop capacity an officer can command (today a flat 10,000 for everyone), the starting morale of his formation, and the damage formula's "officer quality" term for ordinary hits (force keeps the duel and counterattack role).
- **Add 政治 politics**: development yield per work point, security effect, and the governor's monthly plan quality.
- Keep force and intellect as they are. Do not add charisma yet; loyalty and traits already cover it.

This is a schema change to the 98-officer catalog and to every officer-dependent formula, and it is the single biggest reason v0.5 breaks saves. It is also the change that makes "who governs Chengdu" a real decision. (Decision D3.)

## 4. Pillar 2: real units

### 4.1 A unit table

One file, `content/units.ts`, replaces the constants spread across the battle rules, engine and recruitment:

```
id, nameZh, nameEn, arm (base), move, range, terrain costs,
attack coefficient, defence coefficient, matchup table row,
food rate, gold upkeep, recruit cost and recruit multiplier,
requires: { specialty?: 'horses' | 'ships', city?: id, officer?: id, troopLevel?: n },
property: one named rule (see below)
```

**Base arms (5):**

| Arm            | Role                                                                         | Today                                  |
| -------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| 步兵 infantry  | line; beats cavalry when it holds; takes hills and forests                   | exists                                 |
| 骑兵 cavalry   | shock and pursuit; charge bonus after a straight approach; fragile in forest | exists                                 |
| 弓兵 archers   | range 3 volleys, weak in melee                                               | exists                                 |
| 弩兵 crossbows | range 2, heavy volley, slow, armour-piercing against cavalry (元戎弩 later)  | new                                    |
| 水军 marines   | full strength on water, weak on land; only from 船 cities                    | new, replaces "universal water access" |

**Named corps (about 10)** are templates on top of an arm, each with exactly one property and a recruitment condition, so they are content rather than new systems:

| Corps             | Arm      | Where / who                        | Property                                 |
| ----------------- | -------- | ---------------------------------- | ---------------------------------------- |
| 虎豹骑            | cavalry  | Cao house, Cao Chun/Cao Xiu        | ignores zone of control when charging    |
| 白马义从          | cavalry  | Gongsun Zan, Youzhou               | +1 move, archer-cavalry (range 2 volley) |
| 西凉铁骑          | cavalry  | Liangzhou cities                   | charge damage ×1.3, morale floor 20      |
| 乌桓突骑          | cavalry  | Ji / frontier, after alliance      | pursuit captures more                    |
| 陷阵营            | infantry | Gao Shun                           | never wavers below 40 morale             |
| 丹阳兵            | infantry | Danyang, Tao Qian / Sun            | +20% troops per recruit, cheaper         |
| 青州兵            | infantry | Cao after absorbing Yellow Turbans | huge numbers, low morale start           |
| 无当飞军          | infantry | Nanzhong, Shu after 225            | mountain move cost 1, ambush ×1.6        |
| 解烦兵 / 江东水军 | marines  | Sun house                          | boarding attack from water               |
| 大戟士            | infantry | Yuan Shao                          | defence ×1.2 against cavalry             |

The exact list is content; the rule is "one property, one condition, one row in the table". The siege module will add engines as units of the same table.

### 4.2 Formations and facing

Formations today are tokens on a grid with no orientation. Adding **facing** (one of 4) gives flank (×1.25) and rear (×1.5) hits, makes cavalry maneuver meaningful, and is cheap to render with the siege branch's 3-facing sprite sheets. It also gives the AI something to do other than walk forward.

## 5. Pillar 3: one tuning table and a growth loop

### 5.1 `balance/` module

Everything numeric moves to `src/v03/balance/` (or `src/balance/`): economy, recruitment, upkeep, morale, damage coefficients, tactic costs, AI weights, day limits. The siege plan already decided the same for Chencang (`tuning.ts`, DV13). The gameplay wiki, the forecasts and the probes all read from it. This is a prerequisite for "heavy tuning", not a feature.

### 5.2 Development that feels like building a land

Today: develop farming +20 or commerce +10 per work point, cap 500, same in every city. Population never grows. Proposal:

- **Per-city caps from the tier** (S cities can reach 800 farming; D cities 250). Developing Chengdu is a different project from developing Tianshui.
- **Natural population growth**: +0.3%/month at loyalty ≥ 70 with food in stock, 0 below 50, negative in famine. Relief stays as the fast fix.
- **Tuntian 屯田** as a city policy (Cao Cao's signature, available to all): settle soldiers as farmers, trading reserve troops for farming and population over a year.
- **Garrison vs tax**: a visible per-city tax level (轻徭薄赋 / 常赋 / 重赋) trading gold for loyalty and growth, replacing the hidden `0.8 + loyalty/500` term.
- **Walls** as a development target (needed for sieges).
- **Specialty projects**: a 马 city can build a stud farm; a 船 city a shipyard. One project per specialty, one effect each.

### 5.3 Probes with target curves

The repo already has 12-month economy runs and campaign matrices. For v0.5 the owner should state the curves wanted and the probes should plot them:

| Curve                                        | Example target                                        |
| -------------------------------------------- | ----------------------------------------------------- |
| Gold and food of a 3-city house, 10 years    | Positive from year 1, doubles by year 4, no runaway   |
| Max fieldable army of a 3-city house         | 8k in year 1, 20k by year 3                           |
| Cities per leading house at month 48 / 96    | 10 / 16, with occasional unifications                 |
| Population of Chengdu untouched for 10 years | +40%                                                  |
| Population of a city drafted every month     | Collapses by year 3 (so recruitment is a real choice) |

Tuning is then "change a number in `balance/`, re-run, compare the curve" rather than "edit six modules and hope".

## 6. Pillar 4: battles as thirty-minute stories

### 6.1 Where the time goes today

A battle is about 11 days. Each day the player selects, moves, chooses Attack and picks a target for each of up to 10 formations, then the AI's day replays at 650 ms per formation. Wall-clock time is not measured anywhere. The experience is many small, identical decisions with an attrition count as the only goal. The deterministic damage formula means the right move is usually visible; variety comes from the AI and the map only.

### 6.2 Budget for a 30-minute battle

| Phase                     | Minutes | Content                                                                                          |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| Approach and deployment   | 3       | Read the ground, pick a formation shape (阵形), place the baggage, choose the commander's stance |
| 8–10 battle days          | 20–22   | ~90 s of orders (0–5 clicks, because orders persist) + ~45 s of resolution playback              |
| Rout, pursuit and outcome | 3       | Pursuit choices (chase or hold), captures, the highlights screen                                 |

That budget only works if **a day is mostly watched, not clicked**, and if there are more than one or two decisions that matter per battle.

### 6.3 Mechanics that create decisions

1. **Persistent orders** per formation: Advance, Hold, Skirmish (archers keep range), Charge (cavalry commits), Screen (protect a neighbour), Feign retreat, Pursue. A formation with an order acts automatically each day until the player changes it. This alone brings a day from ~40 clicks to under 8 and keeps the existing day-based engine and AI.
2. **Facing, flank and rear** (section 4.2). The AI's exposure term already exists; it needs the facing multiplier added.
3. **Cavalry charge momentum**: a straight approach of 3+ cells before contact multiplies the hit; cavalry that starts in contact has none. This is why infantry squares and forests matter.
4. **A baggage objective (辎重)**: each side has a baggage formation. Losing it costs all food on the field and −25 army morale, usually a rout. This re-creates 乌巢 and gives the attacker a reason to maneuver instead of grinding. (The old camp-capture rule was removed in v0.3 for good reasons: it was a token on a map with no supply model. The baggage version ties to the existing food and morale rules.)
5. **Army morale** alongside unit morale: the rout check becomes "army morale < 30 or baggage lost or 60% of formations routed", so battles end at the dramatic moment instead of the last survivor.
6. **Commander's day order (军令)**, one card per day, borrowed from the siege design: 鼓舞 rally, 诱敌 bait, 火攻 fire on a wind day, 夜袭 night raid, 死守 hold the line, 伏兵 lay an ambush, 单挑 offer a duel. Cards are visible to the other side a day late, so there is a move-and-counter layer on top of positioning.
7. **Duels (单挑)**: when two officer-led formations meet and both leaders are willing, a short animated exchange (seeded RNG, force plus traits, 3–5 rounds). Win: enemy formation −20 morale and the loser may be captured or wounded. This is the single most memorable thing in every Three Kingdoms game and the game has no equivalent.
8. **Weather and night** already exist as data; make them visible on the field (rain puts out fire, wind spreads it, night hides moves).
9. **Pursuit phase**: after a rout, cavalry formations choose to pursue (captures and wounded) or hold (safety against a feigned retreat).

Ordinary hits stay deterministic. Dice live only in duels, tactics and the commander cards, exactly where the player expects fortune.

### 6.4 Presentation that makes it beautiful and funny

- **Resolution playback** as the centre of the day: camera follows the action, formations tween between cells with the siege branch's 3-facing × 3-pose sheets, arrows arc, cavalry raises dust, fire spreads tile by tile, casualty numbers float, routed units stream off the map.
- **Formation size on the map** scales with troop count (the siege v0.2 plan already specifies this).
- **Officer lines (台词)**: one line each for charge, rout, duel start, duel win and capture, drawn from the officer's history and traits. This is the "funny" layer, and it is pure content.
- **Highlights screen**: the three biggest events of the battle, written from the player's side.
- **Map art**: keep the 15 painted 2D fields in v0.5. Whether field maps go 2.5D is a v0.6 question (decision D9); the siege branch's renderer makes it possible but the art cost is large.

### 6.5 Measuring it

Add a scripted-player Playwright probe that plays a battle with persistent orders and reports wall-clock minutes, clicks per day and days to outcome. Extend `tools/battle-pacing.mjs` with distinct-outcome counts (the siege sim's metric), baggage captures, duel counts and the share of battles that end by rout rather than attrition. Targets are proposals: median 9 days, under 8 clicks per day, over 60% of battles end by rout or baggage loss, Rally under 40% of casts.

## 7. City conquest becomes a siege

With Pillar 4 in place, an attacker who wins the field battle outside a city faces a second contest. The defender who loses the field or refuses battle retreats behind the walls:

1. **Field battle** (or the defender holds inside and the attacker goes straight to siege).
2. **Siege**: the `siege_v0.2` rules (frontage, engines, footholds, counters, night orders, scoring) run on a **city layout generated from the city's data**: wall level, size tier, terrain (river moat, mountain approaches, plain). About six layout templates cover the map.
3. **Clocks**: attacker's grain, defender's grain, and a real **relief army** (the strategic AI already dispatches support; the Zhang He countdown becomes an actual journey on the map).
4. **Other endings**: surrender when the garrison is starving and loyalty is low (劝降), negotiated withdrawal, or the attacker lifting the siege.

What transfers from `siege_v0.2`: the rules and AI framework (after replacing `GateId`, `SOUTH_TRENCH`, hardcoded ramps and coordinates with a per-city description, as its plan DV10 already requires), the engine/troop/effect/icon art, the renderer and the sim harness. What does not: the Chencang painting, story, portraits and the 536 MB `attempts/` folder. The branch must not be merged whole; the usable art needs an asset pack or git LFS. (Decision D8: siege in v0.5, or v0.6 immediately after.)

## 8. Decisions for the owner

| ID  | Question                          | Options                                                                                     | Recommendation                                                                                 |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D1  | City count                        | (a) fix 24; (b) ~36 filling the gaps; (c) 50+ commanderies                                  | **(b)**                                                                                        |
| D2  | Houses                            | (a) keep 6 + unowned; (b) ~12 houses, 6 playable, minor houses as real AI                   | **(b)**                                                                                        |
| D3  | Officer stats                     | (a) keep force/intellect; (b) add leadership + politics; (c) full 统武智政魅                | **(b)**                                                                                        |
| D4  | Unit model                        | (a) keep 3 arms; (b) 5 arms + ~10 named corps from a unit table; (c) many unit types        | **(b)**                                                                                        |
| D5  | Battle turn structure             | (a) keep day-by-day with persistent orders and playback; (b) simultaneous orders (WEGO)     | **(a)**; WEGO is a rewrite of engine and AI, and (a) gets most of the feel                     |
| D6  | Duels                             | (a) in v0.5; (b) later                                                                      | **(a)**; cheap, memorable, pure content                                                        |
| D7  | Baggage objective and army morale | (a) both; (b) army morale only; (c) neither                                                 | **(a)**                                                                                        |
| D8  | Siege mode                        | (a) in v0.5 after field battles; (b) v0.6; siege branch continues to its own v0.2 meanwhile | **(b)**, unless field battles land early; v0.5 ships the city data (walls, layouts) either way |
| D9  | 2.5D field maps                   | (a) v0.5; (b) v0.6 after siege merge; (c) never                                             | **(b)**                                                                                        |
| D10 | Scenarios                         | (a) 190 + 200; (b) 190 + 200 + 208                                                          | **(a)** first, 208 if the roster is ready                                                      |
| D11 | Save compatibility                | (a) break, new save version; (b) migrate v0.4 saves                                         | **(a)**                                                                                        |
| D12 | Population growth and tax         | (a) both; (b) growth only                                                                   | **(a)**                                                                                        |

## 9. Suggested order of work

Each phase is a separate set of tickets with its own evidence, in the v0.4 style. Sizes are rough: S days, M a week or two, L a month.

| Phase | Name                 | Contents                                                                                                                                                                                                      | Size | Depends on       |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------- |
| 0     | Foundations          | `balance/` module; unit table; city data file; scenario as data; save version bump; probes read the tables. **No gameplay change.**                                                                           | M    | —                |
| 1     | The historical realm | ~36 cities with census tiers, specialties, walls, corrected names; ~12 houses with historical 190 and 200 ownership; leadership and politics on the catalog; routes and battlefield selections for new cities | L    | 0                |
| 2     | Land and growth      | Per-city caps, population growth, tax level, tuntian, specialty projects; governor AI reads them; target curves from section 5.3 met                                                                          | M    | 0, 1             |
| 3     | Field battle v2      | Unit table in the engine; facing; persistent orders; charge momentum; baggage and army morale; commander cards; duels; pursuit; playback and officer lines; 30-minute probe                                   | L    | 0                |
| 4     | Siege (if D8 = a)    | Generic city layouts; port `siege_v0.2` rules and AI; relief armies; surrender; asset pack                                                                                                                    | L    | 1, 3, siege v0.2 |
| 5     | Playtest and tune    | Four owner sessions; curves and battle metrics re-run; wiki and player guide for both languages                                                                                                               | M    | all              |

Phases 1 and 3 do not depend on each other and could be worked by two people (or two agents) after Phase 0, as long as the one-editor-at-a-time rule for `engine.ts`, `battle/engine.ts`, `types.ts`, `commands.ts` and `storage.ts` is kept.

## 10. Risks

- **Content volume.** 36 cities × 2 scenarios × 12 houses × 98+ officers is a lot of data to get right. Mitigation: data files with provenance columns (like `CITY_GEOGRAPHY` already has), and a validator script that fails the build on orphan routes, unknown corps or missing translations.
- **AI regressions.** Facing, baggage and persistent orders change what the battle AI must evaluate. The v0.4 fixtures and matched-run protocol must be extended before the rules change, not after.
- **Performance.** The 10v10 battle-day p95 gate (50 ms) already fails on the owner's laptop. Facing and orders add branching. Keep the bounded-candidate design and re-run the gate per phase.
- **Art.** Named corps, duels and playback want new sprites. The siege branch's pipeline (blockout → generate → key → sheet) exists, but the repo cannot absorb another 0.9 GB. Decide on LFS or an external asset pack in Phase 0.
- **Scope.** This is three versions of work if everything is done. The order above is chosen so that stopping after Phase 2 or Phase 3 still leaves a coherent, better game.

## 11. What this brainstorm did not look at

The diplomacy system, prisoners, succession and the end-of-campaign rules are unchanged by this plan and were not re-reviewed. The 2.5D art plan in `docs/siege/01-chencang-art-plan.md` was read for its pipeline, not re-evaluated for style. Nothing here has been measured; every number in sections 5.3 and 6.5 is a proposed target to argue about.

## Source index

- City seeds and formulas: `src/v03/content/scenario.ts:84-258`; geography anchors `src/v03/geography/index.ts:89-390`; routes `:405-911`.
- Scenario houses and placements: `src/v03/content/officer-roster-setups.ts`, `officer-opening-placements.ts`, `guandu.ts`.
- Officer catalog and stats: `src/v03/content/officer-catalog.ts`, `src/v03/types.ts:142-170`.
- Economy: `src/v03/campaign/economy.ts:34-96`; work and development `src/v03/governance/city-actions.ts`; recruitment `src/v03/campaign/recruitment.ts:9-47`; monthly events `src/v03/campaign/monthly-systems.ts:493-602`.
- Battle rules and engine: `src/v03/battle/rules.ts`, `src/v03/battle/engine.ts` (damage `:391-426`, tactics `:50-58, 569-608`, AI `:1449-1945`, timeout `:1988-1993`); conquest `src/v03/engine.ts:408-690`.
- Pacing evidence: `tools/battle-pacing.mjs`, `docs/evidence/play-feel-phase2-pacing.json`.
- Siege branch: `origin/siege_v0.2`, `docs/siege/00-progress.md`, `02-chencang-mvp-plan.md`, `03-chencang-v0.2-plan.md`, `src/siege/`, `tools/siege-sim.mjs`.
