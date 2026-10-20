# Hegemony of the Three Kingdoms — gameplay improvement plan

> **Archived:** the v0.2 plan, implemented on branch `v0.2`. Its open items, decisions and backlog now live in [next-steps.md](../next-steps.md). This file is not updated. See the [documentation index](../README.md).

**Branch analyzed:** `hegemony_of_the_three_kindoms_v0.1` (October 20, 2026).
**Status:** **ready for implementation.** Designer decisions are recorded in §7. No game code has
been changed yet.
**Suggested location in the repo:** `docs/gameplay-improvement-plan.md`.
**Designer priorities:** (1) make tactical battles more enjoyable; (2) add **掠夺 (Plunder)** as in
the original 三国霸业: it ruins a city but yields resources, and it also works against enemy cities.

Evidence labels used below:

- **[code]** — read directly from the cited file and line.
- **[calc]** — arithmetic from the cited formulas and starting data.
- **[guess]** — a design judgment or a likely in-play effect not yet verified by playtest.

---

## 0. Implementation handoff

### 0.1 How to use this plan

1. Implement tasks **one at a time**, in the order of §5.0. Each task card in §5 is sized for a
   single implementation session and contains its rules, files, acceptance criteria and tests.
2. Every task follows the **working agreement** in §0.2.
3. After each phase, run the playtest checklist in §6 and update §7 if a decision changes.
4. Anything in §8 (Backlog) is **out of scope** until the designer moves it into a phase.

### 0.2 Working agreement for every task

- **Branching:** one feature branch per task, created from the latest
  `hegemony_of_the_three_kindoms_v0.1`. Name: `gp/<task-id>-<short-name>` (e.g. `gp/P1-6-counterattack`).
- **Rules stay in the simulation.** Rules go in `src/game/*`. UI and rendering only call commands
  and **pure queries**. Queries and forecasts never consume RNG and never mutate state.
- **Commands stay atomic.** A rejected command changes nothing (existing `dispatch` contract,
  `src/game/campaign.ts` `dispatch`). Every new command has a human-readable rejection reason.
- **Saves:** every new state field gets (a) a TypeScript type, (b) a Zod schema entry in
  `src/platform/saves.ts`, (c) a semantic check in `validateState`, and (d) a **deterministic
  default in the v1→v2 migration** (no RNG draws in migration) — see P1-1 and decision D9.
- **Bilingual:** every new player-facing string, chronicle message and error goes into the Chinese
  catalogs (`src/i18n/*.zh.ts`) in the same task. The engine keeps canonical English messages.
- **Constants:** new tuning numbers are named constants at the top of the file that uses them, so
  later balance passes don't hunt for magic numbers.
- **Docs:** update the rule tables in `docs/implementation.md` for any rule change.
- **Fairness (D8):** the AI never receives free resources or hidden bonuses. It uses the same
  commands, costs and validation as the player.
- **Required checks before finishing a task:** `npm test`, `npm run build`,
  `npm run format:check`. Also run `npm run test:e2e` for UI tasks, and
  `npm run diagnostics:ai` (with the P1-13 bot once it exists) for balance tasks. Report actual
  results; never weaken tests to pass.
- **Fixture hashes:** a task that intentionally changes rules regenerates the legacy continuation
  hashes in `tests/fixtures/legacy-continuations.json` and states why in the task summary.
- **Don't push, merge or deploy** unless the designer asks.

### 0.3 Prompt template for an implementation session

```text
Repo: https://github.com/Zhuogang/threekingdoms_game
Base branch: hegemony_of_the_three_kindoms_v0.1
Plan: docs/gameplay-improvement-plan.md

Implement task <TASK-ID> exactly as specified in §5 of the plan. Follow the working
agreement in §0.2 and the designer decisions in §7. Read the files listed in the task card
before editing. Do not implement other tasks or anything from the §8 backlog.
When done: run the required checks, update docs/implementation.md and the Chinese
catalogs, commit to a new branch gp/<task-id>-<name>, and summarize what changed,
test results, and any deviation from the spec with the reason.
```

---

## 1. Executive summary

- **The engine is solid; the rules are thin.** The architecture (pure deterministic simulation,
  atomic commands, resumable battles, save validation) can safely absorb rule changes. v0.1
  deliberately froze combat and tactical AI (`docs/v0.1-improvement-plan.md` §1). This plan
  unfreezes them.
- **Battles are the biggest fun gap.** There is no counterattack, no zone of control, every officer
  can cast Fire/Confuse at range 3 for free, morale only scales damage, battlefield provisions can
  never run out, and every battlefield uses the same template. The plan fixes these first.
- **Scarcity lives on the battlefield, not in city management (D7).** City income and order costs
  stay generous. War is what's limited: supply days, battle food, tactic points and irreplaceable
  veteran troops.
- **掠夺 has three forms:** plunder your own city (a city order), **raid** an enemy or independent
  city (a march that fights any defending soldiers, takes resources and goes home), and **sack**
  a city you capture (a march option). All three use one formula, scaled to this game's economy
  (D1). The cost is a ruined city: support, farming and commerce are halved. A new unrest rule
  makes low support dangerous.
- **Officers get stakes:** they can be captured on the battlefield (by encirclement or a melee
  kill, with no randomness) and later recruited, released or executed. They never die in battle
  (D5).
- **Rivals get smarter and more distinct, without cheating:** frontline logistics, coordinated
  attacks, statecraft, raids, per-faction personalities, and a coalition against a runaway leader.
- **Replayability:** random default seed, conditional historical events that fire only when the
  world matches history (D10), more scenarios later.
- **Deferred to the backlog:** extra battle randomness, duels, a camp with hit points, and any
  economy tightening (§8).

---

## 2. Current-state assessment

### 2.1 Strengths worth protecting

1. **Deterministic, atomic simulation.** A failed command changes nothing, and RNG is saved
   (`src/game/campaign.ts` `dispatch`). Balance changes are reproducible with seeds.
2. **Resumable battles.** Interruption is stored as data (`resolution.queue/index/stage`,
   `src/game/types.ts:145`), so new battle features stay save-safe.
3. **Shared rules for player and AI.** The AI uses the same `cityAction`/`march` paths
   (`src/game/campaign.ts:669`).
4. **Strong presentation:** headshots for all 52 officers, troop symbols, readiness states,
   bilingual UI, display presets, monthly reports.
5. **Diagnostics harness** (`tools/ai-diagnostics.mjs`, `docs/ai-balance.md`), ready to be extended.
6. **Good roster and map:** 24 cities with real chokepoints, and 15 famous free officers to compete for.

### 2.2 Top 10 problems, ranked by impact on fun

