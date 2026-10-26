# Field battles, tactics and water combat

Current reference checked October 25, 2026. [Bilingual controls and unit/tactic tables](player-guide.md) · [Original battle design brief](history/design/04-battlefields-and-water-combat.md).

## Implemented field

Every campaign battle is fought on a **48×32 logical grid**, up to ten formations per side, on one of 15 painted battlefields (ten terrain types, five with a second variant). The attacker's last route leg picks the battlefield and five attack directions override it; the same leg and direction always give the same field. The attacker enters on the left and the defender holds the right. Selection is in [selection.ts](../../src/v03/battle/battlefields/selection.ts); the per-battlefield layouts, paintings and selection table are in the [battlefield canvas plan](08-battlefield-canvas-plan.md) and [art kit](battlefield-art/README.md). The battlefields are gameplay terrain inspired by the real geography, not historical surveys.

Each painting follows its 48×32 layout cell by cell; the layout, not the painting, is the rules terrain. The four 24×20 regional templates remain only as rules-test fixtures, and saves with 24×20 battles are not accepted.

Terrain is plain, forest, hill, water or cliff. Cliffs block every troop type; hill is walkable. Occupied cells, movement costs and enemy zone of control determine legal paths. Camps are tactical objectives on ordinary terrain, with no hidden city-defense bonus. Non-routed occupation of an opposing camp can end a battle.

There is no siege generation, wall/gate state, city-defense phase, climbing or siege equipment. Cities are contested by field battles and strategic aftermath. Painted walls (a pass wall, a moated manor) are ordinary cliff cells with gates as plain cells; every walled enclosure has at least two gates, and walls are one cell thick so archers can shoot across. Palisades count as forest.

## Commands and forecasts

The three base types are infantry, cavalry and archers. Waterborne is a terrain-driven presentation state, not a separate troop type. Ordinary movement/range and terrain costs live in `battle/rules.ts`; the [player guide](player-guide.md#5-基础兵种与水上单位) gives current budgets. Same-type officers can form one battlefield unit, and garrison militia has unique membership. Defeated historical units remain in saved battle records but cannot appear as active map/minimap/roster selections.

Move, attack, hold, retreat and all six tactics are implemented: Fire, Confuse, Rally, Raid supplies, Ambush and Rockfall. Basic side-wide costs are 4/3/2/4/3/4 respectively; shared points regenerate two per day, capped at 30. Eligibility depends on officer attributes/level/traits, morale, movement/action status, source terrain, target and points. The UI uses rule queries for costs, rejection reasons, targets and forecasts. See the [tactic table](player-guide.md#6-战斗操作计策与水战), rather than the old v0.2 battle guide.

Damage, counterattack and tactic forecasts share resolution helpers. Current/next weather, provisions, movement/range, attributes and tile effects are visible in the conditions panel. Inspection clicks can still perform legal map actions; they are not a separate no-action mode.

## Universal water rule

All six types can enter and leave passable water without a skill, vessel inventory or unlock. A step touching water costs at least two movement points. While standing on water, attack damage is multiplied by **0.75**, incoming troop damage by **1.25**. Source and target water status are evaluated separately; shore→water, water→shore and water→water attacks are legal in normal range. Damaging tactics/counterattacks use the same common water model. Naval has no exemption. Leaving water restores land modifiers.

Normal-hit terrain protection and fire weather/forest modifiers remain separate shared factors. Boat artwork does not override these rules. Strategic movement still requires a configured route.

## Daily resolution and outcomes

Each participating player battle submits once per global day; all required player submissions must complete before the world advances once. NPC-only battles are automatic. Save/reload preserves the daily cursor and manual-command authority rejects nonparticipants.

Elimination, army rout, opposing camp occupation, withdrawal or the time limit can decide a field. Normal battles allow 30 days, raids 10. Current timeout policy is `survivor-count`: compare surviving troop totals; ties go to defender. Withdrawal confirmation concedes the whole battle; Cancel/Escape preserves state. Capture changes ownership, Raid loots and returns without occupation, Sack captures and destructively plunders. Returning armies/cargo still travel.

## Source and evidence

Authoritative source: [battle/engine.ts](../../src/v03/battle/engine.ts), [rules.ts](../../src/v03/battle/rules.ts), [maps.ts](../../src/v03/battle/maps.ts), [types.ts](../../src/v03/battle/types.ts), [battlefields/](../../src/v03/battle/battlefields/layout.ts); strategic aftermath is in `engine.ts`.

F06/F07 and RV01/RV06/RV08/RV09/RV10 repairs are complete. Recorded tests cover map seeds/directions, six-type shore/water combinations, tactics/forecasts, saved cursors, names, counts and confirmation. [Latest recorded checks](evidence/rv-implementation-2026-10-21/README.md). Human battle feel, long campaigns and low-end performance remain open acceptance, not proven by these tests.
