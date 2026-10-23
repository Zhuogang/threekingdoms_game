# v0.3 playability and interface plan

Written October 22, 2026 on branch `hegemony_of_the_three_kindoms_v0.3`. This plan follows a hands-on play session and a source review. It adds new scoped tasks; it does not reopen the completed RV01–RV10 work. [Current status](implementation-status.md) · [Open items before this plan](../next-steps.md#open-now) · [Decisions D1–D11](00-decisions-and-contracts.md).

Implementation and executed evidence: [playability implementation ledger](playability-implementation.md). Fresh-player, actual low-end hardware and artwork acceptance remain player-owned gates.

**Interface direction revised October 22, 2026:** the player rejected the permanent campaign sidebar and approved a map-first prototype: main map → click a city → city window → March out → return to the same map view. This replaces UI-03's campaign sidebar/tab arrangement. City affairs, supplies, orders and diplomacy open on demand; battlefield layout and all game rules remain unchanged in this iteration. Save-system work is outside this prototype's scope.

## Why the game does not feel playable yet

The automated suite passes, but a real session reaches several dead ends and many small inconsistencies. These are the main causes, most severe first:

1. **Any battle anywhere freezes the player's strategy layer.** The engine sets one global `phase = 'battle'` whenever any battle is active, and every city action, order, appointment and diplomacy command rejects that phase. With six houses at war, this is true for much of the time. RV01 unblocked the clock, but not the commands.
2. **Losing a battle can silently remove the ruler.** Cao Cao and Xiahou Dun were captured after a defeat. The only report said "Dong Zhuo wins the field at Luoyang." v0.3 has no prisoner handling and no rule for what happens to a house when its ruler is captured.
3. **Battles are sparse and slow.** All officers of one troop type merge into a single unit, so a march with three officers becomes one or two units on a 24×20 grid. Contact takes two or three battle days. Exchanges cost about 3–4% of a unit's troops. Each battle day is one campaign day, with a 30-day limit.
4. **Reports are noisy and point of view is wrong.** Battles between two rivals are titled "Field defeat" or "Field victory" from the attacker's side. An empty "Monthly settlement complete" report needs acknowledgement every month. **Next event** stops for every battle on the map.
5. **The interface has no shared system.** `App.tsx` is 4,324 lines, and one component holds about 3,000 of them. Text is localized three different ways. The stylesheet has no design tokens. Raw IDs, mixed coordinate systems and developer data appear on screen.

## Evidence

### Play session

Setup: 1440×900, scenario 190, Cao Cao, EN with a ZH spot check. Played from day 1 to day 93 (month 4).

| Step                       | What happened                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start screen               | Each house card shows its name twice ("Cao Cao / Cao Cao"). There is no description of the house, its cities, its officers or its difficulty. The scenario title is never localized.                                                                                                                                                  |
| First day                  | The map header reads `CAMPAIGN · divided-realm-190`. City markers carry unexplained L/G/R letters. Owners are hard to read at Fit. The minimap hides Wu. The capital panel says both "Ruler's capital" and "Governor: Local stewardship". It also shows "Anchor confidence · A" with a Chinese-only note while the UI is in English.  |
| March order                | The destination list holds all 21 cities you don't own, with no owner, garrison or distance. The default request of 2,000 troops exceeds what can go (1,500), so your own capital goes through a shortfall flow with four buttons. You can't choose which officers march. Once issued, the order card overlaps the Diplomacy heading. |
| Battle start (day 16)      | The header reads `FIELD BATTLE · XIAPI` for a battle at Luoyang. The log says "Battle battle-3 begins on a xiapi field." Cao Cao and Xiahou Dun share one cavalry unit. You have one unit against two.                                                                                                                                |
| Battle input               | At Fit, a tile is about 15 px wide. A slightly missed click gives "That cell is blocked…". The zoom changes after a move. Units can sit under the camera toolbar. The error toast stays up after a later successful move.                                                                                                             |
| ZH check                   | The header becomes "曹 · 辖下城市 3", and diplomacy lists "刘". `野战 · XIAPI` stays in English. The log shows coordinates (13, 9) where English shows (12, 8). Toasts stay in English after switching language.                                                                                                                      |
| Battle end (day 30)        | Defeat on battle day 15. No summary screen. Officers' fate is not reported. Your march order had already disappeared from the Orders list while the army was fighting.                                                                                                                                                                |
| Months 2–4                 | **Next event** stopped 12 times, mostly for rival battles and empty monthly settlements. Rival battles were titled "Field defeat" or "Field victory". In month 4, a Yuan Shao vs Dong Zhuo battle blocked every Chenliu action with "City work is available during campaign planning." No battle tab appeared for it.                 |
| State check (localStorage) | `phase: "battle"` with one active battle that doesn't involve you. Cao Cao and Xiahou Dun: `location.kind = "captured"`, troops 0. Capital work points had dropped from 3/3 to 1/1 with no explanation.                                                                                                                               |

### Source

| Area                  | Finding                                                                                                                                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global phase lock     | `engine.ts:1701` derives `phase` from _any_ active battle. Rejections at `governance/city-actions.ts:189`, `governance/orders.ts:286,474,981,1269`, `campaign/diplomacy.ts:88,157,181`, `governance/appointments.ts:20`. Save validation ties the phase to active battles at `platform/storage.ts:707,815`. |
| Rival AI also freezes | `strategic-ai.ts:339` returns no plans unless `phase === 'planning'`. Monthly rival dispatch (`engine.ts:1560`) therefore skips any month that starts during a battle. This is a likely contributor to the 96-month "no unification" diagnostic. Verify it before more AI tuning.                           |
| Capture               | `engine.ts:510–521`: if no attackers survive, every attacking officer, including a ruler, becomes `captured`. Nothing in v0.3 ever releases, recruits or reports them. The old `src/ui/PrisonerPanel.tsx` is not used.                                                                                      |
| Report point of view  | `engine.ts:531` titles every resolved battle from the attacker's side. `engine.ts:1564` emits a content-free monthly report.                                                                                                                                                                                |
| Formation grouping    | `engine.ts:195` `groupOfficers` creates one unit per troop type, so each side has at most six units.                                                                                                                                                                                                        |
| Battle side effects   | `engine.ts:626–630` set the defending city's food and garrison to 0 during the battle. The city panel then shows the city as empty.                                                                                                                                                                         |
| Monolith              | `App.tsx` has 4,324 lines, 56 hook calls and one main component starting at line 1294.                                                                                                                                                                                                                      |
| Three i18n mechanisms | The `COPY` dictionary; 80 inline `locale === 'zh' ?` ternaries across six files; and 29 regex translators that parse the engine's English prose back into Chinese (`App.tsx:708–912`, `ui/feedback.ts`). Saved events keep English `title`/`detail` (`types.ts:175`).                                       |
| Coordinate mismatch   | `App.tsx:901` adds 1 to coordinates in the Chinese log only. The English log and the terrain inspector use 0-based coordinates.                                                                                                                                                                             |
| Raw IDs               | `App.tsx:2676` (scenario ID), `App.tsx:2563` (region ID in upper case), and battle/region/weather/terrain enum strings in logs and the conditions panel.                                                                                                                                                    |
| No design tokens      | `v03/styles.css` has 0 CSS custom properties, 212 hard-coded colors, about 30 separate button rule sets and 57 `font-size` declarations, mostly 9–12 px. Fonts are not bundled, so they fall back to system fonts; this likely causes the "Ruler’ s" gap.                                                   |
| Legacy weight         | About 15k lines of v0.1/v0.2 code (`src/game`, `src/ui`, `src/rendering`, `src/i18n`, `src/platform`, `src/app`) still compile and run 18 legacy test files. v0.3 imports only `content/scenario`, `content/traits` and the `TroopType` type.                                                               |

## Decisions

Agreed with the player on October 22, 2026. Q1, Q2, Q4 and Q5 refine D5, D7 and D8 in [the decision record](00-decisions-and-contracts.md); add them there as the matching tasks land.

| #   | Question                                                        | Decision                                                                                                                                                                                 | Affects |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Q1  | Should your own battle block city work in other cities?         | No. Only commands that touch officers, troops or cities committed to an active battle are blocked, with a reason. Rival-only battles never block the player.                             | PX-01   |
| Q2  | What happens when a ruler is captured?                          | Succession to the most loyal free officer, with a pausing report, for the player and AI houses. The old ruler stays a prisoner. A house is eliminated only when no free officer remains. | PX-03   |
| Q2b | What can the holder do with prisoners each month?               | Release, recruit (loyalty-based chance), exchange (simple one-for-one offer) and execute.                                                                                                | PX-03   |
| Q3  | One battle unit per officer, or per troop type?                 | One unit per officer, capped at 10 per side.                                                                                                                                             | GP-03   |
| Q4  | Add "let officers command" (auto-resolve) for your own battles? | Yes, as an optional toggle. Manual command (D7) stays the default, and you can take control back on any battle day.                                                                      | GP-06   |
| Q5  | Should capital marches skip the plan/shortfall flow?            | Yes. Capital marches execute directly from the chosen officers (D5). Governor cities keep the D8 plan flow.                                                                              | GP-01   |
| Q6  | Remove v0.1/v0.2 code from the active tree?                     | Yes. Tag `v0.2-final`, move the shared scenario data under `src/v03/content`, then delete the old code, its tests and the v0.2 test configs.                                             | ST-02   |
| Q7  | Bundle fonts or use a system font stack?                        | Bundle Source Sans 3 and a Noto Serif SC subset limited to the characters the game uses.                                                                                                 | UI-01   |

## Milestones

| Milestone          | Goal                                                                | Tasks                                         |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------- |
| M1 Unblocked       | You can always act; important outcomes are never silent             | PX-01 – PX-05                                 |
| M2 Foundation      | One structure and one text system so later UI work stays consistent | ST-01 – ST-04                                 |
| M3 Consistent UI   | One visual language, one layout, no raw data on screen              | UI-01 – UI-06                                 |
| M4 Satisfying loop | Armies, battles and outcomes worth playing                          | GP-01 – GP-10                                 |
| M5 Validation      | Evidence that a new player can play the first hour unaided          | QA-01 – QA-03, then the existing player gates |

Sizes: **S** ≤ 1 day, **M** 2–4 days, **L** 1–2 weeks. Priority: **P0** blocks play, **P1** is required for a playable release, **P2** is polish within this version.

### Full task list

| ID    | Pri | Size | Task                                                | Depends on       |
| ----- | --- | ---- | --------------------------------------------------- | ---------------- |
| PX-01 | P0  | M    | Battle-scoped gating instead of a global phase lock | Q1               |
| PX-02 | P0  | M    | Battle outcome and officer-fate reporting           | —                |
| PX-03 | P0  | M    | Ruler capture and prisoner handling                 | Q2, PX-02        |
| PX-04 | P0  | M    | Report relevance and pause policy                   | —                |
| PX-05 | P1  | S    | Orders stay visible through their life cycle        | —                |
| ST-01 | P1  | L    | Split `App.tsx` into screens, panels and hooks      | —                |
| ST-02 | P1  | M    | Retire v0.1/v0.2 code                               | Q6               |
| ST-03 | P1  | L    | Structured events and one message catalog           | ST-01            |
| ST-04 | P1  | S    | Development playtest harness and fixtures           | —                |
| UI-01 | P1  | M    | Design tokens, type scale and fonts                 | Q7               |
| UI-02 | P1  | M    | Shared component kit                                | UI-01, ST-01     |
| UI-03 | P1  | L    | App shell and panel layout                          | UI-02            |
| UI-04 | P1  | S    | Copy and on-screen data cleanup                     | — (partly ST-03) |
| UI-05 | P1  | M    | Campaign map readability                            | UI-01            |
| UI-06 | P2  | S    | Start screen                                        | UI-02            |
| GP-01 | P1  | M    | Army builder for marches                            | Q5, UI-02        |
| GP-02 | P1  | S    | Enemy city intelligence and "march here"            | GP-01            |
| GP-03 | P1  | M    | One battle unit per officer                         | Q3               |
| GP-04 | P1  | M    | Measured battle pacing                              | GP-03            |
| GP-05 | P1  | M    | Battle input and camera                             | UI-02            |
| GP-06 | P2  | M    | "Let officers command" for your own battles         | Q4               |
| GP-07 | P1  | S    | Battle aftermath summary                            | PX-02            |
| GP-08 | P1  | M    | Development cap mismatch (existing open item)       | —                |
| GP-09 | P2  | S    | Explain capital work points                         | —                |
| GP-10 | P1  | S    | Re-measure rival AI after PX-01                     | PX-01            |
| QA-01 | P1  | S    | First-hour playtest script                          | M1–M3            |
| QA-02 | P1  | S    | Screen baseline captures                            | UI-03            |
| QA-03 | P1  | S    | Full regression, then existing player gates         | All              |

## M1 — Unblock the campaign loop

### PX-01 — Battle-scoped gating instead of a global phase lock

**Problem:** a single active battle anywhere disables every player and rival planning command. In the play session, a Yuan–Dong battle locked Chenliu while no battle tab was available.

**Scope:**

- Add shared helpers in `governance/` or `engine.ts`, for example `isOfficerCommitted(state, officerId)` and `isCityCommitted(state, cityId)`. Committed means in an active battle, or the city being contested.
- Replace each `phase !== 'planning'` rejection with the narrowest correct check: city work in an uncommitted city is always allowed; orders cannot draw committed officers or troops; diplomacy is never blocked by battles; appointments cannot move committed officers.
- Run `planStrategicRivalCampaigns` at every month boundary, and exclude committed officers and targets instead of returning `[]`.
- Keep the `phase` field and the existing save validation so v3 saves still load. Only the meaning of the gate changes.
- `App.tsx:4215` and the disabled-reason text must use the same helpers (shared eligibility, C3).

**Acceptance:**

- With only a rival battle active, every city action, order, appointment and diplomacy command works through the UI in EN and ZH.
- With your own battle active, other cities still work. Officers in the battle are absent from order and appointment pickers, with a reason.
- Rival AI produces plans at a month boundary that falls during a battle (new unit test).
- Existing RV01 clock and two-battle submission regressions still pass. Save, reload and resume keep battle cursors.

### PX-02 — Battle outcome and officer-fate reporting

**Problem:** a resolved battle reports only the winner. Casualties, captured officers, survivors returning home and city ownership changes are invisible.

**Scope:**

- Extend the `battleResolved` event with structured detail: each side's starting and surviving troops; officers returned, captured or killed; city captured or held; loot.
- Title it from the player's side when the player took part (victory/defeat). Use a neutral title for rival battles, such as "Battle at Tianshui: Dong Zhuo holds".
- Rival-only battle results go to the non-pausing chronicle (see PX-04).

**Acceptance:** for a player victory, a defeat, a draw and a rival-only battle, the report lists the correct officers and numbers and uses the correct title in EN and ZH. A rival-vs-rival result never says "victory" or "defeat".

### PX-03 — Ruler capture and prisoner handling

**Problem:** a captured officer stays captured forever, and losing your ruler has no consequence and no notice.

**Scope (per Q2 and Q2b):**

- Show prisoners on the holding city's panel.
- Monthly actions for the holder: release, recruit (loyalty-based chance), exchange (a simple one-for-one offer the other house accepts or refuses) and execute. AI houses use the same rules with a simple policy.
- Ruler capture: a pausing report, then succession to the most loyal free officer for the player and AI houses. The house is eliminated only when no free officer remains.
- Not decided yet: any side effect of executing a prisoner (for example on loyalty or diplomacy). The default is none until you set one.
- Keep the scope small: no ransom, negotiation screen or new diplomacy system.

**Acceptance:** capturing the player's ruler produces one pausing report and a named successor. The capital label and ruler-only actions follow the successor. Prisoners appear in the holder's city; release, recruit, exchange and execute each work through the UI in EN and ZH, and prisoners survive save/reload. An executed officer never reappears in any roster or picker. A test covers house elimination when no free officer remains.

### PX-04 — Report relevance and pause policy

**Problem:** **Next event** stopped 12 times in three months, mostly for battles between rivals and for empty monthly reports.

**Scope:**

- Classify events into three tiers. **Critical** pauses and needs acknowledgement: your battles, your cities attacked, your officers captured, plan answers, diplomacy offers, victory or defeat. **Notice** appears in the inbox without pausing. **Chronicle** goes to a world log.
- Replace "Monthly settlement complete" with a non-pausing monthly summary: per-city gold, food and troop changes, governor actions and shortages. It pauses only on a shortage or a revolt.
- Optional: a setting to also pause on rival battles near your cities.

**Acceptance:** replaying the month 1–4 session stops only for your own battle, its result and anything that targets you. The monthly summary shows real numbers that match the state. Existing acknowledgement-before-advance rules still hold for critical events.

### PX-05 — Orders stay visible through their life cycle

**Problem:** the march order vanished from **Orders** once the battle began.

**Scope:** order cards keep a status: preparing → marching (ETA) → in battle (link to the battle tab) → returning (ETA) → done, with a one-line result. Finished orders collapse into a short history.

**Acceptance:** a full march → battle → return sequence shows a card at every stage in EN and ZH. Clicking an in-battle card opens that battle.

## M2 — Foundation for a consistent interface

### ST-01 — Split `App.tsx` into screens, panels and hooks

**Scope:** a pure refactor with no behavior or markup change. Suggested layout:

```text
src/v03/ui/
  screens/   StartScreen, CampaignScreen, BattleScreen
  panels/    CityPanel, OfficerList, OrderForm, OrdersInbox, DiplomacyPanel,
             ReportsInbox, BattleSidebar, TacticsPanel, BattleConditions, WikiModal
  hooks/     useGameSession (state, dispatch, autosave), useCampaignCamera,
             useBattleSelection, useToasts
  i18n/      (filled by ST-03)
```

**Acceptance:** no file over about 600 lines; `npm test`, `npm run test:e2e` and the build pass unchanged; one person edits `App.tsx` while this is in progress, as `00-decisions-and-contracts.md` already requires.

### ST-02 — Retire v0.1/v0.2 code

**Scope:** tag `v0.2-final`. Move `content/scenario.ts`, `content/guandu.ts`, `content/traits.ts` and the `TroopType` type under `src/v03/`. Delete `src/game`, `src/ui`, `src/rendering`, `src/i18n`, `src/platform` and `src/app`, the 18 legacy unit tests, and the v0.2 Playwright, FPS and perf configs and scripts. Update `package.json` scripts and the docs that link to them.

**Acceptance:** typecheck, build, the v0.3 unit and browser suites, and the production check pass. Record the bundle size before and after.

### ST-03 — Structured events and one message catalog

**Scope:**

- Add optional `code` and `params` fields to `V03DomainEvent` and to battle log entries. Engine call sites (22 `addEvent` calls, plus the battle `append` calls) emit codes, and the UI formats them per locale.
- Keep reading the existing English `title`/`detail` for events already in v3 saves, through the current translators, until those events are acknowledged. New events never depend on regex parsing. Decide whether this is an optional-field addition within version 3 or a bump to version 4.
- Move `COPY` and the 80 inline ternaries into typed `src/v03/i18n/en.ts` and `zh.ts`, with a `t(key, params)` helper. Toasts store a key and params so they re-render after a language switch.
- One formatter each for coordinates, dates, troop counts, weather and terrain names.

**Acceptance:** a test fails if any key or event code lacks an entry in either locale. A ZH browser run through the PX-01 and PX-02 flows shows no English except proper nouns the catalog keeps. Coordinates match between the EN and ZH logs and the inspector.

### ST-04 — Development playtest harness

**Scope:** in development builds only, `?debug=1` exposes read-only state and a command dispatcher on `window`. Add named fixtures to the Campaign menu: start in a battle, rival battle active, ruler captured, month boundary with shortage, many reports.

**Acceptance:** each fixture loads in one click and is used by at least one browser test. Production builds contain none of it (the production check asserts this).

## M3 — Consistent interface

### UI-01 — Design tokens, type scale and fonts

**Scope:**

- `:root` tokens for ink, paper, accent, danger, success, the faction palette, spacing (4/8/12/16/24/32), radius, shadow and focus ring.
- A type scale with body text of at least 13 px and metadata of 12 px; nothing below 11 px except map labels.
- Replace the 212 hard-coded colors and 57 font sizes with tokens.
- Bundle Source Sans 3 and a Noto Serif SC subset with `@font-face` (Q7). Generate the subset from the characters in the scenario data and message catalogs, and record the added download size.

**Acceptance:** `styles.css` has no raw hex colors outside the token block (a lint script checks this). "Ruler’s" renders without a gap. EN and ZH text heights are consistent at 1366 and 1920.

### UI-02 — Shared component kit

**Scope:** `Button` (primary, secondary, ghost, danger; sm, md), `IconButton`, `Panel` with a header and help link, `StatGrid`, `Tabs`, `Field` (label, input, hint, error), `Badge`, `Toast`, `ConfirmDialog`, and `ActionButton`, which shows its disabled reason inline or as a tooltip instead of in a separate bullet list. Replace the roughly 30 per-context button rules.

**Acceptance:** every interactive control in the campaign and battle screens uses the kit. Hover, focus, disabled and danger states look the same everywhere. Keyboard focus is visible on all of them.

### UI-03 — App shell and panel layout

**Scope:**

- Fixed-viewport shell with no page scroll; today the page overflows by 15 px and the top bar scrolls away.
- Top bar: brand · date · time controls · inbox badge · menu. Save, Export, Import, language and Wiki move into the menu.
- Campaign right panel with tabs: **City** (stats, officers, city actions), **Forces** (army builder, GP-01), **Orders**, **Diplomacy**. Reports become an inbox drawer opened from the badge.
- Battle sidebar with a fixed action bar: **End battle day** as the primary button. **Withdraw** becomes a danger action in an overflow menu, away from End day.
- Replace the "Camp aign" rail label with an icon and tooltip, or a wider rail.

**Acceptance:** at 1366×768, 1920×1080, 390 px wide and 200% zoom, no panel overlaps another (fixes the Orders/Diplomacy overlap), the top bar stays visible, and every RV04 inbox path is still reachable.

### UI-04 — Copy and on-screen data cleanup

A checklist of small fixes. Some become trivial once ST-03 lands:

- [x] Header shows the scenario title, not `divided-realm-190` (`App.tsx:2676`).
- [x] Battle header shows the destination city and the battlefield's regional style, not `XIAPI` (`App.tsx:2563`). The log says "The battle at Luoyang begins", not "Battle battle-3 … xiapi field".
- [x] Weather (`wind`, `rain`) and terrain (`plain`) use localized names.
- [x] One coordinate convention in logs, the inspector and both languages (`App.tsx:901`).
- [x] Scenario title localized on the start screen (`App.tsx:2123` uses `scenario.title` in both branches).
- [x] House card second line shows the leader or a blurb, not the name again (`App.tsx:2137–2138`).
- [x] ZH uses full house names (曹操 rather than 曹) in the top bar and diplomacy.
- [x] "Anchor confidence" and its notes move to a geography tooltip or the Wiki and follow the UI language (`App.tsx:3202`).
- [x] The capital no longer shows both "Ruler's capital" and "Governor: Local stewardship".
- [x] An error toast clears after the next successful action. Toasts follow language switches.
- [x] Battle log: newest day first, entries within a day in the order they happened, with a day header.

**Acceptance:** a browser test walks the start → campaign → battle → report path in EN and ZH and fails on known raw IDs (`divided-realm`, `battle-\d+`, upper-case region IDs) or untranslated enum strings.

### UI-05 — Campaign map readability

**Scope:**

- Faction ownership readable at Fit: a territory tint or a thicker colored ring.
- A legend or tooltips for the L/G/R governance markers, or replace them with icons.
- A hover card for each city: owner, governor, garrison, and distance and ETA from the selected city.
- Larger city hit targets (clicking the Luoyang label missed).
- Collapsible minimap placed so it covers no city at Fit (Wu was hidden at 1440×900).
- Map art fills the frame (it uses about 60% of the frame's width today).

**Acceptance:** at Fit at 1366 and 1920, all 24 cities are visible and clickable and their owner can be identified. The RV02 framing and stability assertions still pass.

### UI-06 — Start screen

**Scope:** house cards with the leader's portrait, starting cities, officer count, a difficulty hint and a one-line blurb. The scenario selector shows a short description. Both languages.

**Acceptance:** a first-time player can tell the houses apart without opening the Wiki. Both scenarios show correct data from `initial-state`.

## M4 — A satisfying core loop

### GP-01 — Army builder for marches

**Scope:**

- Choose officers from a checklist showing troops, type, force, intellect and loyalty. Troops are the sum of the chosen officers. Food defaults to the trip's need, with an override.
- Capital orders execute directly (Q5). Governor-city requests keep the D8 accept/reduce/wait/cancel flow.
- Pick the destination on the map or from a list grouped by owner and sorted by ETA, showing the owner and known garrison.
- A short forecast compares your force with the known defenders.

**Acceptance:** from the first day, a march from the capital takes three clicks after selecting officers, with no shortfall step. Governor-city plans behave as today. Officers committed to a battle (PX-01) can't be chosen.

### GP-02 — Enemy city intelligence and "march here"

**Scope:** an enemy city panel shows owner, governor, visible officers and garrison. During a battle, it shows "Garrison in the field: N" instead of 0 (`engine.ts:626–630`). A **March here** button opens GP-01 with the nearest friendly source preselected.

**Acceptance:** you can plan an attack starting from the target city. No zero garrison or zero food appears for a city in battle.

### GP-03 — One battle unit per officer

**Scope (per Q3):** `groupOfficers` (`engine.ts:195`) forms one unit per officer, with a per-side cap; overflow officers merge into the weakest same-type unit. Update roster naming, membership, AI targeting, save validation and minimap counts. Militia stays a separate unit.

**Acceptance:** a three-officer march produces three units. Battle tests, survival filters and RV06 count labels pass. A save from before the change still loads its in-progress battle.

### GP-04 — Measured battle pacing

**Scope:**

- Measure first: a headless script runs about 200 seeded battles per template and records first-contact day, battle length, casualties per exchange and outcome.
- Then tune within the existing rules: deployment distance or camp placement, movement budgets and damage scaling. Keep the 24×20 grid (D3), the water multipliers (D10) and the 30-day limit (D11).
- Target: first contact by battle day 2–3, and a decisive median battle in 6–12 battle days when both sides engage.

**Acceptance:** before-and-after distributions are recorded in `docs/v0.3/evidence/`. Tactic and water regression tests pass. The 10v10 performance budget holds.

### GP-05 — Battle input and camera

**Scope:**

- Highlight the tile under the cursor and preview the path.
- A click lands on the nearest legal tile within half a tile instead of giving an error.
- Open battles at working zoom on your units, not Fit, and don't change zoom after a move.
- After a unit acts, select the next unit that is still ready.
- Keyboard: Tab for the next unit, W to wait, E to end the day, Esc to cancel.
- End day warns when units are still ready.
- The camera toolbar doesn't cover units (inset the viewport).

**Acceptance:** a scripted battle can be played with mouse-only and keyboard-only input. No "blocked" toast appears for clicks within half a tile of a green tile. The RV02 Fit and occupancy checks still pass.

### GP-06 — "Let officers command" for your own battles

**Scope (per Q4):** a toggle at battle start and on each battle day hands your side to the existing battle AI until you take control back or the battle ends. Show the outcome with GP-07.

**Acceptance:** an auto-commanded battle resolves deterministically from the seed, can be taken back on any day, and survives save/reload.

### GP-07 — Battle aftermath summary

**Scope:** a modal when a battle you took part in ends. It shows casualties per side, officers returned, captured or killed, the city result, loot and the return ETA, using the PX-02 data. It is dismissed into the campaign view focused on the city.

**Acceptance:** shown once per battle in EN and ZH. The numbers match the report and the state.

### GP-08 — Development cap mismatch

This is the existing V/I/Q item in [next steps](../next-steps.md#open-now): starting farming and commerce of 220–380 against a manual cap of 100. Scope and acceptance are unchanged.

### GP-09 — Explain capital work points

**Scope:** show where the monthly work quota comes from, for example "3 with the ruler present, 1 while the ruler is away", and when it refreshes. Confirm the actual rule in `governance/city-actions.ts` first.

**Acceptance:** the quota line explains every value seen in a 12-month session.

### GP-10 — Re-measure rival AI after PX-01

**Scope:** rerun the 96-month diagnostics with the PX-01 fix only, before any AI tuning. `strategic-ai.ts:339` may have been skipping rival planning in any month that began during a battle.

**Acceptance:** before-and-after diagnostics are recorded. Any further tuning is proposed separately, keeping the accepted conservative one-front policy unless you change it.

## M5 — Validation

- **QA-01 First-hour playtest script.** A fresh player, with no Wiki, plays Cao Cao for two campaign months. Pass if they capture or seriously contest one city, never reach a state where nothing can be done, and can explain every pause. Record using the existing [player test record](../next-steps.md#player-test-record).
- **QA-02 Screen baseline captures.** Start, campaign, city tabs, order builder, battle and aftermath screens, in EN and ZH, at 390, 1366 and 1920 px. Replaces the README images once approved.
- **QA-03 Full regression, then the existing player gates.** Run the unit, browser, production, performance, format and portrait checks. Then run the four 12-month sessions and the low-end check from `next-steps.md`. They are more useful after M1–M4 than before.

## Sequencing and parallel work

1. **Start together:** PX-01, PX-02 and PX-04 (engine, governance and reports) alongside ST-01 (the `App.tsx` split). The only shared line is `App.tsx:4215`; land ST-01 first or rebase that one line.
2. **Then:** ST-03 and UI-01 on the split tree. ST-02 can run at any time it doesn't collide with ST-01.
3. **Then:** UI-02 → UI-03 (single owner of the shell), with UI-04 and UI-05 alongside.
4. **Then:** GP-01/GP-02 and GP-03 → GP-04, with GP-05 and GP-07 alongside. GP-06 and GP-09 last.
5. **Finally:** QA-01 – QA-03.

Keep one editor per shared file (`App.tsx` or its successor shell, `engine.ts`, `types.ts`, `commands.ts`, `platform/storage.ts`), as the existing contracts require.

## Out of scope

Siege, new unit types, new victory conditions, extra save slots, geographic reconstruction, new artwork batches and a broader strategic AI rewrite. Art approval stays a separate, player-owned gate.