| #   | Problem                                                                                                                                                                                                                                                                             | Evidence                                                                                                                                                                                                     | Addressed by                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1   | **No tactical friction in battle.** No counterattack, no zone of control. Damage scales with the attacker's current troops, so focus-firing the weakest unit is almost always optimal. Morale only scales damage.                                                                   | [code] `src/game/battle.ts:294-335` (no retaliation), `:283-292`, `:70-110` (movement ignores adjacent enemies)                                                                                              | P1-6, P2-2, P2-3               |
| 2   | **Tactics are free, universal and long-range.** Any unit (even Zhang Fei, INT 42) can use Fire or Confuse at range 3, with no cost. Fire ignores force and terrain defense, and blurs the archers' role.                                                                            | [code] `battle.ts:337-379`, `:582-596`; `src/ui/App.tsx:1115-1143`. [calc] Cao Cao Fire, 1,000 troops vs INT 40: ≈ 287 casualties from 3 tiles, versus ≈ 260 for a FORCE 80 vs 80 melee hit of the same size | P1-7, P2-4                     |
| 3   | **Camp rush and deployment gaps.** Units deploy at `y = index` (rows 0..n), while camps sit on row 5, which is always plain and has a river crossing. Cavalry may reach the enemy camp in 2–3 days and win instantly. A unit parked on its own camp tile blocks that camp entirely. | [code] `battle.ts:163-164`, `:188-201`, `:51-54`, `:137-149`. [guess] that this is optimal play; verify                                                                                                      | P1-5, P2-2                     |
| 4   | **Battlefield provisions are decorative.** A march commits `ceil(0.65 × troops) + 200` food; 30 days of battle consume ≈ 0.46 × troops.                                                                                                                                             | [code] `campaign.ts:601`, `battle.ts:465-483`. [calc] 2,000 troops: 1,500 committed vs ≤ 930 used                                                                                                            | P1-11, P2-5                    |
| 5   | **Resources rarely constrain war.** Cities earn ≈ 550–1,080 gold per month against 60–200-gold orders, with a large food surplus. Designer decision D7 keeps city management generous, so the plan creates scarcity in war logistics instead.                                       | [code] `campaign.ts:922-927`, `src/content/scenario.ts:249-256`. [calc]                                                                                                                                      | P1-11, P2-4, P2-5, P2-1        |
| 6   | **Persuasion is a dominant, one-sided strategy.** The sworn-officer chance is `35 + 0.6·INT − 0.55·loyalty`, and their troops come too. Cao Cao persuading Lü Bu (loyalty 58) from Chenliu: ≈ 59% for 120 gold. The AI never persuades.                                             | [code] `campaign.ts:463-489`, `:744`; `scenario.ts:336`. [calc]                                                                                                                                              | P1-14, P2-10b                  |
| 7   | **Many orders have no consequence.** No defection from low loyalty, no revolt from low support (so Sow dissent barely matters), no effect from experience or age. Scouting repeats data the city panel already shows for enemy cities.                                              | [code] `campaign.ts:889-1008`, `:457-462`; `App.tsx:1433-1445`                                                                                                                                               | P2-7, P2-8, P2-11, P3-8        |
| 8   | **Battle feedback is flat.** No damage forecast, no threat overlay, no attack animation or floating numbers, three sound cues, and casualties appear only in a 32-line log.                                                                                                         | [code] `GameMap.tsx:1088-1099`, `battle.ts:56-59`, `src/platform/audio.ts:2-7`                                                                                                                               | P1-3, P1-4, P1-9, P1-10        |
| 9   | **Rivals are generic and the late game is a grind.** The AI attacks the weakest neighbor, never transports, never negotiates, never allies against a leader, and accepts alliances by a dice roll.                                                                                  | [code] `campaign.ts:669-763`, `:503-510`                                                                                                                                                                     | P2-10a/b, P2-12                |
| 10  | **Low replayability.** One scenario, a fixed default seed `'190'` (`App.tsx:328`), a single battlefield template, events at ≈ 3% per city per month (`campaign.ts:968-982`), and no officer traits.                                                                                 | [code]                                                                                                                                                                                                       | P1-15, P2-13, P3-1, P3-2, P3-4 |

### 2.3 Where I disagree with the existing documents

- **`v0.1-improvement-plan.md` §1 froze combat, movement, range rules and tactical AI, and banned
  AI personalities.** That was right for a readability release. Now that the game is readable, those
  freezes should end. Keep that plan's _process_ (evidence, bilingual strings, save compatibility),
  not its _scope limits_.
- **`reference-baseline.md` / `roadmap.md` prioritize legacy fidelity.** This plan puts **fun first,
  fidelity where it adds identity**: 掠夺, 计谋 variety and prisoner choices are reproduced in spirit,
  not formula-for-formula (D1).
- **`ai-balance.md`: "Cautious means fewer qualifying wars, not a grace period."** The measurements
  show a first AI march on turn 1 under every preset. P1-15 adds an optional opening truce, on by
  default for Cautious only.
- **`ai-balance.md` measures with a player who only ends turns.** That cannot reveal player dominant
  strategies. P1-13 adds a scripted competent-player bot.

---

## 3. Design pillars

1. **Every battle turn is a real decision.** Position, terrain, timing and tactic choice should beat
   raw troop count often enough to be interesting. No single action should always be correct.
2. **Wars are fought with limited means.** City management stays generous (D7). Armies are limited
   by supply days, battle food, tactic points and veterans you can't replace quickly.
3. **Ambition leaves scars.** Plunder, raids, sacking, persuasion and execution give quick gains
   with visible, lasting costs.
4. **Officers are characters.** Capture, imprisonment, defection and (later) traits create stories.
5. **Clarity before complexity.** Each new rule ships with a forecast, tooltip or overlay in both
   languages.

---

## 4. Recommendations by system (summary)

Detailed rules are in the §5 task cards. Effort: **S** ≈ one session, **M** ≈ one long session or
two, **L** = split into sub-tasks. Risk covers balance, saves and regressions.

### 4.1 Tactical battles (top priority)

| Recommendation             | Change in one line                                                                                | Task  | Effort | Risk |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ----- | ------ | ---- |
| Attack and tactic forecast | Pure query shows min–max casualties and the counter before confirming.                            | P1-3  | S      | Low  |
| Enemy threat overlay       | Toggle shading every tile an enemy can hit next day.                                              | P1-4  | S      | Low  |
| Center-out deployment      | Fill rows 5, 4, 6, 3, 7… so camp lanes aren't open on day 1.                                      | P1-5  | S      | Low  |
| Counterattack (反击)       | Surviving targets strike back at 50% (Guard 70%) when the attacker is in range.                   | P1-6  | S      | Med  |
| Tactic gating              | Intellect requirements; non-strategists have range 2.                                             | P1-7  | S      | Med  |
| Weather forecast           | Show tomorrow's weather.                                                                          | P1-8  | S      | Low  |
| Combat feel                | Movement tween, hit flash, floating numbers, sound cues.                                          | P1-9  | M      | Low  |
| Pacing and battle summary  | "Advance to contact" button and a post-battle summary.                                            | P1-10 | S      | Low  |
| War logistics              | Choose 10/20/30 supply days; battle food really runs out.                                         | P1-11 | M      | Med  |
| Zone of control (控制区)   | Entering a tile next to an enemy ends movement.                                                   | P2-2  | M      | Med  |
| Morale states and flanking | Wavering and routed states, flanking bonus, morale shock.                                         | P2-3  | M      | Med  |
| Tactic points (计策点)     | A per-battle pool spent on tactics.                                                               | P2-4  | M      | Med  |
| New tactics (计谋)         | 劫粮 Raid supplies, 伏兵 Ambush, 落石 Rockfall — deterministic (D3).                              | P2-5  | M      | Med  |
| Officer capture in battle  | Deterministic: encircled or killed in melee → captured. No battle deaths (D5).                    | P2-6  | M      | Med  |
| Experience levels          | Veterans gain stats and easier tactics.                                                           | P2-7  | S      | Low  |
| Tactical AI v2             | Focus fire, camp guard, threat avoidance, retreat, defender hold.                                 | P2-9  | M      | Med  |
| City-specific battlefields | Terrain profiles per city, plus walls and gates for fortified cities.                             | P2-13 | L      | Med  |
| Camp capture               | **Keep instant capture** (D4). Deployment and ZOC fix the rush; a camp with HP is in the backlog. | —     | —      | —    |

### 4.2 掠夺 Plunder, raid and sack

**Original behavior** (upstream `erduoniba/baye-fmj-app` commit `60c41ea`,
`Baye/baye_c/src/citycmd.c` `DepredateDrv` ≈ line 1069; menu string `strcnt.c:46`
侦察 / 征兵 / 分配 / **掠夺** / 出征):

```text
city.PeopleDevotion /= 2;  city.Farming /= 2;  city.Commerce /= 2;
food  += 5 × (officer.IQ + officer.Force)
money += 2 × (officer.IQ + officer.Force)
```

The original AI planner appears to skip this order (`tactic.c` ≈ line 565) **[guess]**.

**Atlas version (D1: scaled).** One shared pure function, `plunderOutcome(city, leader)`, is used by
all three forms and by the UI preview:

