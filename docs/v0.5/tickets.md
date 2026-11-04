# v0.5 implementation briefs

**Branch:** `v0.5`. **Plan:** [plan.md](plan.md). **Art:** [art-requests.md](art-requests.md). **Ledger:** [README.md](README.md).

Written November 4, 2026 against `v0.4` at `b543ee7`, which `v0.5` starts from. Line numbers refer to that commit. Every brief below is meant to be handed to an implementing agent on its own; each names the files, the data shapes, the rules with their numbers, the tests and the acceptance. Numbers are starting values and live in `balance/` once F-01 lands; retuning them is not a rule change.

## 0. Conventions every ticket follows

**Repository rules (unchanged from v0.4).**

- `npm test -- --maxWorkers=1`, `npm run build`, `npm run lint:ui` and `npm run format:check` pass before a ticket is marked done. `npm run test:e2e` for tickets that touch the UI.
- `tools/lint-ui.mjs` rejects raw hex colours in `src/v03/styles.css` outside the `:root` block, font sizes ≤ 10 px, any file under `src/v03/ui` longer than 600 lines, and native `<button>`/`<input>`/`<select>` outside `src/v03/ui/kit`. New panels are split before they reach 600 lines.
- Every user-facing string is a key in both `src/v03/i18n/en.ts` and `zh.ts` (`zh` is typed `Record<MessageKey, string>`, so a missing key fails `tsc`). `tests/v03/playability-plan.test.ts:183` checks key parity. Formation and officer names in Chinese flows must contain CJK and no Latin letters (`tests/v03/ui/feedback.test.ts:50-70`).
- Save schemas in `src/v03/platform/storage.ts` are `.strict()`: every new state field must be added to the matching zod object or validation fails. Semantic cross-checks go in `validateV03State` (`storage.ts:646`).
- One editor at a time for `src/v03/engine.ts`, `src/v03/battle/engine.ts`, `src/v03/types.ts`, `src/v03/commands.ts` and `src/v03/platform/storage.ts`.
- Behaviour fixtures, not coefficient snapshots: a test asserts that the better option is chosen or that the forecast equals the resolution, not that a number equals 0.3.
- The 10v10 battle-day gate `tests/v03/performance.test.ts` (p95 < 50 ms for one AI turn plus `advanceBattleDay`) runs after every battle AI change.
- Trace parity: `tests/v03/ai/decision-evidence.test.ts:67` must keep passing (AI tracing never changes movement, combat or the random stream).
- The wiki (`src/v03/wiki.ts`) and the player guide (`docs/v0.3/player-guide.md`, to be copied into `docs/v0.5/player-guide.md` by the first ticket that changes a rule) are updated in the same ticket as the rule. The wiki's numbers are prose; a ticket that changes a number changes the prose.
- Commit messages name the ticket (`B-02: facing`) and never mention a model.

**Save compatibility.** v0.5 saves are version 4 (F-04). No migration. Old saves are rejected with the existing older-version message. Test fixtures and e2e fixtures are updated to version 4 in the same ticket that changes a schema.

**Determinism.** Every chance-based rule uses the battle's `rngState` through `nextRandomInt` (`battle/engine.ts:109`) or the campaign's `state.rng` LCG. Nothing reads `Math.random`.

**Order of work.** Phase 0 (F) first. Then O and B in parallel on separate modules, then P, then L. Each B ticket is one paired pacing experiment: record `tools/battle-pacing.mjs` before, implement, record after, and write both numbers in the ledger.

---

## 1. F — Foundations

### F-01 `balance/` module

**Goal.** Every tuned number lives in `src/v03/balance/`, nothing else changes.

**Files to create.** `src/v03/balance/index.ts` re-exporting:

| File                     | Holds (today's values, with the line they come from)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `balance/battle.ts`      | Day limits 30/14 (`battle/types.ts:16-17`); damage coefficient 0.3, force offsets 55/65, morale term 0.65 + m/170, floor 20, matchups 1.3/1.2/1.15, wavering 0.85, routed target 1.2, inspired 1.2 (`battle/engine.ts:391-425`); terrain defence hill 0.8, forest 0.82, fire forest 1.4 (`battle/maps.ts:237-242`); water 0.75/1.25 (`battle/rules.ts:12-13`); morale loss `min(45, ceil(frac×55))`; hunger 1% and −5 morale (`engine.ts:380-383`); experience +2%/−1% per level, XP gain 40/80/20 (`battle/experience.ts`); log cap 250 |
| `balance/morale.ts`      | Opening morale 80, wavering 40, routed 20, floor 5, recovery 5 to 80 (`battle/engine.ts:59-64`)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `balance/tactics.ts`     | Point cap 30, regen 2, opening points `intellect/10` per officer; costs fire 4, confuse 3, rally 3, raidSupply 4, ambush 3, rockfall 4; intellect thresholds 60/70/50 (force 85)/60/60/65 and the −10 at level 3; ranges 2/3; fire 0.21 with floor 12 and ratio floor 0.35, rockfall 0.18 and −10 morale, ambush 1.4, raid minimum 100 and 0.5, rally 15 + int/5, confuse 55 ± int clamped 20–90; weather fire rain 0.4 wind 1.25; variations 0.9–1.1 and 0.88–1.12                                                                      |
| `balance/battleAi.ts`    | `TACTICAL_VALUE` (retaliation 1.1, formation 80, wounded 0.15, rout 50, pointRecoveryDay 24), kill cap 200, no-shot discount 0.35, scarcity 1.5, temperament /60 and +0.35, appetite /40 and +0.25, exposure 0.65 and 0.35, battle-end bonus 500, preserve 0.2, wounded 0.6, appetite cost 0.3, rally 0.45/0.3/0.3/0.08, raid horizon 10 and 0.012, blocking 80/15, urgency 0.3/3/0.15, approach 40/0.9/0.3/0.5, rescue 35, shortlist 6, confuse 0.65, move cost 0.1, regret 200/0.5, withdrawal 30%/50% (`campaign/personnel.ts:23-24`) |
| `balance/economy.ts`     | Production (harvest 4, else 2.2, population/80; population/150, commerce 0.55, 0.8 + loyalty/500), gold upkeep 0.025, logistics rates 0.004/0.008/0.04 (`calendar/index.ts:437-442`), resource cap, shortfall penalties (loyalty −8, troops ×0.85, officer loyalty −4 and −3), conquest loyalty caps 50/60, plunder 2/1.5/5/4, cooldown 90                                                                                                                                                                                               |
| `balance/cityWork.ts`    | Work gold 80, points 2 per 10 days, bank 6, reward 100, equipment 180, relief 80 + 600 → +15 loyalty and +1500 population, trade 2000 ↔ 200, busy days (10/10/10/5/5/5/5/2/2), recruit loyalty −2, security 8 + int/20, develop +20/+10 cap 500, equip +5 cap 105, XP 25 per training, 100 per level, 5 levels, +2 force (+2 int for archers), search 40 + int/2 and 65 + rand(16), feast +8, reward +15                                                                                                                                 |
| `balance/recruitment.ts` | Regions, multipliers 100/75/60/50/40, gold 200/350/400/500/600, base 300 + 5×force, protected 1000 (`campaign/recruitment.ts:4-45`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| `balance/personnel.ts`   | `PERSONNEL_RULES` (capacity 10 000, wounded 60, captures 5/25, recovery 10, reorganization 10), troop experience max 1900 and 100 per level, captivity −5 per month, recruit chance clamp 5–90, exchange 75, join loyalty 60 (`campaign/prisoners.ts`)                                                                                                                                                                                                                                                                                   |
| `balance/campaignAi.ts`  | Autonomy thresholds (food rate, protected 500/×2, loyalty 60/70/55, reserve keep 1000, newcomer 100/500, replenish 500, sell +2000/+80, horizon 3, food/10), temperament (0.8/0.9, 0.7/0.95/1.1/2/0.5), strategic (party 10, raid 0.5, recent loss 360, target 0.5, wealth formula, target bonuses 0.25/0.25/0.2/0.25/0.15, garrison 1000/0.35, sizes 1.2/2/1.6, score formula, retain 0.8), diplomacy (24, 5, 40 + int/2, ±20/30/30/30/30/10/10/15, clamp 5–90), alliance 6 months, hegemon 16/12                                       |
| `balance/events.ts`      | Monthly event chances and effects (`campaign/monthly-systems.ts:493-602`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Each file exports one `as const` object with a one-line comment per number saying what it does and where it came from. The rules modules import from `../balance` and the old constants are deleted, not aliased. `PERSONNEL_RULES.capacity` replaces the literal `10_000` in `reserve-fill.ts:6`, `autonomy.ts:519`, `city-actions.ts:524,724`, `ui/panels/CityWork.tsx` and `ai/faction-objectives.ts:231`.

**Not moved.** Geometry (`V03_BATTLE_CELL`, map sizes), RNG constants, schema literals, the FNV hash.

**Tests.** The full suite passes with no fixture edits. Add `tests/v03/balance.test.ts`: every exported object is frozen, every value is a finite number or a frozen record, and a grep-style test (`fs` scan of the modules listed above) finds no numeric literal outside `balance/` in `campaign/economy.ts`, `campaign/recruitment.ts`, `battle/rules.ts` and `battle/maps.ts` except 0, 1, 2 and array indices. `tools/battle-pacing.mjs` output is byte-identical except the engine hash.

**Effort.** M. **Depends on.** nothing.

### F-02 Unit table

**Goal.** One table for the three arms.

**Create** `src/v03/content/units.ts`:

```ts
export type UnitArm = 'infantry' | 'cavalry' | 'archer';
export interface UnitDefinition {
  arm: UnitArm;
  nameKey: MessageKey; // 'unit.infantry' etc.
  move: number; // 3 / 5 / 3
  terrainMoveCost: Record<BattleTerrain, number | null>; // null = impassable
  attackRange: number; // 1 / 1 / 3
  matchup: Record<UnitArm, number>; // row: this arm attacking that arm
  meleeIncoming: number; // 1 / 1 / 1.3  (B-03)
  charge: number | null; // null / 1.3 / null (B-03)
  brace: number | null; // 1.2 / null / null (B-03)
  foodWeight: number; // 1 / 2 / 1  (cavalry eats double, economy.ts and openBattle)
  recruit: {
    multiplier: Record<'north' | 'central' | 'south', number>;
    gold: Record<'north' | 'central' | 'south', number>;
  };
  eliteKey: 'heavy-infantry' | 'elite-cavalry' | 'strong-archer';
  eliteLevel: 11;
}
export const UNITS: Readonly<Record<UnitArm, UnitDefinition>>;
```

**Replace** the scattered reads: `MOVE_BUDGET` and terrain costs in `battle/rules.ts:20-80`, the range default in `battle/engine.ts:153` and `campaign/roster.ts` (`attackRange: group.type === 'archer' ? 3 : undefined`), the matchup switch in `baseDamage`, the cavalry ×2 food weighting in `campaign/economy.ts` and `engine.ts:722-745`, the recruit tables in `campaign/recruitment.ts`, and `troopDisplayType` in `rendering/presentation.ts:100`. `charge`, `brace` and `meleeIncoming` are present but unused until B-03.

**Tests.** Suite passes unchanged. Pacing output identical. Add `tests/v03/units.test.ts` asserting that `UNITS` matches the values above and that the matchup table is used by `predictBattleAttack` for each arm pair.

**Effort.** S. **Depends on.** F-01.

### F-03 City data table

**Goal.** The 24 existing cities get per-city values from a table instead of `index % n`.

**Create** `src/v03/content/cities.ts`:

```ts
export type CityTier = 'S' | 'A' | 'B' | 'C' | 'D';
export interface CityRecord {
  id: string; // existing ids, unchanged
  tier: CityTier;
  population: number; // opening value
  farming: number;
  commerce: number; // opening values
  farmingCap: number;
  commerceCap: number; // L-01 reads these; until then unused
  loyalty: number; // opening value, 72 or 55 for Dong as today
  provenance: string; // one line: the census commandery and the reasoning
}
export const CITY_RECORDS: Readonly<Record<string, CityRecord>>;
```

Starting values (the owner reviews this table before merge):

| Tier | Cities                                                                                                 | Population | Farming | Commerce | Caps F / C |
| ---- | ------------------------------------------------------------------------------------------------------ | ---------- | ------- | -------- | ---------- |
| S    | wancheng (Nanyang), chengdu (Shu), jiangzhou (Ba)                                                      | 140 000    | 340     | 300      | 800 / 700  |
| A    | xuchang (Yingchuan), luoyang (Henan), chenliu, beihai, pingyuan, jiangling (Nan), wu, jianye (Danyang) | 110 000    | 300     | 280      | 650 / 600  |
| B    | ye (Wei), xiapi, shouchun (Jiujiang), zitong (Guanghan), chaisang, puyang                              | 85 000     | 260     | 240      | 500 / 480  |
| C    | changan (Jingzhao, in decline), hanzhong, jiangxia, jinyang (Taiyuan), xiangyang                       | 60 000     | 220     | 200      | 400 / 380  |
| D    | tianshui (Hanyang), beiping (Youbeiping)                                                               | 40 000     | 180     | 160      | 300 / 280  |

Luoyang and Chang'an keep their strategic weight through the existing Luoyang target bonus and the hegemon capital rule, not through population. Gold, food and reserve openings stay as today (1600/14000/1200 owned, 650/6000/600 unowned).

**Change.** `content/scenario.ts:237-258` builds each city from `CITY_RECORDS[id]`; `guandu.ts` likewise. Nothing in `geography/` changes. The `defense` field, dropped at runtime today, is removed from the content type.

**Tests.** `tests/v03/content/cities.test.ts`: 24 records, every id matches `citySeeds`, every value within the tier's row. The 12-month economy forecast test (`tests/v03/ai/economic-forecast.test.ts`) still passes. The campaign diagnostics tool runs for 12 months on both scenarios without a stopped run.

**Effort.** S. **Depends on.** F-01.

### F-04 Save version 4

**Goal.** v0.5 saves are distinct; old saves are refused; nothing migrates.

**Change** in `platform/storage.ts`: `stateSchema.version: z.literal(4)`, `ruleset: z.literal('hegemony-4')`, `envelopeSchema` likewise; `decodeV03Save` (1244) treats version ≤ 3 as "older version" (same message as today for 1 and 2) and > 4 as newer. `initial-state.ts` writes `version: 4, ruleset: 'hegemony-4'`. The autosave key stays `hegemony-v0.3:autosave` so the start screen's "a valid autosave opens automatically" path simply finds none.

Update every fixture that hand-writes a version: `tests/fixtures/*.json`, `tests/e2e-v03/playability-fixtures.ts` (`asSave`), `src/v03/dev/fixtures.ts`, the storage tests. Add a storage test: a version-3 envelope is rejected with the older-version message and the current autosave is untouched.

Later tickets that add state fields add them here as **required** fields (not optional) unless the field is genuinely absent in some states; the "optional field" pattern from Phase 3 is for compatibility we no longer need.

**Effort.** S. **Depends on.** nothing.

### F-05 Pacing harness v2

**Goal.** `tools/battle-pacing.mjs` measures what v0.5 changes.

**Change.**

- Roster option `--roster 3v3|8v8` (default 8v8 for v0.5 runs): 8v8 is 3 infantry, 2 cavalry, 3 archers per side, troops 800–1600 by seed, force 55–85 and intellect 45–80 spread across the roster from a fixed table so Confuse and Fire are castable, one formation per side with `fierce` and one with `cunning`. When B-04 lands the attacker also gets its baggage; when O-02 lands every entry carries `leadership`.
- Keep `--roster 3v3` to reproduce the v0.4 record.
- Report, per template and pooled: days (median, p90), first contact, outcome reason counts including `collapse` causes (B-05), rout share, baggage captures (B-04), duel count and results (B-07), card plays per card (B-06), order distribution per side per day (B-01), Rally share (unit Rally plus the Rally-all card over all tactic and card plays), attacker win rate, and **distinct outcomes**: the count of distinct tuples `(winner, reason, day, attacker troops rounded to 100, defender troops rounded to 100, routed formations)` over the seeds of one template.
- Write to `docs/v0.5/evidence/battle-pacing-<label>.json` with `--label`; the ledger links each experiment's before and after.

**Baseline.** Run `--roster 3v3` and `--roster 8v8` on `v0.5` before B-01 and commit both files as `battle-pacing-00-baseline-3v3.json` and `-8v8.json`.

**Effort.** M. **Depends on.** F-01.

### F-06 Wall-clock probe

**Goal.** Measure minutes and clicks of a real battle in the browser.

**Create** `tests/probe-v05/battle-wallclock.spec.ts` with its own `playwright.probe-v05.config.ts` (port `HEGEMONY_PROBE_PORT ?? 5191`, workers 1, video off). The spec seeds the autosave with a Battle-tier fixture (8 formations per side, built with `reviewBattleState` from `tests/e2e-v03/playability-fixtures.ts` extended to 8v8), then plays as a scripted player:

- v0.4 flow (baseline, run before B-01): each day, for each ready formation, select, click the forecasted best move cell, Attack, pick the first target; End battle day. Count `page.click` calls and elapsed time until `.v03-outcome-modal`.
- v0.5 flow (after P-01): choose the Scale arrangement, set orders once (centre Advance on the nearest enemy, archers Skirmish, cavalry Charge the nearest archer, one cavalry Screen the baggage), then each day open the morning report, play a card when affordable (Rally all at ≤ 50 army morale, otherwise none), Commit, wait for playback at 1×.

Output `.artifacts/v05/battle-wallclock.json` `{flow, minutes, clicks, clicksPerDay, days, outcome}` and a copy under `docs/v0.5/evidence/` when recording a milestone. The probe is not part of `npm test`.

**Effort.** M. **Depends on.** F-04 (fixture version).

---

## 2. O — Officers

### O-01 Leadership and politics data

**Goal.** Two new stats on all 98 officers.

**Types.** `content/officer-catalog.ts` `OfficerSeed` gains two numbers after `adultIntellect`: `adultLeadership`, `adultPolitics`. `OfficerDefinition` gains `adultLeadership`, `adultPolitics`. `types.ts` `V03Officer` gains `leadership: number; politics: number`. `createOpeningOfficer` (`campaign/officer-lifecycle.ts:26-51`) copies them; the under-18 penalty (`OFFICER_MATURITY_GAIN`) is extended with `leadership: 3, politics: 2`. The January growth step in `monthly-systems.ts:548-578` applies the same. `storage.ts` officer schema: `leadership: safeInt.min(1).max(120), politics: safeInt.min(1).max(120)`.

**Data.** Values 1–100 assigned from historical reputation, one line of provenance per officer in a new `content/officer-stats-provenance.ts` (`Record<id, string>`, Chinese or English). Anchors so the table is consistent:

| Officer     | 统率 | 政治 | Reasoning                                    |
| ----------- | ---- | ---- | -------------------------------------------- |
| Cao Cao     | 96   | 92   | Commanded and governed; the model for both   |
| Zhuge Liang | 92   | 98   | Ran Shu's state and its northern expeditions |
| Zhou Yu     | 95   | 76   | Chibi                                        |
| Guan Yu     | 94   | 40   | Jingzhou's commander; lost it to diplomacy   |
| Zhang Fei   | 85   | 25   |                                              |
| Lü Bu       | 80   | 12   | Fearsome, never held a province              |
| Xun Yu      | 60   | 96   | Cao's chancellor; never led a field army     |
| Liu Bei     | 78   | 80   |                                              |
| Sun Jian    | 90   | 55   |                                              |
| Yuan Shao   | 78   | 70   |                                              |
| Dong Zhuo   | 82   | 30   |                                              |
| Liu Shan    | 20   | 35   | The floor                                    |

The owner approves the full table before O-02 uses it. Until then the engine stand-in is `leadership ?? force`, `politics ?? intellect` and must not ship.

**UI.** `OfficerProfile.tsx`, the `OfficerRoster` row in `CityOfficers.tsx:89-92`, the directory card (`OfficerDirectory.tsx:195-216`) and the wiki's governance article show 统率/政治 with the existing 武力/智力. New keys `stat.leadership`, `stat.politics`.

**Tests.** `tests/v03/officer-roster.test.ts` asserts both stats are within 1–100 for all 98 and that every id has a provenance line. The directory test counts the new columns.

**Effort.** M (the data is the work). **Depends on.** F-04.

### O-02 Leadership in battle and in camp (soft cap)

**Goal.** Anyone can take 10 000 troops, but troops above `leadership × 100` are unmanaged.

**Rules.**

- `managedCapacity(officer) = officer.leadership × 100`.
- `excessShare(officer) = max(0, troops − managedCapacity) / max(1, troops)`.
- **Desertion** at each month boundary in `settleMonth` (`engine.ts:1636`, per city) and for officers on a journey (`journey.manifest.officerIds`): `desert = floor(excess × 0.05)` in a city, `floor(excess × 0.10)` on the march. Deserters leave the officer's `troops` and are added back to the city population (city) or lost (journey). One notice per officer per month: `report.desertion {officer, count}`. Governors and the AI reserve organizer (`autonomy.ts:501-539`) cap at `managedCapacity` when the city has officers to spare, and at 10 000 otherwise.
- **In battle** (`campaign/roster.ts` adds `leadership` to `BattleRosterEntry`, troop-weighted like force; `makeUnits` stores `leadership` and `excessShare`): opening morale `60 + leadership/5 − 20 × excessShare` (replaces the flat 80; militia use 60); incoming casualties on an ordinary hit, tactic or fire ×`(1 + 0.5 × excessShare)`; the ordinary-hit quality term becomes `(0.6 × L_src + 0.4 × F_src + 55) / (0.6 × L_tgt + 0.4 × F_tgt + 65)` in `baseDamage` (`battle/engine.ts:396-414`) and therefore in `forecastAttack`. Duels (B-07), counterattacks and charges use force as today.
- **Commander** of a side = non-militia, non-baggage unit with the highest leadership, then force, then id. Exposed as `battleCommander(state, side)` in `battle/engine.ts` for B-05 and B-06. `rendering/unit-leader.ts` `formationLeaderVisual` prefers leadership over level.
- **Level-ups** (`city-actions.ts:307-311` and the battle XP path) give +1 leadership in addition to the existing gains.

**UI.** The assign-troops block in `CityWork.tsx:269-305` shows "controls N of M" (`ui.controls.n.of.m`) and, above capacity, "M − N unmanaged: desert 5%/month, take +X% losses". The officer roster row shows the same compactly. `fillOfficersFromReserve` (`governance/reserve-fill.ts`) fills strongest leadership first up to `managedCapacity`, then tops up to 10 000 only if reserve remains and the city is threatened.

**Tests** (`tests/v03/officers/leadership.test.ts`).

- A 90-leadership officer with 3 000 men beats three 40-leadership officers with 1 000 each on a mirrored plain (same force, same morale start) in AI-vs-AI.
- A 30-leadership officer with 10 000 in a city loses 350 men at the month boundary; on a journey 700. The population rises by 350 in the city case.
- `predictBattleAttack` equals the resolved casualties for a unit with `excessShare` 0.7 (×1.35).
- Opening morale for leadership 100 is 80, for 50 is 70, for 30 with 10 000 troops is 52.

**Effort.** M. **Depends on.** O-01, F-01, F-02.

### O-03 Politics in the city

**Goal.** Politics drives civil work; the executor recommendation uses the right stat.

**Rules** (in `governance/city-actions.ts` `applySharedCityWorkEffect` 183-255 and `inspectCityAction`):

- Development gain `round(base × (0.7 + politics/200))` with base 20 farming / 10 commerce.
- Security `8 + floor(politics/20)` (was intellect).
- Relief population `round(1500 × (0.7 + politics/200))`.
- Trade `round(2000 × (0.7 + politics/200))` food per 200 gold.
- Search keeps intellect. Train keeps force. Recruit keeps force. Assign-troops is free.

**Executor choice.** `rankWorkExecutors` (`ui/panels/CityWorkAssignment.tsx:14-25`) and `officerForAction` (`city-actions.ts:258-270`) rank by: recruit → force; train → leadership; search → intellect; develop, security, relieve, trade → politics. The "Recommended" badge appears for every action, not only recruit/search/security. Governor manager selection (`autonomy.ts:154-157`) prefers politics; the governor appointment screen shows politics next to candidates.

**Tests** (`tests/v03/governance/politics.test.ts`): each action's effect for politics 30, 50, 90; the recommended executor per action; a 12-month governor run with a 90-politics governor develops farming at least 20% further than with a 40-politics one on the same seed.

**Effort.** S. **Depends on.** O-01, F-01.

---

## 3. B — Battle rules

All B tickets edit `src/v03/battle/engine.ts`, `battle/types.ts` and `platform/storage.ts` (one editor at a time). Each adds its log codes to `i18n/formatters.ts` `formatBattleLog` and both locales, and its wiki prose to the `battle` article.

### B-01 Standing orders

**Goal.** A formation carries an order; unacted formations execute it when the day is committed; the enemy AI assigns orders by a small rule layer and executes them with the same filter.

**State.** `TacticalBattleUnit.order: BattleOrder` where

```ts
export type BattleOrder =
  | { kind: 'free' }
  | { kind: 'advance'; target: { unitId: string } | { x: number; y: number } }
  | { kind: 'hold' }
  | { kind: 'skirmish'; target?: { unitId: string } }
  | { kind: 'charge'; target: { unitId: string } }
  | { kind: 'screen'; friendId: string }
  | { kind: 'withdraw' }
  | { kind: 'pursue' };
```

Default `{kind:'free'}` for every unit created by `createTacticalBattle` (B-08 changes the default per arrangement). `BattleAction` gains `{ type: 'setOrder'; unitId: string; order: BattleOrder }`, legal for the player's own living units at any time before the day is committed, never consumes `moved`/`acted`, logged as `log.order {unit, order, target}`. Legality: `charge` only for cavalry, `skirmish` only for archers, `screen` needs a living friendly `friendId`, `pursue` only for cavalry, `advance`/`charge` targets must be living enemies or in-map cells.

**Executor.** `evaluateBattleTurn(state, unitId, rationRemainders, context)` gets a fourth element in `context`: `orderConstraint = orderConstraintFor(state, unit)` returning

```ts
interface OrderConstraint {
  cellAllowed(x: number, y: number, routeDistBefore: number, routeDistAfter: number): boolean;
  actionAllowed(candidate: TacticalActionCandidate): boolean;
  progressWeight: number; // multiplies progressValue
  exposureWeight: number; // multiplies the exposure factor
  forcedTarget?: string; // charge
}
```

| Order    | cellAllowed                                                                                               | actionAllowed                                                                                     | Weights   |
| -------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| free     | all                                                                                                       | all                                                                                               | 1 / 1     |
| advance  | current cell or route distance to the target strictly smaller                                             | attack only if `outgoing − retaliation × preserve ≥ 0` or the target is adjacent; tactics allowed | 1.5 / 1   |
| hold     | current cell only                                                                                         | attack or tactic from where it stands, else hold                                                  | 0 / 1.2   |
| skirmish | cells whose Manhattan distance to the nearest living enemy is 2–3 (prefer 3 when `attackRange` 3)         | ranged attack only (distance ≥ 2); never a cell at distance 1 if any 2–3 cell is reachable        | 0.5 / 1.5 |
| charge   | cells on the straight line toward `target` with maximal displacement; adjacent to the target if reachable | attack `forcedTarget` whatever the score; else hold at the end of the run                         | 2 / 0.4   |
| screen   | current cell if adjacent to `friendId`, else cells adjacent to it                                         | attack enemies adjacent to the friend or in range; else hold                                      | 0 / 1     |
| withdraw | cells that increase the sum of distances to living enemies and do not enter a zone of control             | hold only                                                                                         | 0 / 2     |
| pursue   | as advance toward the nearest routed enemy; as free when none exists                                      | attack routed enemies first                                                                       | 1.5 / 0.8 |

Hold additionally marks the unit `braced` for B-03 if it did not move.

`completeV03BattleDay(state, battleId, {remainingAct})` (`engine.ts:2230`) executes orders for every unacted player unit **by default**; `remainingAct` becomes the name of that step and the end-day dialog's "Let remaining officers act" button is replaced by "Commit day" (P-01 wires the UI; until then the existing button triggers it). Units manually commanded that day (`acted`) are skipped. The engine logs `log.orderExecuted {unit, order}` once per unit before its actions so playback can caption them.

**AI order layer.** `aiAssignOrders(state, side)` runs at the start of `runBattleAiTurn` and sets, in this order: `withdraw` for every unit when `battleWithdrawalDue`; `screen` on the baggage for the cavalry formation nearest it when an enemy is within 6 cells of the baggage (B-04); `charge` for a fierce cavalry formation with a straight lane of ≥ 3 plain cells to an archer or a wavering target; `skirmish` for archers that have a friendly infantry formation within 2 cells; `hold` for infantry under the Stand firm card (B-06); otherwise `free`. Orders persist until the rule that set them no longer holds. An order whose target died or became unreachable falls back to `free` and logs `log.orderLapsed`.

**Impossible orders** for the player are listed by `impossibleOrders(state, side)` (target dead, no route, screen friend dead), consumed by the morning report (P-01).

**Tests** (`tests/v03/battle/orders.test.ts`).

- Each order, on a plain map with a two-unit setup, produces the expected cell and action (hold never moves; skirmish keeps distance 3; charge attacks a target with a worse forecast than free would choose; withdraw increases distance and never attacks; screen stays adjacent to the baggage).
- All units `free`: pacing output equals the F-05 8v8 baseline within noise (same medians, outcome counts within ±3%).
- A scripted day with unchanged orders needs one command (`completeBattleDay`).
- p95 gate passes.

**Pacing experiment.** `battle-pacing-01-orders.json`: AI uses the order layer. Expect no regression in attacker win rate; order distribution reported.

**Effort.** L. **Depends on.** F-01, F-02, F-05.

### B-02 Facing

**State.** `TacticalBattleUnit.facing: 'n' | 'e' | 's' | 'w'`. Opening facing: attacker `e`, defender `w` (attacker enters from the left, `layout.ts:45`). Updated in `performMove` to the direction of the last step of the path (reconstruct the path from `getReachableBattleTiles`' parent map; expose `reachablePath(state, unitId, x, y)`), and in `performAttack`/`performTactic` to the dominant axis toward the target. A unit that holds keeps its facing.

**Rule.** `attackAspect(source, target): 'front' | 'flank' | 'rear'` from the dominant axis of `source − target` compared with `target.facing` (ties count as flank). Multipliers on `baseDamage` and on all forecasts: front 1, flank 1.25, rear 1.5. Counterattack multiplier: front 1, flank 0.5, rear 0 (no counterattack). Archers volleying at range use the aspect of the target only. Tactics (fire, rockfall, ambush) are unaffected.

**AI.** `risk()` (`battle/engine.ts:1518`) and `enemyAttackField` include the aspect from the evaluated cell with the facing the unit would have there (last-step direction, or toward its attack target). Candidate scoring gains `+ outgoing × (aspectMultiplier − 1)` naturally through the forecast.

**Rendering.** `BattleUnitVisual.facing`; `UnitSprite` picks the facing artwork (P-02) and until then rotates the troop-type seal arrow. `formatBattleLog` adds "(from the flank)" / "(from behind)" to `log.attack` when `params.aspect` is not front.

**Tests** (`tests/v03/battle/facing.test.ts`): the same hit from front, flank and rear yields 1 : 1.25 : 1.5 casualties and counterattacks of 1 : 0.5 : 0; facing updates after a move and an attack; the AI, offered a free flank and a frontal hit of equal cost, takes the flank; p95 gate.

**Pacing experiment.** `battle-pacing-02-facing.json`.

**Effort.** M. **Depends on.** B-01.

### B-03 Charge, brace and archer melee

**State.** `TacticalBattleUnit.charging: boolean` (reset at rollover and after an attack) and `braced: boolean` (set by B-01 hold execution or a manual `wait` without moving; cleared when the unit moves or at rollover).

**Rules.**

- `performMove` sets `charging = true` when the unit's arm has `charge`, the displacement is ≥ 3 cells along one axis and 0 along the other, every cell on the path is plain, and the unit did not start in an enemy zone of control.
- A charging attack multiplies `baseDamage` by `UNITS[arm].charge` (1.3), unless the target is braced infantry and the aspect is front, in which case the multiplier is 1 and the counterattack is ×`UNITS.infantry.brace` (1.2). Brace does nothing from flank or rear, and nothing when the braced unit is wavering.
- A target with `meleeIncoming` > 1 (archers, 1.3) takes that multiplier from any attack at distance 1.
- Forecasts carry `charge`, `brace` and `melee` flags so the on-map forecast (PF-UI-07) can say why.

**Tests** (`tests/v03/battle/charge.test.ts`): straight 3-cell run → ×1.3; run through a forest cell → no charge; braced front → ×1 and counter ×1.2; braced flank → ×1.3 and counter ×0.5; archers hit at distance 1 → ×1.3, at distance 2 → ×1; forecast equals resolution in every case.

**Pacing experiment.** `battle-pacing-03-charge.json`. Watch the cavalry share of casualties dealt.

**Effort.** S. **Depends on.** B-02, F-02.

### B-04 Baggage train

**State.** `TacticalBattleUnit.role: 'line' | 'baggage'` (default `line`). The attacker's baggage is appended to the roster in `openBattle` (`engine.ts:692`) as `{ id: \`${journey.id}:baggage\`, name: 'Baggage', troopType: 'infantry', role: 'baggage', troops: max(100, round(0.05 × attacker troops)), force: 30, intellect: 30, leadership: 30, attackRange: 0 }`with empty membership.`BattleRosterEntry.role?` is optional so the pacing tool and tests can add one.

**Rules.**

- Move budget 2; `getUnitAttackTargets` returns nothing for baggage; it never counterattacks; it has no tactics and no order other than `withdraw`/`hold`.
- Excluded from: tactic point generation, the timeout survivor count (`getBattleTimeoutOutcome`), the all-routed rout check, the tier formation count (B-09) and `allocateSurvivors` in `finishBattle` (porters are not officers' troops).
- **Capture.** When an enemy attacks the baggage and no living, non-routed friendly line unit is orthogonally adjacent to it, the attack captures it instead of dealing damage: `troops = 0`, log `log.baggageCaptured`, `supplies[owner] = 0`, army morale −25 (B-05) and the owner's units get −10 morale once. If a friendly unit is adjacent, the attack deals ordinary damage; reaching 0 troops is `log.baggageLost` with the same consequences.
- The attacker's `supplies` are the field food as today; the capture simply zeroes them and the campaign mirror `attackerFood` follows through the existing mirror in `applyV03BattleAction`/`advanceBattleDayWithSupplies`.
- Deployment: the baggage is placed in the rear column of the band (column 13 for the attacker), middle row, before B-08; B-08 lets the player move it within the band.

**AI.** The defender's order layer (B-01) sends its nearest cavalry to `advance` on an unscreened baggage within 8 cells; the attacker's layer keeps one formation `screen` on it whenever an enemy is within 6 cells.

**Tests** (`tests/v03/battle/baggage.test.ts`): capture by an unscreened attack zeroes supplies; screened attack deals damage; the timeout count ignores it; `finishBattle` does not allocate its survivors; the defender AI sorties for an exposed baggage in a matched 8v8 seed; the attacker screens it.

**Pacing experiment.** `battle-pacing-04-baggage.json`: baggage capture share, attacker win rate (expect a drop of a few points, to be rebalanced in B-05).

**Effort.** M. **Depends on.** B-01.

### B-05 Army morale, break and pursuit

**State.** `V03TacticalBattleState.armyMorale: Record<BattleSide, number>`, `shaken: Record<BattleSide, boolean>`, `pending: null | { kind: 'pursuit'; winner: BattleSide; loser: BattleSide }`, `BattleOutcome.cause?: 'allRouted' | 'armyMorale' | 'baggage' | 'formations'`, `BattleOutcome.pursuit?: { pursuers: string[]; rearGuard: string | null }`.

**Rules.**

- Opening `armyMorale = 50 + commanderLeadership / 2` (`battleCommander`, O-02; stand-in force until O-02 merges).
- Deltas, applied where the event happens: friendly unit routed −8, destroyed −12, enemy unit routed +5, enemy destroyed +6, baggage lost −25, duel won +10 / lost −10 (B-07), commander's unit routed −20, attacker −2 at each rollover after day 20. Clamp 0–100. Logged as `log.armyMorale {side, delta, cause}` only when the delta is ≥ 5 in magnitude.
- At ≤ 30 (once, `shaken`): every living unit of that side −15 morale, log `log.armyShaken`.
- **Break**: at the end of each activation and at rollover, a side breaks when `armyMorale ≤ 10`, or when routed-or-destroyed line units ≥ 60% of its line units, or by the existing all-routed rule. `resolveRout` is extended; the outcome is `{winner: other, reason: 'rout', cause}`. `retreatRisk` (`battle-aftermath.ts:92`) treats a `rout` outcome as forced (25%) as today.
- **Pursuit.** When a side breaks and the winner has cavalry with morale ≥ 40, the engine sets `pending` instead of the outcome. The decision is `{ type: 'pursuit'; pursuers: string[]; rearGuard: string | null }`: the player side fills its half (pursuers if it won, rear guard if it lost); the AI fills its half immediately (fierce or cunning-against-weak pursues with every eligible cavalry; a benevolent or cautious commander pursues with at most one; the AI loser names its highest-morale line unit with morale ≥ 40 as rear guard, or none). When both halves exist the engine resolves: each pursuer deals one free hit to the rear guard (if any); the rear guard halves the pursuit effects; then the outcome is written with `pursuit`. `settleBattlePersonnel` reads it: wounded share for the loser's non-rear-guard units +10% per pursuer (cap +30%), capture risk +5% per pursuer (cap +30%), halved with a rear guard.
- For AI-vs-AI battles and the pacing tool both halves are automatic.

**Tests** (`tests/v03/battle/armyMorale.test.ts`): each delta; the shaken step fires once; break at 60% routed; pursuit with two pursuers and no rear guard raises a 25% risk to 35% and the wounded share from 60% to 80%; with a rear guard 30% and 70%; the rear guard takes two hits.

**Pacing experiment.** `battle-pacing-05-break.json`: rout-or-break share ≥ 60%, 30-day timeouts ≤ 5%, raids ≤ 15%, attacker win rate 40–55% with equal armies. Retune army morale deltas in `balance/morale.ts` if not; record each retune as its own file.

**Effort.** M. **Depends on.** B-01, B-04.

### B-06 Commander cards and signs

**State.** `V03TacticalBattleState.cards: Record<BattleSide, { played: CardPlay | null; last: CardPlay | null; planned: BattleCard | null }>`, `signs: Record<BattleSide, BattleCard | null>` (what that side has read of the enemy's plan for today), `fires: { x: number; y: number; untilDay: number }[]`, `windDirection: 'n' | 'e' | 's' | 'w'` (rolled with the weather when it becomes `wind`), `TacticalBattleUnit.hidden: boolean` (ambush), `TacticalBattleUnit.feinting: boolean`, `TacticalBattleUnit.nightRaid?: { targetId: string }`.

```ts
export type BattleCard =
  | 'rallyAll'
  | 'standFirm'
  | 'ambush'
  | 'feint'
  | 'fire'
  | 'nightRaid'
  | 'vigilance'
  | 'challenge';
export interface CardPlay {
  card: BattleCard;
  unitId?: string;
  targetId?: string;
  day: number;
}
```

`BattleAction` gains `{ type: 'card'; card: BattleCard; unitId?: string; targetId?: string }`, one per side per day, legal before the side's day is committed, paid from `tacticPoints[side]`.

| Card      | Cost | Legality                                                                                          | Resolution                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rallyAll  | 6    | —                                                                                                 | Immediately: every living line unit +10 morale (cap 100). `log.card`.                                                                                                                                                                                                                                                                                                                                                   |
| standFirm | 3    | —                                                                                                 | For the day: units executing `hold` take ×0.85 incoming and their morale loss per hit is capped at 10. Cleared at rollover.                                                                                                                                                                                                                                                                                             |
| ambush    | 5    | `unitId` stands in forest, has not moved or acted today, is not adjacent to an enemy              | `hidden = true`: enemy AI evaluation and the enemy's view (P-01) ignore it; it is revealed when it attacks, when an enemy ends a move adjacent, or by Vigilance within 3. Its first attack while hidden is ×1.5 (`log.ambushSprung`).                                                                                                                                                                                   |
| feint     | 4    | `unitId` morale ≥ 40, not routed                                                                  | The unit immediately withdraws up to 3 cells toward its own edge (engine move, no `moved` flag consumed for the player) and is `feinting` until rollover. During the enemy's turn, an enemy that ends a move adjacent to it **and** adjacent to another friendly line unit takes one free attack from each such friendly unit (`log.feintSprung`).                                                                      |
| fire      | 8    | weather `wind` or `clear`; commander intellect ≥ 70; `unitId` is an archer with a target in range | Sets three burning cells: the target cell and the next two cells downwind (`windDirection`, or away from the archer when clear). Units on burning cells at rollover take `troops × 0.08 × fireWeather` casualties and −10 morale; fire spreads one cell downwind per rollover while weather is `wind`, dies on `rain`, otherwise lasts 3 days. Forest cells burn ×1.4. `log.fireSet`, `log.fireSpread`, `log.fireBurn`. |
| nightRaid | 7    | `unitId` cavalry, morale ≥ 40, `targetId` within 6 cells                                          | At rollover, before weather: the raider attacks the target at ×1.2 ignoring zone of control and aspect; if the target's side played `vigilance` or the target is executing `hold`, the raider instead takes ×1.5 of the target's counterattack and −10 morale. `log.nightRaid`. The raider is placed adjacent to the target if a free cell exists, else stays.                                                          |
| vigilance | 2    | —                                                                                                 | For the night: counters `nightRaid` as above; at play time reveals hidden enemies within 3 cells of any friendly unit (`log.ambushRevealed`).                                                                                                                                                                                                                                                                           |
| challenge | 2    | `targetId` is an enemy line unit with a leader within 4 cells of `unitId`                         | Creates a duel offer (B-07).                                                                                                                                                                                                                                                                                                                                                                                            |

**Signs.** At rollover the AI side chooses `planned` for the next day from its policy (below). Then for the player side: `chance = clamp(40 + commanderInt(player) − commanderInt(enemy), 20, 80)`; `nextRandomInt(100) < chance` sets `signs[player] = enemy.planned`, else `null`. `cards[side].last` is always visible to the other side the next morning. The AI side reads the player's `played` card directly when it acts (it acts after the player), which is its equivalent of a sign.

**AI card policy** (`aiChooseCard(state, side)` in a new `battle/cards-ai.ts`): with points ≥ cost and in this priority: `vigilance` if the enemy played `nightRaid` yesterday or has a cavalry unit within 6 of a weak unit and the commander is cunning; `fire` if legal and a target of ≥ 800 troops stands downwind in forest or with two neighbours; `nightRaid` if fierce and a lone enemy unit is within 6 of an own cavalry; `ambush` if cunning and an own unit stands in forest between the enemy and the baggage or capital edge; `challenge` if fierce and own leader force ≥ target force + 10; `rallyAll` if army morale ≤ 40 or two units are wavering; `standFirm` if more own units hold than advance; `feint` if cunning and an enemy unit is adjacent to a feint candidate with two friends nearby; else none. Cards consumed from the same pool as tactics mean the AI's existing opportunity cost applies.

**Tests** (`tests/v03/battle/cards.test.ts`): each card's legality and resolution with a seeded fixture; signs appear with the expected frequency over 200 seeds (±5%); fire spreads with wind and dies in rain; a night raid into vigilance hurts the raider; an ambushed unit is absent from the enemy's `enemyAttackField`; card plays are deterministic from `rngState`; p95 gate.

**Pacing experiment.** `battle-pacing-06-cards.json`: every card played somewhere; Rally (unit + rallyAll) < 40% of all plays; distinct outcomes ≥ 150 on bf01 over 200 seeds.

**Effort.** L. **Depends on.** B-01, B-05.

### B-07 Duels

**State.** `V03TacticalBattleState.duel: null | { challengerUnitId: string; targetUnitId: string; source: 'card' | 'attack'; day: number }`, `TacticalBattleUnit.leaderOfficerId: string | null` (set by `rosterFromGroups` to `officers[0].id`; null for militia and baggage), `TacticalBattleUnit.leaderWounded: boolean`, `TacticalBattleUnit.duelPolicy: 'auto' | 'accept' | 'decline'` (default `auto`), `V03TacticalBattleState.duelLosers: string[]` (officer ids).

**Offers.**

- From the `challenge` card (B-06).
- From an ordinary attack by a unit whose leader is `fierce` on a unit with a leader, before damage: the engine creates the offer and resolves the answer immediately by the target's `duelPolicy`: `auto` → accept if the target leader is fierce; if cunning only with force ≥ challenger + 10; otherwise with force ≥ challenger. The attack then resolves after the duel (a losing defender fights at −20 morale).
- Answer for the player: a `duelPolicy` per unit set through `{ type: 'setDuelPolicy'; unitId; policy }` (P-03 exposes it); no mid-turn dialog.
- Refusal: refuser −5 morale, challenger +5, `log.duelRefused`.

**Resolution** (`resolveDuel(state)` in a new `battle/duel.ts`, deterministic from `rngState`): up to 5 rounds; per round each side rolls `nextRandomInt(100) < hitChance`, `hitChance = clamp(50 + 1.5 × (force_self − force_other) + 5 × fierce_self + level_self, 15, 85)`; both can hit in a round; first to 3 hits wins; both reaching 3 in the same round, or 5 rounds without a winner, is a draw. Log `log.duelRound {round, a, b, hitA, hitB}` and `log.duelResult`.

**Consequences.** Winner's unit +10 morale, loser's −20; army morale +10/−10; the losing leader is `leaderWounded` (unit uses `force 45, intellect 40, level 0` for the rest of the battle, troops unchanged) and is added to `duelLosers`; the winning officer gains 40 officer XP at settlement. In `settleBattlePersonnel`, an officer in `duelLosers` whose unit ended the battle routed or destroyed is captured outright (risk 100). Draw: both +5 morale. Death in duels: none in v0.5.

**Tests** (`tests/v03/battle/duel.test.ts`): deterministic replay from the same `rngState`; acceptance matrix by trait and force; a losing leader's unit fights with militia stats; a duel loser whose unit routs is captured in `settleBattlePersonnel`; the fierce auto-offer fires on an ordinary attack and not on a tactic.

**Effort.** M. **Depends on.** B-06.

### B-08 Deployment arrangements

**State.** `V03TacticalBattleState.phase: 'deployment' | 'day' | 'done'`, `arrangement: Record<BattleSide, BattleArrangement | null>`, `type BattleArrangement = 'scale' | 'crane' | 'circle' | 'column'`.

**Rules.** `createTacticalBattle` starts in `phase: 'deployment'` when the player side has more than one unit, otherwise `day`. Actions during deployment: `{ type: 'arrangement'; arrangement }` (positions every own unit and sets its initial order), `{ type: 'deploy'; unitId; x; y }` (any free cell inside the side's band from `deploymentColumns` × `deploymentRows`), `{ type: 'beginBattle' }`. The AI side is arranged automatically (`aiArrangement`: fierce commander → crane, cunning → scale, defender with fewer units → circle, otherwise scale). No unit acts and no day passes during deployment; the campaign clock is not blocked by it beyond the usual manual-battle block.

Arrangement layouts are computed from the band and the unit list, never hard-coded per field. With `cols = [c0, c1]` (attacker's band is left of the enemy, so "front" is `c1`; mirrored for the defender) and the rows of the band's middle `r`:

| Arrangement | Placement (front → rear)                                                                                                 | Initial orders                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| scale       | infantry on the front column centred on `r`; archers one column behind them; cavalry the column behind; baggage rearmost | infantry `advance` nearest enemy, archers `skirmish`, cavalry `free`, baggage `hold` |
| crane       | infantry front centre; cavalry on the front column at the top and bottom ends; archers behind the centre                 | infantry `hold`, cavalry `charge` the nearest enemy, archers `skirmish`              |
| circle      | every line unit on the cells around the baggage (or the centre for the defender)                                         | all `hold`, cavalry `screen` the baggage                                             |
| column      | one unit per row down the middle rows, front to rear by arm (cavalry, infantry, archers)                                 | all `advance`                                                                        |

If the band has too few free cells (wetland override, water in the band), fill the nearest free cells by Manhattan distance; `createTacticalBattle` never throws for any of the 15 fields with 9 line units plus baggage.

**Tests** (`tests/v03/battle/deployment.test.ts`): every arrangement × every canvas field × 9 units + baggage places every unit inside the band with no overlaps; orders match the table; `beginBattle` moves to `day`; a unit cannot be deployed outside the band.

**Effort.** M. **Depends on.** B-01, B-04.

### B-09 Battle tiers and quick resolve

**Rules.** `openBattle` computes `tier: 'skirmish' | 'battle' | 'decisive'` and stores it on `V03BattleState` and the tactical state: skirmish when the larger side has ≤ 3 line formations or the intent is a raid; decisive when both rulers are present or both sides have ≥ 8 line formations; else battle. Day limit 14 for skirmish, 30 otherwise (replacing `campaignBattleDays(intent)` reads).

**Quick resolve.** Command `{ type: 'resolveBattle'; battleId }`: sets `autoCommand = true` and `resolveQuickly = true` on the battle record; `advanceV03` (`engine.ts:2015`) treats a quick-resolving player battle as not blocking multi-day advance and stops after the day on which it resolves, so the player sees the outcome modal with highlights (P-05). Nothing else about resolution changes.

**UI (small, part of this ticket).** The campaign dock's battle buttons read "Battle at Puyang · 决战" with the tier (`ui.battle.tier.*`); the battle header shows the tier; `BattleActionBar` gains **Resolve quickly** under More actions with a confirmation.

**Tests**: tiers for raids, 3v3, 8v8 and ruler-vs-ruler; a quick-resolved battle completes within `dayLimit` advances and produces the outcome report; the manual-battle block still applies to a non-quick battle.

**Effort.** S. **Depends on.** B-05.

---

## 4. P — Presentation

P tickets live under `src/v03/ui` and `src/v03/rendering`; they add no rules. New panels go in `src/v03/ui/panels/battle/` to keep files under 600 lines.

### P-01 Day flow: morning report, orders, cards, commit

**Screens.**

- **Morning report** (`panels/battle/MorningReport.tsx`), shown at the top of the battle sidebar each new day and after deployment: day and tier; weather today → tomorrow with wind direction when windy; army morale both sides as two bars; timeout standing (existing); the enemy's card yesterday (`cards[enemy].last`); today's sign if any, as a sentence per card (`sign.ambush`: "Dust rises in the woods", etc.); impossible orders (B-01) with a "Fix" link that selects the unit; units that are wavering or routed. Collapsible; `prefers-reduced-motion` respected.
- **Orders**: selecting a formation shows an **order chip row** in `BattleUnitMenu` (Advance, Hold, Skirmish, Charge, Screen, Withdraw, Pursue, Free) with illegal ones disabled and a reason tooltip; choosing Advance/Charge/Screen enters a target pick on the map (reuse the attack-targeting layer: candidate enemies ringed, friends for Screen). The chip row sits above the existing Attack/Tactics/Wait/Undo so manual command is unchanged. The order shows on the token as a small glyph (P-02) and in the roster list.
- **Card picker** (`panels/battle/CardPicker.tsx`): eight cards with cost, legality reason and a one-line effect; picking a card with a unit or target parameter enters a map pick. Shown in the sidebar between the rosters and the log; the enemy's last card and the sign are repeated here.
- **Commit day** replaces "End battle day" everywhere (`BattleActionBar`, TopBar, hotkey E): it dispatches `completeBattleDay` (which now executes orders). The confirmation appears only when a formation under manual command this day still has a legal attack (existing `canStillStrike` restricted to units whose order is `free` and that have not acted).
- **Deployment** (B-08): a `DeploymentPanel` with the four arrangements as cards (icons from art A-07), drag of tokens within the band (reuse the pending-move preview), and **Begin battle**.
- **Pursuit** dialog (B-05): a list of eligible cavalry with checkboxes, or the rear-guard choice, and Confirm.
- **Duel policy** (B-07) as a three-way toggle in the formation's detail.

**Hooks.** `useGameSession` gains `orderTargeting`, `cardTargeting`, `deploymentDrag`; `battle-controls.ts` gains `setOrder`, `playCard`, `beginBattle`, `answerPursuit`. The existing `standOnPendingMove` keeps the provisional-move behaviour.

**Strings.** Order names and descriptions (`order.*`), card names/effects/signs (`card.*`, `sign.*`), report lines, tier names, arrangement names (`arrangement.*`), pursuit copy.

**Acceptance.** F-06 v0.5 flow: a Battle-tier fight in 25–35 minutes at 1× playback, ≤ 8 clicks on a day with unchanged orders; e2e spec `tests/e2e-v05/day-flow.spec.ts` drives deployment → orders → card → commit → playback → outcome in both locales with no raw English in Chinese.

**Effort.** L. **Depends on.** B-01, B-05, B-06, B-08 (can start after B-01 with the others stubbed).

### P-02 Playback v2

**Scope.**

- `planBattlePlayback` (`useBattlePlayback.ts:51`) replays every appended entry between the pre-commit snapshot and the post-advance state: both sides' moves, attacks, tactics, cards, fire spread, night raids, duels (as a scene marker consumed by P-03), army-morale lines and the day banner. Frame duration from `balance/presentation.ts` (`frameMs: 650`, `moveMsPerCell: 120`, `volleyMs: 500`), speed 1× / 2× / Skip persisted in `useBattleDisplay`.
- **Camera follow**: before each frame `focusBattlefieldPointsViewport` on the acting unit and its target with padding; no jump when both are already visible.
- **Facing sprites** (art A-01/A-02): `unitArtwork` takes `facing` and `pose` (`ready | advance | attack`); west is the east sheet mirrored with `transform: scale(-1,1)`; north/south use the back/front figures; attack pose is shown for the attack frame.
- **Formation size**: the squad image scale is `0.75 + 0.25 × min(1, troops/3000)`; small/large layouts stay at the 500 threshold.
- **Effects** (art A-05): arrow arc along a quadratic path for archer attacks (3–5 arrows); dust puffs behind a charging cavalry move; fire tiles drawn from `fires` with the three fire states; smoke on burning forest; a dim blue overlay and torches (program-drawn glow) for night-raid frames; rain streaks and wind streaks as CSS when weather is rain or wind.
- **Floats** keep the existing `v03-battle-float` for casualties; add morale floats in amber, "FLANK" / "REAR" / "CHARGE" / "BRACED" tags from `params.aspect`, `charging`, `braced`.
- **Rout streaming**: a routed unit's move frames use the fleeing figure (art A-04) and a dashed trail to its edge.
- **Order glyphs** on tokens (program-drawn SVG, 8 glyphs) and a facing wedge under the token.
- Reduced motion: no tweens, the frame list collapses to the summary.

**Performance.** 60 fps at 1440×900 for an 8v8 day on the owner's laptop; tokens use CSS transforms only; effects are SVG `<use>` of a defs sprite; no React re-render per frame beyond the token layer (keep the frame state in a ref and update transforms imperatively if needed).

**Acceptance.** `tests/v03/rendering/playback.test.ts` covers the plan (frames for both sides, duel markers, fire frames); an e2e spec takes a screenshot mid-charge and a screenshot of a burning forest; a manual check by the owner.

**Effort.** L. **Depends on.** B-02, B-03, B-06; art A-01, A-02, A-04, A-05.

### P-03 Duel scene

`panels/battle/DuelScene.tsx`, opened by playback when it reaches a `log.duelRound` sequence (and immediately when the player plays Challenge): the backdrop (art A-06), both 256 px portraits facing each other, names and force, five round slots; each round plays as a clash stroke (art A-06) on the hit side with the officer line for duel start/win/loss (P-04); result banner; Skip. Under 15 seconds at 1×. Reduced motion shows the result only.

**Effort.** M. **Depends on.** B-07, P-02; art A-06.

### P-04 Officer lines

**Create** `src/v03/content/officer-lines.ts`:

```ts
export type LineMoment =
  | 'charge'
  | 'rout'
  | 'duelStart'
  | 'duelWin'
  | 'duelLose'
  | 'captured'
  | 'victory';
export const OFFICER_LINES: Readonly<
  Record<string, Partial<Record<LineMoment, { en: string; zh: string }>>>
>;
export const TRAIT_LINES: Readonly<Record<Trait, Record<LineMoment, { en: string; zh: string }>>>;
export const DEFAULT_LINES: Record<LineMoment, { en: string; zh: string }>;
export function officerLine(officerId: string, moment: LineMoment, locale: Locale): string;
```

All 98 officers get at least `duelStart` and `charge`; the 53 legacy officers get all seven. Lines are short (≤ 40 characters zh, ≤ 60 en), in character, and may be funny; sourced from the novel's flavour where it exists ("吾乃燕人张翼德也！"). Rendered as a speech bubble above the token for 1.2 s in playback, and in the duel scene. The owner reviews the table.

**Test**: every entry has both locales; zh lines contain CJK and no Latin; the fallback chain works for an officer without lines.

**Effort.** M (content). **Depends on.** nothing (the renderer hook is in P-02/P-03).

### P-05 Highlights

`finishBattle` (`engine.ts:408`) computes `highlights: BattleHighlight[]` (max 3) from `logEntries` and stores them on `V03BattleOutcomeReport`:

```ts
interface BattleHighlight {
  code: 'biggestHit' | 'rout' | 'duel' | 'baggage' | 'charge' | 'fire' | 'collapse';
  params: Record<string, string | number>;
  score: number;
}
```

Scoring: casualties of the biggest single hit; a rout caused by a hit (+200); a duel (+300, +100 if it decided the battle); baggage capture (+400); fire casualties summed; the collapse cause. Ties by day. `formatEvent` (`i18n/events.ts:44-103`) renders them under the outcome title; `BattleOutcome.tsx` shows them as three lines above the formation table; the chronicle entry keeps them. The campaign dock and the battle header show the tier (B-09).

**Test**: a scripted battle with a known log yields the expected three highlights in both locales.

**Effort.** S. **Depends on.** B-05, B-07.

### P-06 Historical units of measure

**Create** `src/v03/i18n/units.ts`:

```ts
export function formatMoney(n: number, locale: Locale): string; // zh: 1,234 钱; 12,000 → 1.2 万钱; en: 1,234 cash; 12,000 cash
export function formatGrain(n: number, locale: Locale): string; // zh: 2,000 石; en: 2,000 shi
export function formatMen(n: number, locale: Locale): string; // zh: 3,000 人; en: 3,000 men
export function formatPopulation(n: number, locale: Locale): string; // zh: 11 万口（2.2 万户）; en: 110,000 people (22,000 households)
export function formatDistance(km: number, locale: Locale): string; // zh: 120 里; en: 120 li   (1 li = 0.415 km)
export function formatDate(absoluteDay: number, locale: Locale): string; // zh: 初平元年三月初五; en: 190 AD, month 3 day 5
```

Reign eras as content in `content/reign-eras.ts`: 中平 184–189, 初平 190–193, 兴平 194–195, 建安 196–220, 黄初 221– (the game's years are solar; months are the game's 30-day months). Every screen, report, forecast, the wiki and the player guide call these instead of bare numbers with "gold"/"food" labels; `i18n/en.ts` `gold`/`food` become "cash"/"grain", zh `钱`/`粮（石）`. Stored quantities do not change. Whether to rescale money so sums read like Han figures is decided in L-04.

**Test**: formatter unit tests for both locales; the e2e raw-English check still passes; a grep test that `src/v03/ui` contains no literal "gold" or "food" outside `i18n`.

**Effort.** M. **Depends on.** nothing. Owner reviews the unit names.

---

## 5. L — Land

### L-01 Per-city caps

`applySharedCityWorkEffect` uses `CITY_RECORDS[city.id].farmingCap/commerceCap` instead of 500; the development preview (`CityWork.tsx`) and the governor planner (`autonomy.ts:637-662`) read the cap; the city overview shows `farming / cap`. Test: a D city stops at 300; an S city continues to 800; the planner stops developing a capped sector.

**Effort.** S. **Depends on.** F-03.

### L-02 Population growth

In `settleMonth` per city, after production: `growth = loyalty ≥ 70 && food ≥ 0 ? 0.003 : loyalty ≥ 50 ? 0.001 : 0`, `population += floor(population × growth)`; in a food shortfall `population −= floor(population × 0.005)` (in addition to the existing desertion). Capped by `RESOURCE_CAP`. The monthly summary shows the net population change per city. Test: each band; famine decline; `forecastCityEconomy` includes the growth in `projectedFood` for the next month.

**Effort.** S. **Depends on.** F-01.

### L-03 Curves

`tools/v03-campaign-diagnostics.mjs` gains `--curves <path>`: for each run, per month, per faction: gold, food, population, troops (officers + garrisons), fieldable troops (from the existing supply estimate), cities. Written as JSON plus a fixed-width text table. `docs/v0.5/evidence/curves-00-baseline.json` recorded before L-01/L-02/O-03 on both scenarios, 120 months, all six houses, both cohorts.

**Effort.** M. **Depends on.** F-03.

### L-04 Tuning pass

Change numbers in `balance/` only, one experiment per change, each recorded as `curves-NN-<what>.json`. Targets from plan section 5.4; a missed target is explained in the ledger. Also decides money rescaling (P-06) and the regional cavalry prices.

**Effort.** M. **Depends on.** L-01, L-02, L-03, O-03.

---

## 6. Evidence files

| File                                                                    | Written by                   |
| ----------------------------------------------------------------------- | ---------------------------- |
| `docs/v0.5/evidence/battle-pacing-00-baseline-3v3.json` and `-8v8.json` | F-05                         |
| `docs/v0.5/evidence/battle-pacing-0N-<ticket>.json`                     | each B ticket                |
| `docs/v0.5/evidence/battle-wallclock-v04.json`, `-v05.json`             | F-06, P-01                   |
| `docs/v0.5/evidence/curves-00-baseline.json`, `curves-NN-*.json`        | L-03, L-04                   |
| `docs/v0.5/README.md`                                                   | every ticket updates its row |

---

## Appendix A — balance starting values introduced by v0.5

| Key                                                                                                                                                                                                                | Value                                                 | Ticket |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------ |
| `facing.flank`, `facing.rear`                                                                                                                                                                                      | 1.25, 1.5                                             | B-02   |
| `facing.counterFlank`, `counterRear`                                                                                                                                                                               | 0.5, 0                                                | B-02   |
| `charge.cavalry`, `charge.minRun`                                                                                                                                                                                  | 1.3, 3                                                | B-03   |
| `brace.infantryCounter`                                                                                                                                                                                            | 1.2                                                   | B-03   |
| `melee.archerIncoming`                                                                                                                                                                                             | 1.3                                                   | B-03   |
| `baggage.share`, `baggage.min`, `baggage.move`                                                                                                                                                                     | 0.05, 100, 2                                          | B-04   |
| `baggage.armyMorale`, `baggage.unitMorale`                                                                                                                                                                         | −25, −10                                              | B-04   |
| `armyMorale.base`, `commanderFactor`                                                                                                                                                                               | 50, 0.5                                               | B-05   |
| `armyMorale.unitRouted/destroyed/enemyRouted/enemyDestroyed/duel/commanderRouted/attackerLateDay`                                                                                                                  | −8, −12, +5, +6, ±10, −20, −2 after day 20            | B-05   |
| `armyMorale.shakenAt`, `shakenUnitMorale`, `breakAt`, `breakRoutedShare`                                                                                                                                           | 30, −15, 10, 0.6                                      | B-05   |
| `pursuit.woundedPerPursuer`, `capturePerPursuer`, `cap`, `rearGuardFactor`                                                                                                                                         | 0.10, 5, 0.30, 0.5                                    | B-05   |
| `cards.cost.*`                                                                                                                                                                                                     | 6, 3, 5, 4, 8, 7, 2, 2                                | B-06   |
| `cards.rallyAll`, `standFirmIncoming`, `standFirmMoraleCap`, `ambushFirstHit`, `feintRange`, `fireTroopShare`, `fireMorale`, `fireDays`, `nightRaidBonus`, `nightRaidPenalty`, `vigilanceReveal`, `challengeRange` | 10, 0.85, 10, 1.5, 3, 0.08, −10, 3, 1.2, 1.5, 3, 4    | B-06   |
| `signs.base`, `signs.min`, `signs.max`                                                                                                                                                                             | 40, 20, 80                                            | B-06   |
| `duel.rounds`, `hitsToWin`, `base`, `forceSlope`, `fierce`, `min`, `max`, `winnerMorale`, `loserMorale`, `armyMorale`, `drawMorale`, `refuse`, `winnerXp`                                                          | 5, 3, 50, 1.5, 5, 15, 85, +10, −20, 10, +5, −5/+5, 40 | B-07   |
| `leadership.capacityPerPoint`, `desertCity`, `desertMarch`, `unmanagedIncoming`, `unmanagedMorale`, `openingMoraleBase`, `openingMoralePerLeadership`                                                              | 100, 0.05, 0.10, 0.5, 20, 60, 0.2                     | O-02   |
| `hitQuality.leadershipWeight`                                                                                                                                                                                      | 0.6                                                   | O-02   |
| `politics.base`, `politics.slope`                                                                                                                                                                                  | 0.7, 1/200                                            | O-03   |
| `population.growthHigh/Mid/Low`, `famineDecline`, `loyaltyHigh`, `loyaltyMid`                                                                                                                                      | 0.003, 0.001, 0, 0.005, 70, 50                        | L-02   |
| `presentation.frameMs`, `moveMsPerCell`, `volleyMs`, `lineMs`                                                                                                                                                      | 650, 120, 500, 1200                                   | P-02   |

## Appendix B — new state summary

`TacticalBattleUnit` adds: `order`, `facing`, `charging`, `braced`, `role`, `leadership`, `excessShare`, `hidden`, `feinting`, `nightRaid?`, `leaderOfficerId`, `leaderWounded`, `duelPolicy`.

`V03TacticalBattleState` adds: `phase`, `tier`, `arrangement`, `armyMorale`, `shaken`, `pending`, `cards`, `signs`, `fires`, `windDirection`, `duel`, `duelLosers`.

`BattleOutcome` adds: `cause?`, `pursuit?`. `V03BattleState` adds: `tier`, `resolveQuickly?`. `V03BattleOutcomeReport` adds: `highlights`. `V03Officer` adds: `leadership`, `politics`. `BattleRosterEntry` adds: `leadership`, `role?`, `leaderOfficerId?`.

`BattleAction` adds: `setOrder`, `card`, `pursuit`, `arrangement`, `deploy`, `beginBattle`, `setDuelPolicy`. Campaign commands add: `resolveBattle`.

## Appendix C — log codes and string families

Log codes: `log.order`, `log.orderExecuted`, `log.orderLapsed`, `log.attack` (+`aspect`, `charge`, `braced`, `melee` params), `log.baggageCaptured`, `log.baggageLost`, `log.armyMorale`, `log.armyShaken`, `log.collapse`, `log.pursuit`, `log.card`, `log.ambushSprung`, `log.ambushRevealed`, `log.feintSprung`, `log.fireSet`, `log.fireSpread`, `log.fireBurn`, `log.nightRaid`, `log.duelOffer`, `log.duelRefused`, `log.duelRound`, `log.duelResult`, `log.deployed`, `log.desertion` (campaign).

String families (both locales): `order.*`, `card.*`, `sign.*`, `arrangement.*`, `tier.*`, `aspect.*`, `duel.*`, `pursuit.*`, `stat.leadership`, `stat.politics`, `unit.*`, `units.money/grain/men/population/distance`, `era.*`, `highlight.*`, `report.desertion`, `ui.controls.n.of.m`.
