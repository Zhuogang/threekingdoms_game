# Hegemony of the Three Kingdoms: implementation and learning guide

Status: October 19, 2026. The repository contains a runnable, single-player web game using TypeScript, React, and PixiJS. The **Atlas ruleset (`baye-atlas-1`)** supplies one authored 190 CE scenario, 24 cities, six playable houses, 52 officers, city management, diplomacy, logistics, tactical battles, AI, campaign endings, and local saves. The v0.1 improvements add three display sizes, commander portraits and surnames, troop symbols, action indicators, adjustable rival aggression, and persistent monthly reports. English and Simplified Chinese are available throughout play. See the [validation record](validation.md) for automated checks and the production subdirectory smoke test.

This is an original adaptation of Baye's campaign/battle structure. It is **not a verified recreation of a particular legacy data library, mod, or every original formula**. The original [architecture](architecture.md) and [roadmap](roadmap.md) remain useful design targets; their fidelity, accessibility, performance, and browser-release gates are not all complete.

> **v0.2.** The ruleset is now `baye-atlas-2` (state and save version 2). The sections below describe v0.2. [v0.2-rules.md](v0.2-rules.md) is the full reference for what v0.2 added (tactic points, zone of control, morale states, plunder, prisoners, unrest, scenarios, and more); [v0.2-notes.md](v0.2-notes.md) lists deviations and balance evidence.

## How the code fits together

```text
React controls / Pixi map clicks
            ↓ GameCommand
      app/session.ts
            ↓ dispatch
   game/campaign.ts ←→ game/battle.ts
            ↓ new GameState
      app/session.ts
       ↙           ↘
autosave store     React subscriptions + Pixi redraw
       ↓                    ↑
IndexedDB          i18n presentation catalogs

platform/saves.ts also validates and exports JSON backups
```

| File                                                                                        | Responsibility and reason                                                                                             |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`src/game/types.ts`](../src/game/types.ts)                                                 | Serializable entities, commands, campaign phases, and battle continuation. IDs connect records without object cycles. |
| [`src/game/campaign.ts`](../src/game/campaign.ts)                                           | Authoritative rules, campaign AI, battle aftermath, monthly progression, and semantic save validation.                |
| [`src/game/battle.ts`](../src/game/battle.ts)                                               | Grid movement, attacks, skills, weather, provisions, tactical AI, and battle outcomes.                                |
| [`src/game/random.ts`](../src/game/random.ts)                                               | Saved xorshift32 RNG and bounded chronicle. Drawing a screen never consumes gameplay randomness.                      |
| [`src/content/scenario.ts`](../src/content/scenario.ts)                                     | Authored map adjacency, factions, initial resources, and officer roster.                                              |
| [`src/app/session.ts`](../src/app/session.ts)                                               | One state snapshot and subscription boundary. React and Pixi request commands through this controller.                |
| [`src/ui/App.tsx`](../src/ui/App.tsx), [`styles.css`](../src/ui/styles.css)                 | Management panels, dialogs, battle controls, save UI, and responsive visual styling.                                  |
| [`src/rendering/GameMap.tsx`](../src/rendering/GameMap.tsx)                                 | Procedural atlas and battle artwork, picking, pan/zoom, resize, and Pixi lifecycle cleanup.                           |
| [`src/platform/saves.ts`](../src/platform/saves.ts), [`audio.ts`](../src/platform/audio.ts) | Browser-dependent storage/export and optional synthesized audio.                                                      |

`dispatch` clones the current snapshot, validates and applies a command to that draft, and publishes it only on success. A failed command returns the original object: no partial costs, assignments, or RNG changes. At this scale, full snapshot cloning is easier to inspect than structural sharing. Simulation runs on the main thread and has no React, Pixi, DOM, or clock dependency.

### Language is presentation state

`src/i18n/core.ts` translates interface labels, names, map captions, validation errors, and chronicle messages using the Chinese catalogs beside it. `src/i18n/index.ts` exposes the current locale through a small subscribed store and persists the preference in localStorage. The same switch appears in the masthead and every modal, so a focus-trapped dialog never blocks access to it. Pixi redraws labels without rebuilding its application or resetting the camera.

The simulation keeps canonical English names and logs. Translating them at display time means existing version 1 saves need no migration, old chronicle entries change language immediately, and switching language cannot alter RNG or issue a game command. Dynamic messages use explicit templates; translation tests cover the engine's messages to catch wording changes that would otherwise fall back to English. New feature text belongs in the catalogs alongside its UI or game change.