| Item        | Rule                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base        | `base = leader.intellect + leader.force`                                                                                                                                                        |
| Gold gained | `2 × base + floor(city.commerce × 1.5)` — using values **before** halving                                                                                                                       |
| Food gained | `5 × base + floor(city.farming × 4)`                                                                                                                                                            |
| City damage | `loyalty` (public support), `farming` and `commerce` → `floor(x / 2)`. `population` → `max(500, floor(population × 0.92))`                                                                      |
| Cooldown    | `city.plunderCooldownUntil = state.turn + 3`. Any plunder, raid or sack of that city is rejected while `state.turn < plunderCooldownUntil`                                                      |
| Example     | [calc] Commerce 265, farming 310, Cao Cao (82 + 94 = 176): **+749 gold, +2,120 food**. The city loses ≈ 132 commerce and ≈ 155 farming (≈ 2 development orders each), and support drops 72 → 36 |

| Form                                  | How it's issued                                                                               | What happens                                                                                                                                                                                                                                                                                                                                                  | Task  |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **Plunder own city**                  | City order `plunder` (group "Harsh measures"), 0 gold / 20 stamina, uses the officer's action | Applied immediately. Gains go to the same city. Every serving officer in the city loses 3 loyalty.                                                                                                                                                                                                                                                            | P1-12 |
| **Raid** an enemy or independent city | March with intent `raid`; fixed 10 supply days                                                | At resolution: **if the target has any soldiers** (officers with troops or reserves), a battle is fought with a **10-day limit**. If the raiders win, or the city had no soldiers, the target is plundered, the gains go home to the source city, and the raiders return home. **The city is not captured.** If the raiders lose, the normal retreat applies. | P2-1  |
| **Sack** on capture                   | March with intent `sack`                                                                      | Normal conquest battle. If the city is captured, plunder is applied to it using the army's best commander (highest INT + FORCE), and the gains stay in the captured city, which is now yours.                                                                                                                                                                 | P2-1  |

Why it bites: P2-8 **unrest** makes support < 30 risky (revolts), and a second plunder within a
few months pushes a city there. Why it's useful under D7: plunder feeds **war logistics** (P1-11
supply days), and raids **deny the enemy** its development without the cost of holding the city.

### 4.3 War logistics instead of economy tightening (D7)

City income formulas and order costs **stay unchanged**. War costs come from:

- **Supply days** (P1-11): the player picks 10/20/30 days. Food = `days × ceil(troops / 25)`.
  Battle consumption becomes `ceil(living troops / 25)` per day, so supply really runs out.
- **Tactic points** (P2-4): strategists' brainpower is a per-battle resource.
- **Raid supplies** tactic (P2-5): enemy supply becomes a target.
- **Veteran loss:** casualties are permanent and experience levels (P2-7) make veterans worth
  protecting.

### 4.4 Officers, statecraft and diplomacy

| Recommendation        | Change in one line                                                                               | Task  | Effort | Risk |
| --------------------- | ------------------------------------------------------------------------------------------------ | ----- | ------ | ---- |
| Rebalance persuasion  | Lower odds against loyal officers, rulers immune, only half the troops follow.                   | P1-14 | S      | Low  |
| Prisoner decisions    | Recruit, release or **execute** (D5) captives.                                                   | P2-6  | M      | Med  |
| Loyalty consequences  | Officers below 30 loyalty may leave or defect in January and July.                               | P2-11 | S      | Med  |
| Diplomacy with intent | Acceptance depends on shared threats and reputation; the AI proposes; you can break an alliance. | P2-12 | M      | Med  |
| Systemic coalition    | When one faction holds ≥ 10 cities, its neighbors ally against it.                               | P2-12 | M      | Med  |
| Officer traits        | 1–2 traits per named officer.                                                                    | P3-2  | M      | Low  |

### 4.5 Campaign AI (no free resources — D8)

| Recommendation             | Change in one line                                                                       | Task   |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| Frontline logistics        | Interior cities send reserves and officers toward the front.                             | P2-10a |
| Concentration of force     | Two cities attack one target in the same month; keep a garrison.                         | P2-10a |
| Statecraft, raids, plunder | The AI persuades, sows dissent, raids rich neighbors, and plunders cities about to fall. | P2-10b |
| Personalities              | Per-faction policy weights on top of the global aggression slider.                       | P2-10b |
| Opening truce              | Optional; on by default for Cautious.                                                    | P1-15  |

### 4.6 Feedback, UX and onboarding

| Recommendation                                      | Task  |
| --------------------------------------------------- | ----- |
| Split `App.tsx` (2,432 lines) before battle UI work | P1-2  |
| Action outcome previews for every city order        | P1-16 |
| Battle result summary                               | P1-10 |
| Monthly advisor and first-campaign goals            | P3-3  |

### 4.7 Replayability and content

| Recommendation                                        | Task  |
| ----------------------------------------------------- | ----- |
| Random default seed                                   | P1-15 |
| Event system and conditional historical events (D10)  | P3-1  |
| Officer traits                                        | P3-2  |
| Scenario JSON pipeline and a second scenario          | P3-4  |
| Difficulty presets, ruler objectives, Hegemon victory | P3-5  |

### 4.8 Technical risks

| Risk                     | Detail                                                                                                                                        | Mitigation                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Save and ruleset lock-in | `ruleset: z.literal('baye-atlas-1')`, `version: z.literal(1)` (`src/platform/saves.ts:127-128`). Legacy continuation tests hash exact states. | P1-1: ruleset `baye-atlas-2` with a deterministic v1→v2 migration (D9). Regenerate hashes intentionally. |
| Mid-battle v1 saves      | Missing new battle fields.                                                                                                                    | D9: **force-migrate with deterministic defaults** (simplest; one rules path). Listed per task.           |
| RNG stream changes       | New draws shift later outcomes; old seeds won't replay identically.                                                                           | Accepted under v2. Forecasts and queries never draw RNG.                                                 |
| Monolithic UI            | `App.tsx` holds all battle controls.                                                                                                          | P1-2 extracts components first.                                                                          |
| Balance blind spot       | Diagnostics use a passive player.                                                                                                             | P1-13 competent bot plus the battle metrics in §6.                                                       |
| AI cost                  | ZOC plus AI v2 search per unit per tile.                                                                                                      | Budget: auto-resolve < 50 ms per battle on CI; profile in P2-9.                                          |
| Officer "executed" state | New officer fate must be excluded from every officer query.                                                                                   | P2-6 adds a single helper `isActiveOfficer()` and replaces scattered filters.                            |

---

## 5. Phased roadmap with task cards

### 5.0 Recommended order and dependencies

```text
Phase 1:  P1-1 → P1-2 → P1-13 → P1-3 → P1-4 → P1-5 → P1-6 → P1-7 → P1-8
          → P1-11 → P1-12 → P1-14 → P1-16 → P1-10 → P1-9 → P1-15
Phase 2:  P2-1 (needs P1-11, P1-12) → P2-2 → P2-3 → P2-4 → P2-5 (needs P2-4)
          → P2-6 → P2-7 → P2-8 → P2-9 (needs P2-2..P2-5) → P2-10a → P2-10b (needs P2-1, P2-8)
          → P2-11 → P2-12 → P2-13a → P2-13b
Phase 3:  any order; P3-1 needs P2-12 (coalition alliances) for the coalition event
```

**Phase exits:** Phase 1 → human playtest of ≥ 3 manual battles per tester (§6). Phase 2 → a
2-hour campaign playtest plus a diagnostics comparison of Phase 1 and Phase 2 metrics.

---

### Phase 1 — foundations, battle clarity, core 掠夺, war logistics

#### P1-1 · Ruleset v2 and save migration (S)

- **Goal:** make rule changes possible without breaking saves.
- **Spec:**
  - `GameState.ruleset` becomes `'baye-atlas-2'` for new games. `GameState.version` becomes `2`.
    The save envelope keeps `format: 'baye.save'`; `formatVersion` becomes `2`.
  - `decodeSave` accepts v1 and v2. A v1 state passes its v1 schema, then `migrateV1toV2(state)`
    converts it, then the v2 schema and `validateState` run. **Migration must not draw RNG.**
  - Keep a single `MIGRATION_DEFAULTS` section that later tasks extend with their new fields.
  - The IndexedDB database name, slot keys and `baye.*` preference keys stay unchanged.
- **Files:** `src/game/types.ts`, `src/platform/saves.ts`, `src/game/campaign.ts`
  (`createGame`, `validateState`), `tests/saves.test.ts`, `tests/legacy-fixtures.test.ts`.
