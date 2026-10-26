# v0.3 release notes / 版本说明

Local candidate; implementation `1e02e65` on `hegemony_of_the_three_kindoms_v0.3`. Documentation checked October 22, 2026. [How to play](player-guide.md) · [Status and tests](implementation-status.md) · [Open acceptance](../next-steps.md).

## October 25 battlefield update

Field battles moved from four 24×20 oblique regional templates to **15 hand-painted 48×32 battlefields** on a pure 2D, top-down, draggable board ([plan](08-battlefield-canvas-plan.md), [art kit](battlefield-art/README.md)). Battle rules did not change.

- The attacker's last route leg picks one of ten terrain types (five with a second variant); five attack directions override it. The battle heading names the battlefield.
- Square 64-unit cells, officer-portrait unit tokens with troop badges, tiled fallback terrain, and a battle camera that opens on your formations.
- Every painting was checked cell by cell against its layout; where they disagreed, the layout followed the painting.
- AI move scoring is faster with identical decisions; a 10-vs-10 AI day on 48×32 measures about 40 ms p95.
- Saves with 24×20 battles are rejected; the regional templates remain only as rules-test fixtures.

## New direction from v0.2

v0.3 is an independent Three Kingdoms strategy game with a new campaign model and save format. It reuses authored scenarios, identities and useful engineering, while dropping old-rule/old-save compatibility as a product requirement. Ink-wash style is retained; it was not first introduced in this version.

| Area            | v0.3 change                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time            | Daily simulation instead of the old monthly campaign loop; one-day, ten-day and next-event controls, 30-day months and a saved daily cursor.                            |
| Distance/travel | 24 historical regional anchors/42 route estimates, party ETA, multi-hop route display and actual outbound/arrival/return journeys.                                      |
| Resources       | Daily rations/service accounting, reserved stock, in-transit cargo and arrival delivery; loot does not credit instantly or twice.                                       |
| Governors       | Capital-only direct work, autonomous other cities, month-boundary appointments and troop-free traveling transfers; quantity/date/shortfall plans with player decisions. |
| Field           | 48×32 painted battlefields chosen by route and direction (originally a 24×20 grid with four regional templates), top-down React/SVG renderer, cameras and minimaps.     |
| Water           | All six types can enter passable water; uniform ×0.75 attack/×1.25 incoming damage, normal shore-to-water targeting.                                                    |
| Saves           | Separate v3 envelope/key, one localStorage autosave, current-only import/export; no v1/v2 migration.                                                                    |

## Existing features ported or retained

Two historical scenarios and six houses per scenario, six unit types, officer attributes, six legacy tactics/costs/chances, morale, zone of control, camps, manual player battle command, diplomacy/coalitions/month events and true-unification/Hegemon endings are implemented. These are not all newly invented v0.3 mechanics.

Capital/governor city work includes recruitment/assignment, loyalty/security, search, training, feast, trade, reward, fine arms and relief. Farming/commerce development controls exist, but every city starts above their current manual cap of 100; [the starting-value/cap mismatch is recorded for review](../next-steps.md#open-now). Reward/equipment/relief use user-approved legacy rules within the new staffing/work/stock budget. Fine arms is an officer upgrade, not an inventory/siege system.

The interface includes bilingual Wiki and routine feedback, exact small/large troop labels, order/report discovery, weather/food/terrain inspection, native fallbacks and original draft artwork. Normal battles cap at 30 days, raids 10; timeout compares surviving troops with defender ties.

## Completed repair milestones

- **F01–F08:** ration rounding, early/duplicate loot credit, full-store cargo loss, boundary skipping, same-day returns, duplicate formations, rival battle command authority and invalid save references.
- **RV01–RV02:** NPC-only battles no longer lock the UI clock; primary maps/minimaps fit independently and settle after resize, including menu Resume.
- **RV03–RV05:** campaign menu/Resume/confirmed new game, clean imports and honest save/export feedback; complete player orders/reports; existing governor transfers and accurate appointment/dismissal controls.
- **RV06–RV08:** living-only units, exact counts, visible reserve/population/officer stats, shared action eligibility and bilingual action/formation/log feedback.
- **RV09–RV10:** existing weather/supply/terrain conditions are inspectable; withdrawal has cancelable bilingual confirmation and keyboard focus handling.

The [RV ledger](playability-review-and-todo.md#rv-completion-ledger) retains per-task acceptance, agent assignments and historical reproduction notes. Old unchecked design tasks are preserved in [history](history/README.md), not a second active repair queue.

## Scope and limitations

There is **no siege**: no walls/gates, siege equipment, climbing or street phase. No naval-skill access gate, boat inventory, duels/officer-life game, open-world interception, extra save slots or old-save conversion is included. Multi-city coordinated planning and fully simulated future budgets remain outside the implemented planner.

Geography is historically informed but approximate; battlefields are terrain-inspired, not surveyed historical sites. Three troop categories have dedicated figure sprites; others retain native identities. Seven active generated assets and one inactive paper alternative remain draft. A full additional art variant/regional-prop package is not delivered or approved.

Both scenarios seed farming at 240–380 and commerce at 220–355, while the manual development actions reject values of 100 or more. They become available only if a city value later falls below 100. This mismatch was found in the documentation proofread; it was not changed in this documentation commit.

The 24-run final 96-month narrow-bot matrix reported no selected-player elimination, true unification or Hegemon victory. The player accepted the measured progression miss and kept the conservative rival rule after rejected tuning trials. This is diagnostic evidence, not an assertion that human pacing or win rates are satisfactory. [Raw evidence and limits](evidence/README.md).

## Acceptance and publication

Recorded October 21: 668 tests passed/one skip, 34 browser cases, six affected-case reruns, and passing build/typecheck, production subpath, tactical performance, formatting and portrait checks. [Full record](evidence/rv-implementation-2026-10-21/README.md).

Four player sessions, each 12 campaign months and three manual battles, a real low-end-machine check and specific draft-art revision/approval remain open. They were not waived for v0.3. Push/PR/remote CI remain deferred. The current branch rename changed no gameplay; this October 22 documentation pass also changes no code, assets, dependencies or rules.