### Readability and identity are presentation data

`src/ui/display.ts` defines Compact, Comfortable, and Large CSS-pixel targets shared by CSS and Pixi. The browser stores display preference in `baye.display`; an unavailable preference store does not block play. `cameraGeometry.ts` fits the actual battlefield independently of atlas bounds and supports reversible world/screen coordinates. Camera and commander selection never issue simulation commands. Readable tiles can require panning; Fit battlefield provides a complete overview.

`src/content/officerIdentity.ts` explicitly maps every stable officer ID to family names and a portrait key. The IDs `maliang` and `zuzhao` deliberately identify Ma Teng and Zu Mao, preserving save compatibility. `troopVisuals.ts` supplies the same six vector symbols to React and Pixi. Original face artwork is bundled as local WebP renditions; [portrait provenance](assets/portrait-credits.md) records the complete prompt set and identities. Faction framing follows current allegiance while the face and surname remain the officer's identity.

The implementation intentionally starts smaller than the proposed folder tree: one package, a small session controller, a combined React screen, global CSS, typed TypeScript scenario definitions, and a durable chronicle instead of a separate transient event bus. Content is not loaded from external JSON yet. There is no server, account system, worker, general mod framework, or service worker.

## Campaign rules

Each serving officer can receive one city action, march, or transport order per month. Orders require ownership, sufficient stamina/resources, and a valid target. City actions take effect immediately and mark the officer busy. Troop assignment is an exception: available officers may redistribute reserves without spending an action. Recruitment performed by an officer therefore requires another available officer to muster or march that month.

Resources and gains are integers; fractions are rounded down unless `ceil` is stated. Farming and commerce cap at 999; support, defense, loyalty, and stamina cap at 100. Ordinary force caps at 100, or 105 with fine arms. One officer commands at most 5,000 troops. Experience is recorded, but does not independently multiply battle damage; training also raises force.

In the table, `I` is the acting officer's intellect and `F` their force. A random integer is inclusive at both stated endpoints.

| Action               | Gold / stamina | Immediate outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Develop farms        | 100 / 20       | Farming gains `floor(I/10) × random(2..5) + floor(I/2)`. This operation order is source-inspired; Atlas chooses multiplier 1 and cap 999.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Encourage trade      | 100 / 20       | Commerce gains `floor(I/10) × random(2..5) + floor(I/3)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Restore order        | 80 / 15        | Support gains `8 + floor(I/20)`; defense gains `5 + floor(I/25)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Search for talent    | 60 / 15        | Randomly choose a local unaffiliated officer. Join chance is `40 + floor(I/2)` percent; joining loyalty is 65–80. A search without a recruit still spends its costs.                                                                                                                                                                                                                                                                                                                                                                                           |
| Recruit soldiers     | 150 / 20       | Move `300 + 5F` people into reserves, leaving at least 1,000 population; requires at least 1,500 population. Support falls by 2.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Drill troops         | 80 / 25        | Requires assigned troops; gain 25 experience and 1 force.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Bestow a reward      | 100 / 5        | Acting officer gains 15 loyalty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Hold a feast         | 180 / 10       | Every serving officer in the city gains 8 loyalty and 10 stamina, including the host after paying their cost. Only the host spends an action.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Buy provisions       | 100 / 10       | Gain 800 food.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Sell provisions      | 0 / 10         | Exchange 800 food for 80 gold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Relieve the people   | 80 / 15        | Also costs 600 food; gain 15 support and 300 population.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Reconnaissance       | 40 / 10        | Report a neighboring city's total troops, defense, food, and support in the chronicle. Rival cities are under fog of war (presentation only: the rules and AI see exact numbers). The player sees ranges for unscouted rival cities; reconnaissance shows exact figures for two months (`SCOUT_MONTHS`). Own and allied cities are always exact.                                                                                                                                                                                                               |
| Persuade an officer  | 120 / 20       | Target a local free officer/prisoner or an available enemy officer in an adjacent city. Free-officer chance: `50 + floor(I/3)` percent. Sworn-officer chance: `clamp(floor(30 + .5I − .7 × target loyalty + prisoner bonus + benevolent bonus), 5, 75)` percent; the prisoner bonus is 20 and a benevolent persuader adds 8. A loyal target halves the chance (minimum 2). Rulers cannot be persuaded. Success gives 65–85 loyalty; half the target's soldiers join the receiving reserve and the rest stay in their old city. The recruit is busy this month. |
| Sow dissent          | 150 / 20       | A neighboring enemy city loses `6 + floor(I/8)` support; its serving officers lose half that amount, rounded up, in loyalty. This does not directly change ownership.                                                                                                                                                                                                                                                                                                                                                                                          |
| Negotiate alliance   | 200 / 20       | `40 + floor(I/2)` percent chance of six months of peace with another active ruler. Allied attacks are prevented or stood down during resolution.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Issue fine arms      | 180 / 10       | Equip once for +5 force.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Confiscate equipment | 0 / 5          | Remove fine arms and their +5 force; gain 100 gold and lose 12 officer loyalty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Dismiss officer      | 0 / 0          | Officer becomes unaffiliated with 35 loyalty; assigned troops return to city reserves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Appoint governor     | 0 / 5          | Acting officer becomes governor. If a governor later leaves, the highest-intellect serving officer is selected.                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Other commands:

- **Muster:** set an available officer's desired troop total. The difference is taken from or returned to local reserves; no gold or stamina cost.
- **Transport:** move an available officer and their army to an adjacent owned city, optionally carrying gold, food, and reserve soldiers. Costs 15 stamina and the officer's monthly action. Delivery is immediate.
- **March:** choose one to ten available commanders with troops, each spending 15 stamina, and 10, 20, or 30 days of supplies. Commit `days × ceil(total troops / 25)` food immediately (`supplyFood`, `SUPPLY_DIVISOR`); raids carry a fixed 10 days. The attack resolves at month end against a neighboring enemy or independent city. A standing alliance prevents it, and nobody may march during an opening truce (`turn < truceUntilTurn`).
- **Advance month:** run AI plans, resolve armies in queue order, then apply monthly changes once. Player battles interrupt the queue; other battles resolve automatically.

## Monthly economy and campaign AI

After all attacks, advance the date and turn, expire alliances, then update owned cities. Neutral cities do not collect income. January increments officer ages. With the optional aging rule (off by default), each serving non-ruler officer aged 60 or more then dies with chance `min(60, (age − 59) × 3)` percent and is recorded as `fate: 'deceased'`.

For each owned city, let `T` include reserves and all serving officers' troops:

```text
gold income = floor(population / 150 + commerce × .55)
food income = floor(farming × 2.2 + population / 80)
              (farming multiplier is 4 in September)
food upkeep = ceil(T × .12)
soldier pay = ceil(T × .025)
population growth = floor(population × .006 × support / 100)
```

Income arrives before upkeep. A food shortage empties food stores, removes 15% of reserves and each army, reduces support by 8, and reduces officer loyalty by 4. Unpaid soldiers reduce officer loyalty by 3. A governor with intellect at least 65 adds 1 support. Population then grows.

Each owned city draws one monthly event roll: 1% flood (lose 12% of stored food and 3 support), 1% caravan (gain `150 + floor(commerce/2)` gold), and 1% refugee opportunity (+500 population if support is at least 60). Otherwise no event occurs. All officers become available and recover 35 stamina; prisoners lose 2 loyalty. All 24 cities under the player banner means victory. A faction that holds Luoyang and at least 16 cities for 12 consecutive months (`HEGEMON_MONTHS`) is proclaimed Hegemon and wins; this applies to rivals as well as the player. Losing the last city means defeat.

Campaign AI receives no free resources. In fixed faction/city order it musters available officers toward 2,200 troops when force exceeds 80, otherwise 1,500, subject to reserves and the normal cap while retaining the last 500 reserves. From turn 1 onward it considers a neighboring non-allied city when weighted strength exceeds `enemy troops × multiplier + defense × 7 + 300`. Cautious uses 2.00, Balanced 1.35, and Aggressive 0.90. Every preset requires at least 500 source reserves and enough food after ordinary march costs for one current source upkeep, conservatively including departing troops. It favors the weakest eligible target. [The balance measurements](ai-balance.md) explain the tuning and comparison with the preserved pre-change engine.