- **Acceptance:** every fixture in `tests/fixtures/` decodes, migrates and validates. Export →
  import round-trips a v2 game. Legacy continuation tests become "v1 fixture → migrate → run the
  recorded commands → valid state", with new v2 hashes recorded.
- **Tests:** unit.

#### P1-2 · Extract battle UI components (M)

- **Goal:** make battle UI work safe.
- **Spec:** move the battle sidebar from `src/ui/App.tsx` into `src/ui/BattlePanel.tsx`, and the
  march modal into `src/ui/MarchDialog.tsx`. No behavior, text or style change.
- **Acceptance:** existing E2E journeys pass unchanged; no visible difference at the Comfortable
  preset.
- **Tests:** `npm run test:e2e`.

#### P1-13 · Competent-player bot and battle metrics (M)

- **Goal:** measure balance the way a real player experiences it.
- **Spec:**
  - `tools/player-bot.ts` (or `.mjs`, matching the diagnostics tooling) issues player commands
    each month. It searches when free officers are present; recruits and musters; persuades
    adjacent enemy officers when the chance is ≥ 50%; marches when weighted power exceeds the
    target's by 1.2×; and auto-resolves its battles.
  - Add an optional `BattleObserver` (like `CampaignObserver`) that counts actions by type, the
    battle length, how each battle ended (camp capture, elimination, timeout, retreat) and
    supply shortages. It must not affect state or RNG (same proof approach as `ai-balance.md`).
  - Add `--bot` to `tools/ai-diagnostics.mjs` and write the §6 metrics into the JSON output.
- **Files:** `tools/ai-diagnostics.mjs`, new `tools/player-bot.*`, `src/game/battle.ts`
  (observer hooks), `src/game/aiPolicy.ts` (observer types).
- **Acceptance:** deterministic per seed. Observer-on and observer-off runs produce identical states.
- **Tests:** unit (observer neutrality) and a simulation run.

#### P1-3 · Attack and tactic forecast (S)

- **Spec:**
  - Refactor normal-attack damage into a pure `normalDamage(battle, source, target, variation)`
    and fire damage into `fireDamage(battle, source, target, variation)`. `attack()` and `skill()`
    call them with the RNG-drawn variation (normal 88–112, fire 90–110, as today).
  - Add pure `forecastAttack(battle, sourceId, targetId)` →
    `{ min, max, lethal, counterMin, counterMax }` (counter fields from P1-6; 0 until then), and
    `forecastSkill(battle, sourceId, skill, targetId)` → casualty range for Fire, success % for
    Confuse, morale gain for Rally.
  - UI: show the range on each target button and in a tooltip when hovering an enemy in range
    (e.g. "≈ 230–290 casualties · counter ≈ 60–80").
- **Files:** `src/game/battle.ts`, `src/ui/BattlePanel.tsx`, `src/rendering/GameMap.tsx`, i18n.
- **Acceptance:** for 100 seeded attacks, the actual casualties fall inside the forecast range.
  RNG and state are unchanged after calling any forecast.
- **Tests:** unit (property test).

#### P1-4 · Enemy threat overlay (S)

- **Spec:** pure `getThreatTiles(battle, side)` returns the union, over living enemy units that
  aren't confused, of tiles within attack range of any tile they can reach next turn (using
  `getReachableTiles` logic, ignoring `moved`/`acted`). Add a toggle button ("Show enemy reach")
  and a Pixi overlay. No color-only meaning: use a hatch pattern too.
- **Files:** `src/game/battle.ts`, `src/rendering/GameMap.tsx`, `src/ui/BattlePanel.tsx`, i18n.
- **Acceptance:** the overlay matches the query in tests; it can be toggled during any battle;
  reduced motion has no effect on it.
- **Tests:** unit plus manual.

#### P1-5 · Center-out deployment (S)

- **Spec:** units deploy in rows `[5, 4, 6, 3, 7, 2, 8, 1, 9, 0]` in roster order. Attackers stay
  at x = 1, defenders at x = width − 2. The militia takes the next free row. Camps stay at
  (0, 5) and (11, 5), and camp capture stays instant (D4).
- **Files:** `src/game/battle.ts` (`makeUnit`, militia creation in `createBattle`).
- **Acceptance:** with 1–10 units per side, the first unit occupies row 5, no unit spawns on a camp
  or water, and existing saved battles keep their stored positions.
- **Tests:** unit.

#### P1-6 · Counterattack 反击 (S)

- **Spec:**
  - After a normal attack resolves, if the target survives, isn't confused, and
    `distance(target, source) <= range(target)`, the target counterattacks once:
    `floor(normalDamage(target → source) × COUNTER_RATE)`, minimum 10.
    `COUNTER_RATE` = 0.5 (0.7 if the target is Guard). It uses one RNG variation draw.
  - Counters don't trigger counters, don't consume the target's action, and never answer
    tactics. Check the outcome after the counter (the attacker can be destroyed).
  - Archers attacking from distance ≥ 2 therefore take no counter from melee units.
  - Log: "`{target}` counterattacks: `{n}` casualties." The forecast (P1-3) fills in the counter fields.
  - Tactical AI: when several targets are in range, choose the one that maximizes
    `forecast mid damage − forecast mid counter` (prefer lethal hits).
- **Files:** `src/game/battle.ts`, `src/ui/BattlePanel.tsx`, i18n.
- **Acceptance:** tests cover: counter happens; no counter at out-of-range distance; none when the
  target dies; none from a confused target; none against tactics; attacker death from a counter
  ends the battle correctly.
- **Tests:** unit; simulation — median battle length 4–15 days with the P1-13 bot.

#### P1-7 · Tactic gating (S)

- **Spec:**
  - Requirements: **Fire INT ≥ 60, Confuse INT ≥ 70, Rally INT ≥ 50 or FORCE ≥ 85.**
  - Tactic range: **3** for archers and for any unit with INT ≥ 80; **2** otherwise.
  - Militia/garrison units can't use tactics.
  - Pure `getAvailableTactics(battle, unitId)` → `{ skill, allowed, reason, range }[]`, used by
    the UI (disabled buttons show the reason) and by validation in `processBattleCommand`.
  - The tactical AI keeps its stricter thresholds (75/85) and must respect range.
- **Files:** `src/game/battle.ts`, `src/ui/BattlePanel.tsx`, i18n.
- **Acceptance:** disallowed commands are rejected atomically with the reason; no AI tactic call is
  ever rejected (assert in simulation).
- **Tests:** unit.

#### P1-8 · Weather forecast (S)

- **Spec:** add `BattleState.nextWeather`. `createBattle` rolls `weather`, then `nextWeather`.
  `finishDay` sets `weather = nextWeather`, then rolls a new `nextWeather`. The sidebar shows
  "Tomorrow: Rain". Migration default: `nextWeather = weather`.
- **Files:** `src/game/types.ts`, `src/game/battle.ts`, `src/platform/saves.ts`, `BattlePanel.tsx`, i18n.
- **Acceptance:** tomorrow's displayed weather always equals the next day's weather.
- **Tests:** unit.

#### P1-11 · War logistics: supply days (M)

- **Goal:** make supply a real constraint (D7) without touching city income or order costs.
- **Spec:**
  - The `march` command gains `supplyDays: 10 | 20 | 30` (default 20 when omitted).
    Food committed = `supplyDays × ceil(totalTroops / SUPPLY_DIVISOR)`, with
    `SUPPLY_DIVISOR = 25`. The old `ceil(troops × 0.65) + 200` is removed.
  - Battle food consumption per day becomes `ceil(livingTroops / SUPPLY_DIVISOR)` for both sides.
    The shortage behavior is unchanged (12% desertion, −15 morale).
  - The defender still uses the city's food store (unchanged).
  - March dialog: three buttons for 10/20/30 days showing the food cost, and a warning when the
    source city's food after departure < 1 month of upkeep.
  - Battle sidebar: "Supplies: N days left" for both sides.
  - AI: conquest marches use 20 days. Update `attackSafeguards` in `src/game/aiPolicy.ts` to the
    new cost.
  - Migration: v1 battles keep their stored `attackerFood`; only consumption changes.