Remaining available officers prioritize low loyalty, low public support, food shortages, reserve recruitment, commerce, farming, equipment, drilling, then searches. AI actions use the same validation/cost functions as player commands. Since v0.2 the AI also persuades, sows dissent, transports troops, launches joint attacks, raids, and proposes alliances to other AI houses, shaped by per-house personalities (`aiPolicy.ts`). It does not yet decide about its prisoners. Its strategy is intentionally simple and has not been validated for competitive balance.

## Tactical battles

Battles use a 12 × 10 orthogonal grid with seeded terrain, a central river and crossings, and two camps. Each side fields at most ten units. The defending reserve becomes a militia unit if a slot remains; fortifications improve that militia's force. Officers retain their troop type; there is no unit-type conversion command.

| Troop type         | Movement budget / range | Distinction                                                                            |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| Infantry           | 3 / 1                   | ×1.2 damage against cavalry.                                                           |
| Cavalry            | 5 / 1                   | ×1.3 against archers; forest/hill movement costs 3 and attacks from them are weakened. |
| Archers            | 3 / 3                   | ×1.15 against infantry; rain weakens normal attacks.                                   |
| Marines (`naval`)  | 4 / 2                   | Can traverse water at cost 1; land costs 2. Other troops cannot enter water.           |
| Vanguard (`elite`) | 4 / 1                   | ×1.15 normal damage; crosses forest/hill at cost 1.                                    |
| Guard              | 2 / 1                   | Receives ×0.8 normal-attack damage.                                                    |

Ordinary land movement costs 1; forest/hill costs 2 except as above. Dijkstra pathfinding accounts for terrain and occupied squares. Attack range uses Manhattan distance; terrain does not provide a line-of-sight obstruction. A unit may move once and then act once. Attack, skill, or Hold consumes its remaining movement/action.

Normal damage starts at 25% of the attacking troop count and applies force ratio, morale, weather, footing, troop matchup, target terrain, guard/inspiration modifiers, and seeded variation. Forts, hills, forests, and marines on water reduce received normal damage. A defender that survives a normal attack from within its own range counterattacks once for 50% of a normal hit (70% when guarding), at no action cost. Routed and confused units never counter, and tactics are never countered. The attack forecast shows the counter range. Tactics cost tactic points and consume an action. Their range is 2, or 3 for archers and casters with intellect 80 or more; ambush and rockfall reach 2. The original three:

- **Fire:** damage scales with troops and relative intellect. Rain reduces it, wind strengthens it, forests amplify it, and water weakens it.
- **Rally:** a friendly target within tactic range gains `15 + floor(I/5)` morale and the inspired status (+20% normal damage for the current day). The UI supports allied targets and self-rally. Self-rally spends the caster's action, so its durable benefit is morale; rallying an ally who has not acted lets that ally use the damage bonus before the day ends.
- **Confuse:** `clamp(55 + caster intellect − target intellect, 20, 90)` percent chance to prevent the target's next turn.

v0.2 adds raid supplies, ambush, and rockfall; see [v0.2-rules.md](v0.2-rules.md) for their requirements.

End day lets the enemy act, then each side spends `ceil(living troops / 25)` food. A shortage causes desertion and morale loss. Weather changes for the next day. Capture the enemy camp (a routed unit cannot enter it), defeat every opposing unit, or break the enemy army (every living unit routed) to win; defenders also win when the day limit ends (30 days, 10 for raids). Retreat concedes the battle. Auto-resolve runs bounded tactical AI over the same battlefield and rules.

The tactical AI follows paths toward firing positions, takes a reachable enemy camp, targets weaker units in range, and uses fire/confusion or rally when appropriate. It is a deterministic heuristic, not a search-based strategist.

After battle, the campaign commits casualties and food consumption, gives 20 experience to winning units or 8 to losing units, and deducts two stamina per battle day. Capturing a city reduces its defense to 65%, lowers support by 15 with a floor of 35, and retains half the surviving reserves. Defending officers have a 65% chance to escape when another friendly city exists; escape retains 80% of their surviving troops. Otherwise they become prisoners. Captives belonging to the conquering faction are freed. Attacking survivors occupy a captured city or retreat to a surviving friendly base.

## Saves and interruption safety

A save has a format version, scenario ID, ruleset ID, timestamp, and full `GameState`. That state includes the RNG, pending armies, current battle, and `{ queue, index, stage }` campaign continuation. There is no suspended JavaScript promise representing an unfinished battle.