- **Files:** `src/game/campaign.ts` (`march`), `src/game/battle.ts` (`finishDay`),
  `src/game/aiPolicy.ts`, `src/ui/MarchDialog.tsx`, `BattlePanel.tsx`, i18n, `docs/implementation.md`.
- **Acceptance:** food formula fixtures; an attacker with 10 days of supply starts deserting on day 11;
  AI provision-shortage executions stay < 2% in the diagnostics matrix.
- **Tests:** unit plus simulation. [calc] For reference: 2,000 troops × 20 days = 1,600 food (similar
  to today's 1,500), but now it is actually used.

#### P1-12 · 掠夺 Plunder own city (M)

- **Spec:**
  - Add `'plunder'` to `Action`. ACTIONS entry: label "Plunder the city" (掠夺), 0 gold, 20
    stamina. Description: "Seize gold and food from the people. Halves public support, farming and
    commerce."
  - New UI group **"Harsh measures"** (严政) in `GROUPS` (`src/ui/App.tsx:111`), styled as a
    warning.
  - Add the pure `plunderOutcome(city, leader)` from §4.2 →
    `{ gold, food, after: { loyalty, farming, commerce, population } }`, used by the preview and
    by execution.
  - Eligibility (`actionInfoFor`): city support ≥ 10 ("The people have nothing left to take."), and
    `state.turn >= city.plunderCooldownUntil` ("This city was plundered recently. It can be
    plundered again in N months.").
  - Effects: gains added to this city (bounded by `RESOURCE_CAP`); city damage per §4.2; every
    serving officer in the city −3 loyalty; `plunderCooldownUntil = turn + 3`; chronicle entry
    marked `'bad'`.
  - New field `City.plunderCooldownUntil: number` (migration default 0; validated as an integer ≥ 0).
  - The AI does **not** plunder in Phase 1.
  - The preview panel shows the exact gold and food gains and the before → after of support,
    farming, commerce and population.
- **Files:** `src/game/types.ts`, `src/game/campaign.ts`, `src/platform/saves.ts`,
  `src/ui/App.tsx` (or the extracted city panel), `src/i18n/*.zh.ts`, `docs/implementation.md`.
- **Acceptance:** the §4.2 example reproduces exactly; preview = result; halving uses floor;
  rejection cases are atomic; save round-trip keeps the cooldown.
- **Tests:** unit (formula fixtures, cooldown, rejection) plus manual.

#### P1-14 · Persuasion rebalance (S)

- **Spec:** sworn-officer chance =
  `clamp(floor(30 + 0.5·INT − 0.7·loyalty + (captive ? 20 : 0)), 5, 75)`. Free officers are
  unchanged. **Rulers can't be persuaded** (an officer whose `name` equals their faction's
  `leader`). On success only `floor(troops / 2)` join the receiving reserve; the rest return to
  the target's former city reserve. Show the success chance in the persuade target list (pure query).
- **Files:** `src/game/campaign.ts`, city panel UI, i18n.
- **Acceptance:** [calc] Cao Cao → Lü Bu from Chenliu ≈ 36% (was ≈ 59%). Ruler rejection reason
  is shown. Updated persuasion tests.
- **Tests:** unit.

#### P1-16 · Action outcome previews (S)

- **Spec:** pure `getActionPreview(state, action, cityId, officerId)` returns the min–max change
  for each affected stat, using the RNG ranges in the formulas (e.g. Cao Cao farming: +65 to +92;
  Search: the join chance %). The action panel shows it under the cost.
- **Files:** `src/game/campaign.ts`, city panel UI, i18n.
- **Acceptance:** each action's actual result lies within its preview in seeded tests.
- **Tests:** unit.

#### P1-10 · Advance to contact and battle summary (S)

- **Spec:**
  - "Advance to contact" button: the UI issues `battleEndDay` repeatedly (each command still
    validated and autosaved) until any enemy unit is within reach (P1-4 threat tiles cover a
    player unit or vice versa), the battle ends, or 10 days pass. No new engine command.
  - Battle summary: in `applyBattleAftermath`, store `state.lastBattle =
{ orderId, targetId, attackerId, defenderId, outcome, days, casualties: { attacker, defender },
intent, captured: [] }`. `captured` is filled in P2-6. Migration default: `null`. The UI shows
    a summary modal when `lastBattle.orderId` changes.
  - The existing **Auto-resolve** button (`App.tsx:1315`) keeps working for the remainder of a battle.
- **Files:** `src/ui/BattlePanel.tsx`, `src/game/campaign.ts`, `src/game/types.ts`,
  `src/platform/saves.ts`, i18n.
- **Acceptance:** Advance to contact stops correctly in tests driven through `dispatch`; the
  summary's numbers match unit troop deltas.
- **Tests:** unit plus E2E.

#### P1-9 · Combat feel (M)

- **Spec (presentation only):** the renderer compares the previous and next battle snapshot. It
  tweens moved units (≤ 300 ms), flashes damaged units, floats `−N` numbers, fades destroyed units,
  and shakes lightly on counters. Add sound cues in `src/platform/audio.ts`: attack, counter, fire,
  rally, confuse, victory, defeat. Reduced motion disables tweens and shakes but keeps numbers.
  Rules never wait on animations; input is never blocked for more than 300 ms.
- **Files:** `src/rendering/GameMap.tsx`, `src/platform/audio.ts`, `src/ui/display.ts`.
- **Acceptance:** 30 fps on the test machine; skipping animation never changes state.
- **Tests:** manual plus an E2E smoke run.

#### P1-15 · New-campaign options: random seed and opening truce (S)

- **Spec:** the seed defaults to a random 32-bit value generated in the UI
  (`crypto.getRandomValues`), never in the core. The seed field moves under "Advanced". Add an
  "Opening truce (2 months)" checkbox, on by default for Cautious and off otherwise. It stores
  `state.truceUntilTurn` (migration default 0), and `planAi` makes no marches while
  `state.turn < truceUntilTurn`.
- **Files:** `src/ui/App.tsx` (start modal), `src/game/campaign.ts`, `src/game/types.ts`,
  `src/platform/saves.ts`, i18n.
- **Acceptance:** two new campaigns differ; an entered seed reproduces a game; no AI march before
  the truce ends.
- **Tests:** unit plus E2E.

---

### Phase 2 — core depth

#### P2-1 · Raid and sack: 掠夺 against other cities (M)

- **Spec:**
  - `AttackOrder.intent: 'conquer' | 'raid' | 'sack'` (migration default `'conquer'`).
    `GameCommand.march` gains optional `intent`. The march dialog offers Conquer / Sack / Raid
    with one-line explanations.
  - **Raid:** valid against any adjacent city that isn't owned or allied, including independent
    cities. Supply is fixed at 10 days. Rejected if the target is under plunder cooldown.
    At resolution (`resolveOrders`):
    - If the target has **no soldiers** (no serving officer with troops > 0 and `reserve === 0`):
      no battle. Apply `plunderOutcome` with the raid leader (the highest INT + FORCE commander);
      add the gains to the source city; the commanders stay in the source city.
    - Otherwise: create a battle with `BattleState.dayLimit = 10`, so the defenders win if they hold
      10 days. Add `dayLimit` to `BattleState` (migration default 30) and use it in `finishDay`
      instead of the literal 30.
    - Raid aftermath, if the attacker wins: **no ownership change**. Apply the defenders' casualties
      as usual, then plunder the target; gains go to the source city (or to the refuge city if the
      source was lost). Attacking survivors return to the source. Defending officers stay in the
      city; they are neither captured nor forced to flee, except via P2-6 battlefield capture.
    - If the attacker loses: the existing retreat logic applies.
    - Monthly report: new event kind `'raid'` (`cityId`, `attackerId`, `gold`, `food`, `fought`),
      shown when the player is involved or the target borders the player.
  - **Sack:** a normal conquest. If the city is captured, apply `plunderOutcome` to the captured
    city using the best commander; gains stay in that city. Set the cooldown. Log and report entry.
- **Files:** `src/game/types.ts`, `src/game/campaign.ts` (`march`, `resolveOrders`,
  `applyBattleAftermath`), `src/game/battle.ts` (`dayLimit`), `src/game/reports.ts`,
  `src/platform/saves.ts`, `src/ui/MarchDialog.tsx`, i18n.
- **Acceptance:** tests cover a raid with no soldiers (no battle), a raid with only reserves (a
  militia battle happens), a raid win (no capture, gains at source), a raid loss, sack on capture,
  the cooldown rejection, and a raid battle interrupted by reload (gains applied exactly once).
- **Tests:** unit plus save/reload.

#### P2-2 · Zone of control 控制区 (M)

- **Spec:**
  - A tile orthogonally adjacent to a living enemy unit is a ZOC tile for the moving unit. In
    `paths()` with `zoc: true`, entering a ZOC tile ends that path; it can't be expanded further.
    A unit that starts its move in ZOC may move away normally.
  - **Cavalry** may pass through one ZOC tile per move (track this in the Dijkstra state).
  - The enemy camp tile can always be entered if reached.
  - `getReachableTiles` uses `zoc: true`. The AI's long-range route planning uses `zoc: false`,
    then truncates the chosen path at the first ZOC tile within the move budget.
- **Files:** `src/game/battle.ts`, `src/rendering/GameMap.tsx` (reachable highlights mark ZOC
  stop tiles).
- **Acceptance:** pathfinding tests for entering, leaving and the cavalry exception. In bot
  diagnostics, battles won by camp capture on day ≤ 3 are < 10%.
- **Tests:** unit plus simulation.

#### P2-3 · Morale states and flanking (M)

- **Spec:**
  - Lower the morale floor from 15 to 5 (`damageUnit`).
  - **Wavering** (morale < 40): normal damage ×0.85, no tactics. **Routed** (morale < 20): can
    only move or hold; takes ×1.2 normal damage. Both states are derived from morale, with no new
    status field, and shown as badges.
  - **Flanking:** +10% normal damage for each other unit of the attacker's side adjacent to the
    target, up to +30%. This is included in the forecast.
  - **Morale shock:** when a unit is destroyed, its allies within 2 tiles lose 10 morale and
    enemies within 2 tiles gain 5.
  - **Recovery:** at day end, units with food (no shortage) that weren't damaged that day gain
    3 morale.
  - Rally can lift a unit out of rout.
- **Files:** `src/game/battle.ts`, `BattlePanel.tsx`, `GameMap.tsx` (badges), i18n.
- **Acceptance:** unit tests for each threshold and the flank cap; the forecast includes flanking.
- **Tests:** unit plus manual.

#### P2-4 · Tactic points 计策点 (M)

- **Spec:** `BattleState.tacticPoints: { attacker: number; defender: number }`. Start value =
  `min(30, Σ floor(INT / 10))` over that side's officer units (militia excluded). +2 per side at
  each day end, capped at 30. Costs: **Fire 4, Confuse 3, Rally 2**; P2-5 tactics are listed there.
  Show a meter, and disable unaffordable tactics with a reason. The AI only casts when it can afford
  it and keeps 2 points in reserve for Rally. Migration: compute the start value from the current
  living units.
- **Files:** `src/game/types.ts`, `src/game/battle.ts`, `src/platform/saves.ts`, `BattlePanel.tsx`, i18n.
- **Acceptance:** points never go negative; costs are deducted atomically; AI casts are never rejected.
- **Tests:** unit.

#### P2-5 · New tactics 计谋 (M; split per tactic if needed)

All new tactics are **deterministic in success** (D3). They use the existing damage variation only
where damage is dealt.

| Tactic                 | Requirement and cost                                                                    | Effect                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **劫粮 Raid supplies** | INT ≥ 60 **or** cavalry; 4 TP; target an enemy unit within tactic range                 | The enemy side loses `max(100, floor(target.troops × 0.5))` battle food (not below 0); the caster's side gains half of the food actually removed. |
| **伏兵 Ambush**        | Caster stands in forest and hasn't moved today; INT ≥ 60; 3 TP; an enemy within range 2 | A normal attack with ×1.4 damage and **no counter**.                                                                                              |
| **落石 Rockfall**      | Caster on a hill; INT ≥ 65; 4 TP; target within 2 tiles and not on a hill               | Damage `caster.troops × 0.18 × max(0.35, (INT + 30) / (targetINT + 55))`, ignoring terrain defense; target −10 morale.                            |

- **Files:** `src/game/types.ts` (skill union), `src/game/battle.ts`, `src/platform/saves.ts`
  (skill enum), `BattlePanel.tsx`, i18n.
- **Acceptance:** each tactic has a forecast, a precondition check with a reason, and tests. The AI
  uses each one in ≥ 5% of eligible situations in diagnostics.
- **Tests:** unit plus simulation.

#### P2-6 · Officer capture in battle and prisoner decisions (M)

- **Spec — capture (deterministic, no battle deaths, D5):** when an officer unit's troops reach 0,
  its officer is **captured** if (a) the killing blow was a normal attack or counter from an
  adjacent unit, or (b) every orthogonal neighbor tile is enemy-occupied, impassable for that unit,
  or off-map. Otherwise the officer **escapes** (as today, with 0 troops). Record captures in
  `BattleUnit.capturedBy?: 'attacker' | 'defender'`.
- **Aftermath:** a captured officer becomes `captive: true` (keeping their `factionId`, as existing
  prisoners do). They are held in the target city if the captor's side holds it after the battle,
  otherwise in the captor's source or refuge city. Fill `lastBattle.captured`.
- **Prisoner decisions:** new command
  `{ type: 'prisoner'; cityId; prisonerId; decision: 'release' | 'execute' }`. It needs no officer
  action; it is a ruler's decision.
  - **Release:** the officer returns to the nearest city of their faction, or becomes unaffiliated
    if none exists. Loyalty of your officers in that city +2.
  - **Execute:** sets the new field `Officer.fate = 'executed'` (migration default `'active'`).
    Your serving officers in that city lose 2 loyalty. Executed officers are excluded from every
    query through a new helper `isActiveOfficer()` (serving lists, search, persuade, battle
    creation, AI, reports, portrait rosters).
  - **Recruit:** the existing Persuade action (prisoner bonus +20).
  - Prisoner panel in the city view lists captives with the three options.
- **Files:** `src/game/battle.ts`, `src/game/campaign.ts`, `src/game/types.ts`,
  `src/platform/saves.ts`, city panel UI, i18n.
- **Acceptance:** capture rules tested for both conditions and the escape case; aftermath applied
  exactly once across reload; executed officers never appear in any list or battle.
- **Tests:** unit plus save/reload.

#### P2-7 · Experience levels (S)

- **Spec:** `Officer.level` (0–5) = `min(5, floor(experience / 100))`. When the level rises
  (in aftermath or drilling), grant +2 intellect for archers and +2 force for others, once per
  level (caps 100/105 still apply). Level ≥ 3 lowers that officer's tactic INT requirements by 10.
  Show the level on portraits and in the roster. Migration: `level = min(5, floor(experience/100))`,
  with no retroactive stats.
- **Files:** `src/game/types.ts`, `src/game/campaign.ts`, `src/game/battle.ts`, `src/platform/saves.ts`, UI.
- **Acceptance:** stats are granted once per level; migration doesn't grant stats.
- **Tests:** unit.

#### P2-8 · Unrest and revolt (S)

- **Spec:** in `finishMonth`, after support changes, for each owned city with support < 30, draw
  `random(100) < (30 − support) × 2`. On a revolt: reserve −20%, gold −30%, chronicle `'bad'`,
  and a monthly report event `'revolt'`. If support < 10 **and** the city has no serving officers,
  the city becomes independent (`factionId = null`, governor cleared). Draw RNG only for cities
  below 30, to keep the stream stable.
- **Files:** `src/game/campaign.ts`, `src/game/reports.ts`, `src/platform/saves.ts` (report enum), i18n.
- **Acceptance:** [calc] a city plundered once (72 → 36) never revolts; plundered twice (→ 18) has a
  24% monthly revolt chance. Tests use fixed RNG states.
- **Tests:** unit plus simulation.

#### P2-9 · Tactical AI v2 (M)

- **Spec (deterministic):**
  - For each unit, score every (reachable tile × action) pair:
    `score = forecastMid(dealt) − 0.8 × forecastMid(counter) − 0.5 × threatAt(tile) + 2 × target.troops if lethal`.
    `threatAt` is the sum of the forecast mid damage enemies could deal to this unit there next day.
  - **Camp guard:** if an enemy is within 8 tiles of its own camp, keep the healthiest guard or
    infantry unit within 1 tile of the camp.
  - **Retreat:** units below 25% of their initial troops move toward their own camp unless they can
    make a lethal attack.
  - **Defender hold:** when defending and its total troops are below the attacker's, stay within 3
    tiles of the camp and let the day limit work.
  - Rally an adjacent ally (morale < 60) before that ally attacks. Respect TP, gating, ZOC and routing.
  - Keep v1 available as `tacticalAi: 'v1'` for comparisons.
- **Files:** `src/game/battle.ts`.
- **Acceptance:** v2 beats v1 in ≥ 60% of mirrored equal-strength battles; auto-resolve stays
  < 50 ms per battle on CI.
- **Tests:** simulation plus a benchmark.

#### P2-10a · Campaign AI: logistics and concentration (M)

- **Spec:** AI cities with no non-allied neighbors move reserves above 500 and one officer per
  month to the neighboring owned city that is closest to a front, using `transfer` and keeping at
  least one officer. When two AI cities border the same target, both may march in the same month
  if their **combined** weighted power passes `attackWilling`. Each source keeps ≥ 40% of its
  strength.
- **Files:** `src/game/campaign.ts` (`planAi`), `src/game/aiPolicy.ts`.
- **Acceptance:** diagnostics show AI transports > 0 and joint attacks > 0, with no rise in
  provision shortages.
- **Tests:** unit plus simulation.

#### P2-10b · Campaign AI: statecraft, raids, plunder, personalities (M)

- **Spec:**
  - **Persuade** when the chance is ≥ 45% and the target leads ≥ 1,000 troops. **Sow dissent**
    against a player border city with support ≥ 60 when not attacking that month.
  - **Raid** when conquest isn't willing but `power > 1.2 × target strength` and the target is
    the neighbor with the most `commerce + farming`.
  - **Plunder own city** when it is "about to fall": the strongest adjacent non-allied strength is
    > 1.8× the city's own strength and the city isn't on cooldown.
  - **Personalities:** `FACTION_POLICY` in `aiPolicy.ts` with these fields: `aggressionOffset`
    (added to the multiplier), `raidBias`, `plunderAllowed`, `diplomacyBias`, `musterBonus`
    (troop target ×), `targetPreference`. Suggested values:
    - Dong Zhuo: aggression −0.2, plunder allowed, high raid bias.
    - Liu Bei: plunder never, diplomacy +15.
    - Sun Jian: prefers water-adjacent targets.
    - Yuan Shao: muster ×1.2, attacks only at 1.2× the threshold.
    - Liu Yan: aggression +0.3 (defensive).
    - Cao Cao: prefers low-support targets.
  - These combine with the global Cautious/Balanced/Aggressive slider. **No resource bonuses (D8).**
- **Files:** `src/game/campaign.ts`, `src/game/aiPolicy.ts`, `docs/ai-balance.md`.
- **Acceptance:** diagnostics show each behavior > 0 and distinct per-faction action mixes;
  provision shortages < 2%.
- **Tests:** unit plus simulation.

#### P2-11 · Loyalty-based departure (S)

- **Spec:** in January and July, each serving non-ruler officer with loyalty < 30 draws
  `random(100) < 30 − loyalty`. On success, their troops go to the city reserve. They defect to the
  adjacent enemy faction holding the most cities (moving to that faction's adjacent city), or
  become unaffiliated if no enemy is adjacent. The monthly report lists your officers with
  loyalty < 40 as "at risk".
- **Files:** `src/game/campaign.ts`, `src/game/reports.ts`, UI, i18n.
- **Acceptance:** happens only in January/July; deterministic; reported.
- **Tests:** unit.

#### P2-12 · Diplomacy with intent and systemic coalition (M)

- **Spec:**
  - Alliance chance = `40 + floor(INT/2)`, +20 if both sides border the strongest faction (by
    cities) and neither is it, −30 if the target is the strongest, −20 if the proposer broke an
    alliance within 12 turns. Clamped to 5–90 and **shown before proposing** (pure query).
  - New command `breakAlliance { factionId }`. It ends the alliance immediately and records
    `state.reputation[factionId].brokeAllianceTurn`.
  - The AI proposes alliances at most once per 3 months to a non-strongest neighbor when both
    border the strongest faction.
  - **Coalition (systemic, D10):** at month end, if a faction holds ≥ 10 cities, every other
    active **AI** faction that borders it gets a 6-month mutual alliance, renewed while the
    condition holds. The AI scales its attack multiplier against the leader by ×0.8. The player is
    never auto-enrolled. If the player is the leader, the coalition targets the player.
- **Files:** `src/game/campaign.ts`, `src/game/types.ts`, `src/game/aiPolicy.ts`,
  `src/platform/saves.ts`, `src/game/reports.ts`, UI, i18n.
- **Acceptance:** with the bot, a coalition forms in > 50% of runs where the bot reaches 10 cities;
  the alliance odds shown match execution.
- **Tests:** unit plus simulation.

#### P2-13a · City battlefield profiles (M)

- **Spec:** add `City.battlefield: 'plains' | 'river' | 'mountain' | 'forest'` to the scenario
  data (content, not save state). Suggested mapping:
  - river: Jiangxia, Chaisang, Jianye, Wu, Shouchun, Jiangling
  - mountain: Hanzhong, Zitong, Tianshui, Jiangzhou
  - forest: Chengdu, Xiangyang, Wancheng
  - plains: the rest

  `createBattle` uses a per-profile generator: river = wider water with 2 fords; mountain = more
  hills and a narrow pass; forest = 35% forest; plains = today's template. After generation, verify
  that every troop type can reach the enemy camp over land; otherwise fall back deterministically to
  plains. Saved battles keep their stored terrain.

- **Files:** `src/content/scenario.ts`, `src/game/battle.ts`, `src/rendering/GameMap.tsx` (terrain art).
- **Acceptance:** a connectivity property test across 1,000 seeds per profile; profiles are visually
  distinct.
- **Tests:** unit plus manual.

#### P2-13b · Walls and gates (M)

- **Spec:** when the target's defense ≥ 60, column x = 8 becomes `'wall'` except rows 4–5, which
  become `'gate'`. Walls: passable only by defenders (cost 1); defenders on walls take ×0.6 normal
  damage. Gates: passable by both sides (cost 2), with ×0.75 damage taken. Ranged attacks and
  tactics work across walls. Add the new terrain values to the types and Zod enum.
- **Files:** `src/game/types.ts`, `src/game/battle.ts`, `src/platform/saves.ts`, `GameMap.tsx`, i18n.
- **Acceptance:** pathfinding and damage tests; investing in defense visibly changes battles.
- **Tests:** unit plus manual.

---

### Phase 3 — content and replayability

| ID       | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Files                                                                             | Acceptance                                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **P3-1** | **Event system with conditional historical events (D10).** Data-driven `events` list: `{ id, once: true, conditions: [...], effects: [...] }`. An event fires **only when every condition holds**; nothing is forced. Examples: **反董卓联盟** — year ≤ 191, Dong Zhuo holds Luoyang, ≥ 3 other active factions → those AI factions ally against Dong for 6 months, and the player receives an invitation (accept = alliance with all members). **董卓焚洛阳** — Dong holds Luoyang **and** Chang'an, and an enemy army attacked Luoyang in the last 2 months or Luoyang is "about to fall" (P2-10b test) → Dong plunders Luoyang (plunder rules) and moves its officers to Chang'an. Plus ≥ 8 systemic events (plague, bumper harvest, locusts, bandits, wandering officer, officer comes of age…). | new `src/game/events.ts`, `scenario.ts`, `campaign.ts`, `reports.ts`, saves, i18n | Events are deterministic and saved (`firedEvents`); each one is triggered in a test; none fires with a missing condition. |
| **P3-2** | **Officer traits:** 1–2 per named officer, e.g. 仁德 benevolent (−8 loyalty when their city is plundered, +persuasion), 勇猛 fierce (+10% counter), 智谋 cunning (−1 TP cost), 忠义 loyal (persuasion chance against them halved, never defects), 贪婪 greedy (+20% plunder gold).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `scenario.ts`, `campaign.ts`, `battle.ts`, UI, i18n                               | Every trait has a tooltip and a test.                                                                                     |
| **P3-3** | **Monthly advisor and first-campaign goals.** Up to 3 suggestions per month (food shortfall, officer at risk, weak border, idle officer); optional goals for the first 6 months.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | new `src/game/advisor.ts` (pure query), UI, i18n                                  | Suggestions are pure and RNG-free; goals are tracked in the report.                                                       |
| **P3-4** | **Scenario JSON pipeline and a second scenario** (200 官渡之战), as proposed in `architecture.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `src/content/`, saves, start screen                                               | Both scenarios validate; saves identify their scenario.                                                                   |
| **P3-5** | **Difficulty presets, ruler objectives, Hegemon victory.** Presets combine aggression, personalities and truce — **never resource bonuses (D8)**. Hegemon victory: hold Luoyang plus 16 cities for 12 months.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `campaign.ts`, start screen                                                       | Presets are documented; objectives are tracked.                                                                           |
| **P3-6** | **Troop reorganization:** a city order to change an officer's troop type (cost 150 gold, −20% of that officer's troops as retraining loss).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `campaign.ts`, UI                                                                 | The cost is shown; types are validated.                                                                                   |
| **P3-7** | **Aging and natural death:** an optional setting, **off by default**. Not a battle death (D5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `campaign.ts`, settings                                                           | Deterministic; off by default.                                                                                            |
| **P3-8** | **Fog of war** for enemy cities: troops shown as ranges unless scouted within 2 months. This gives Scout a purpose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | UI-wide, `campaign.ts` (scout memory)                                             | Exact values are hidden until scouted; the AI is unaffected.                                                              |

---

## 6. Metrics and playtest checklist

### Automated metrics (P1-13 bot plus diagnostics)

| Metric                                                          | Healthy target (initial)                            |
| --------------------------------------------------------------- | --------------------------------------------------- |
| Median battle length (days)                                     | 5–12; < 10% end by the day limit                    |
| Battles won by camp capture on day ≤ 3                          | < 10%                                               |
| Action mix in battles (attack / tactic / move-only)             | No single action > 60%                              |
| Upsets (the side with fewer troops wins)                        | 15–30%                                              |
| Close battles (winner keeps < 50% of starting troops)           | ≥ 30%                                               |
| Battles where a side ran out of supply                          | 5–20%                                               |
| Player marches choosing 10 or 30 supply days (not the default)  | ≥ 25% (shows supply is a real choice)               |
| Plunder, raid or sack used by the bot                           | Used, but in < 15% of eligible city-months          |
| Raids that triggered a battle                                   | 40–80%                                              |
| AI provision-shortage executions                                | < 2%                                                |
| Months to unify (bot, Balanced)                                 | 48–96; at least one coalition in > 50% of long runs |
| Officers captured on the battlefield per campaign (player side) | 3–15                                                |
| Auto-resolve time per battle                                    | < 50 ms on CI                                       |

### Human playtest checklist (each phase exit)

- [ ] Before attacking, I could predict roughly how many casualties I'd cause and take.
- [ ] I used terrain, a tactic, flanking or a counterattack on purpose to win at least one battle.
- [ ] I lost or nearly lost a battle I expected to win, and understood why.
- [ ] I chose not to attack because of a counterattack or threat warning.
- [ ] Choosing supply days mattered at least once (ran short, or cut a siege short).
- [ ] I considered 掠夺 (plunder, raid or sack) and used it or rejected it for a clear reason.
- [ ] A plundered city's ruin and unrest felt like a real cost.
- [ ] I captured or lost an officer on the battlefield and made a prisoner decision.
- [ ] Rival factions behaved differently from each other.
- [ ] I never clicked "End day" more than 5 times in a row with nothing to do.
- [ ] Rating 1–5: "I wanted to play one more month" / "one more battle".

---

## 7. Designer decisions (resolved October 20, 2026)

| ID      | Question                | Decision                                                                                                                                                                                          | Where applied            |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **D1**  | 掠夺 fidelity vs. fun   | **Scaled Atlas version** (§4.2). The original shape (halving) is kept; gains are scaled to this economy.                                                                                          | P1-12, P2-1              |
| **D2**  | Plunder of enemy cities | **Yes.** Sack on capture, plus **raid without capture**. A raid **fights whenever the target has soldiers** (officers with troops or reserves); an undefended city is plundered without a battle. | P2-1                     |
| **D3**  | More battle randomness  | **Not now.** Keep the current damage variation and the existing Confuse chance; new tactics are deterministic. Crits and tactic failure go to the backlog.                                        | P2-5, §8                 |
| **D4**  | Camp capture            | **Keep instant capture** (lowest effort). The rush is addressed by center-out deployment (P1-5) and ZOC (P2-2). A camp with HP is in the backlog.                                                 | P1-5, P2-2, §8           |
| **D5**  | Officer death           | **No deaths in battle.** Officers can be captured and then **executed** by their captor.                                                                                                          | P2-6, P3-7               |
| **D6**  | Duels                   | **Backlog.**                                                                                                                                                                                      | §8                       |
| **D7**  | Economy tightening      | **No tightening of city income or order costs.** Scarcity comes from war: supply days, battle food, tactic points, veterans.                                                                      | P1-11, P2-4, P2-5, §4.3  |
| **D8**  | AI fairness             | **No free resources at any difficulty.**                                                                                                                                                          | All AI tasks, P3-5       |
| **D9**  | v1 save compatibility   | **Whatever is easier while staying enjoyable** → force-migrate v1 saves (including mid-battle) to v2 with deterministic defaults, keeping a single rules path.                                    | P1-1 and every new field |
| **D10** | Historical events       | **Never forced.** A historical event fires only when all its historical conditions are true in the current game. The systemic coalition (P2-12) isn't scripted history.                           | P2-12, P3-1              |

---

## 8. Backlog (later to-do; out of scope until moved into a phase)

| Item                        | Notes                                                                                                                                                               | Source |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Battle randomness**       | Critical hits, tactic failure chances, morale-based miss chance.                                                                                                    | D3     |
| **Duels 单挑**              | A high-force officer challenges an adjacent enemy officer; accept/decline; short animated rounds; the loser's unit loses morale and may be captured (no death, D5). | D6     |
| **Camp as a structure**     | Camp HP, or "hold the camp for one full day" instead of instant capture.                                                                                            | D4     |
| **Economy tightening**      | Lower gold/food income or higher order costs; occupation income penalty; recruiting lowers farming; seasonal modifiers.                                             | D7     |
| **Wounded soldiers**        | Part of the casualties return after a battle (would ease war scarcity).                                                                                             | —      |
| **Officer death in battle** | Explicitly excluded by D5; listed only so it isn't re-proposed without a decision.                                                                                  | D5     |

---

_Sources read: README.md, docs/architecture.md, docs/roadmap.md, docs/v0.1-improvement-plan.md,
docs/ai-balance.md, docs/reference-baseline.md, docs/implementation.md, src/game/{battle,campaign,
types,aiPolicy}.ts, src/content/scenario.ts, src/app/session.ts, src/platform/saves.ts (schema),
tests/legacy-fixtures.test.ts, and parts of src/ui/App.tsx, src/ui/battlePresentation.ts and
src/rendering/GameMap.tsx. Upstream reference: erduoniba/baye-fmj-app @ 60c41ea,
Baye/baye_c/src/{citycmd.c, citycmde.c, strcnt.c, tactic.c, baye/order.h}._