When combat ends, aftermath is applied and the queue index advances in the same atomic command. Only then does the next battle or upkeep run. Reloading cannot replay casualties, city capture, or monthly income. Empty destinations resolve immediately instead of leaving a completed battle pending.

`decodeSave` checks size, parses JSON, validates its structure with Zod, then checks semantic relationships: canonical map/roster IDs, ownership, assignments, resources, calendar, battle participants, committed supplies, and the queue cursor. Invalid imports leave the current session intact. Autosave and three manual slots use IndexedDB. Writes are serialized and report success after transaction completion. JSON export/import supplies a portable backup; no old binary saves or other scenario versions are accepted.

The session calls `platform/autosave.ts` immediately when a command succeeds or a campaign is started/restored. Saving does not wait for a React effect. Each write captures its snapshot before joining the queue; opening the save dialog waits for earlier writes. A generation counter prevents an older completion from claiming that a newer command is saved. The latest snapshot is retained for **Retry save** when storage fails. Rejected opens are not cached, closed connections reopen, and failed writes leave the previous committed slot intact. A navigation prompt protects pending or failed autosaves where the browser supports it. Browser storage can still be cleared; portable exports remain the backup mechanism.

Save-slot summaries store faction IDs and calendar numbers for localized display, while the payload format stays version 1. Records from before this optional metadata was added remain readable.

Rival aggression is campaign state and changes only through a validated planning-phase command. Old saves missing the setting default to Balanced. Monthly report data in `game/reports.ts` accumulates committed battle results, alliance expirations, and border recruitment before being published after resolution. Pending records survive battle interruptions and reloads. They are bounded to 128 retained events and translated when shown; report bookkeeping consumes neither RNG nor the gameplay ID counter. Old interrupted saves collect a visibly partial report without replaying earlier AI decisions. The decoder validates these added fields and rejects malformed data before replacing the active campaign.

## Provenance and current limits

The user removed the local reference folder; the standalone game has no dependency on it. The main reference is [erduoniba/baye-fmj-app](https://github.com/erduoniba/baye-fmj-app/tree/main), specifically Baye. No original sprites, portraits, binary libraries, music, or executable code were copied into the new runtime. Historical names and places provide the theme; roster statistics, city locations/links, balance values, and starting ownership are authored gameplay data, not a vetted historical dataset or legacy extraction.

Map terrain, troop symbols, seals, and the favicon are drawn in code. Named officers use distinct original generated face illustrations, with surname banners and shared troop symbols. The [portrait credits](assets/portrait-credits.md) and bundled manifest identify their creation provenance; these are imagined historical depictions, not authenticated likenesses or copied legacy portraits. UI icons come from `lucide-react`; other dependency licenses remain applicable. Typography uses local/system font fallbacks without external font requests. Sound effects are original Web Audio oscillator cues, with no imported recordings.

The tests cover deterministic and invalid-command behavior, resource accounting, every campaign action, tactical behavior, multiple queued battles, save/resume equivalence, malformed imports, endings, and multi-year AI simulations. They do not establish exact legacy parity, historical accuracy, complete keyboard battle navigation, WebGL context recovery, storage-quota resilience on every browser, cross-browser compatibility, or representative-laptop performance budgets. Browser QA findings belong alongside the actual tested browser/version and viewport; broader release claims remain open.

## A useful learning tour

1. Read `types.ts`, then follow one farming click from `App.tsx` through `session.execute` to `dispatch` and `cityAction`. Notice how one query explains the same costs that execution uses.
2. Run `npm test` and inspect the farming and invalid-command tests. Change one cost intentionally and predict which assertions should change before editing them.
3. Follow a march into `resolution.queue`, `createBattle`, `applyBattleAftermath`, and `finishMonth`. This shows why an interruption must be represented as saved data.
4. Read Dijkstra movement in `battle.ts`, then inspect the Pixi reachable-tile highlights. The renderer asks the rule engine for legal moves instead of reproducing its rules.
5. Trace an exported save through Zod and `validateState`. Types help while writing code; runtime checks protect the application when reading a file.
6. Add a small feature through the same boundaries: for example, a new city action with a clear cost, outcome, UI label, and one meaningful failure case. Split the combined UI into focused components when extending it, and move scenario data to validated external content when multiple scenarios justify that work.

Use `npm run dev` to play, `npm test` for core tests, `npm run build` for type checking and a static bundle, and `npm run test:e2e` for the configured browser flows. See the repository README for current setup and browser prerequisites.
