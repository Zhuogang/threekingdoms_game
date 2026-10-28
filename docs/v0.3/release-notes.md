# v0.3 release notes / 版本说明

Local playable candidate. Documentation checked October 28, 2026 against the working tree. Dated sections below preserve their own validation scope. [How to play](player-guide.md) · [Status and tests](implementation-status.md) · [Open acceptance](../next-steps.md).

## October 28 gameplay and operation refinements

- Each owned city refreshes to two work points every ten actual game days, independent of officer count. Assignment, contingent returns, rewards, equipment and ordinary transfers use no points. Capital changes and appointments preserve spent work. Governors and AI share the revised costs and refresh.
- Feast, reward and fine arms support multiple checked officers and select-all, exact previews and atomic total-cost checks. A feast uses one point for the group; rewards cost 100 gold/person and arms 180 gold/person without points.
- Governor appointments no longer require empty contingents; cross-city appointees retain healthy/wounded personnel and wait for a legal monthly handover after arrival. Effective ruler appointments synchronize the capital. Conquest reports offer personal rule, appointment or a deferred Inbox decision.
- Ordinary officers can move separately through City affairs → Transfer officers. Select a group and another friendly city, preview ETA/provisions and carry the whole contingent. Arrival stations them immediately without an appointment; travelling and redirected parties appear in Marches & orders.
- Closing a battle report exposes unfinished player fields. When the remaining fields already submitted, Advance 1 day finishes the shared day once, including after reload. Manual movement opens the unit action menu.
- Recruiting a captured ruler lowers the former house's other living officers and cities by 10 loyalty; execution does not. Capture still triggers immediate succession, and surviving factions display the current ruler.
- City overviews display farming, commerce, population, reserve and public order/city loyalty alongside existing stocks. Development uses the shared 500 cap; independent training caps and non-effective action checks have been corrected.

Compatible current v3 saves retain existing work usage, travel and pending decisions. These refinements do not add a migration for pre-personnel or older-roster saves. [Current guide](player-guide.md) · [Validation scope](implementation-status.md).

## October 26 city detail artwork and asset cleanup

City overview/detail panels now show eight regional city paintings. They share the map marker’s region selection across all 24 cities; Xiangyang uses river art. Desktop layouts place the illustration beside the house information, while narrow layouts stack them. Missing images retain the city-character fallback and working actions. Six unused terrain images, five old map/background candidates and their obsolete source/generation files were removed. The active map, battlefield paintings and terrain rules are unchanged.

## October 26 battlefield display and camp removal

The battle view uses the window width, with Expand battlefield and native Fullscreen controls. Show panels toggles commands, minimap, help, top bar and battle list; hidden commands leave a compact action bar. The minimap floats inside the battlefield. Restore layout returns to the prior settings. Camps, occupation victory, camp camera targets and camp AI goals have been removed. Battles resolve through defeat, rout, withdrawal or the time limit. No save migration is included. [Implementation record](11-battle-display-and-camp-removal.md).

## October 26 wounded troops and retreat

Combat casualties now leave 60% wounded; defeated elite troops can survive, return and recover without losing their XP. One officer still commands one base troop type, with healthy and wounded sharing a 10,000-person cap. Full supplied city days heal 10%, and captured armies recruited into a house require ten days of reorganization.

Army withdrawal previews a real refuge and independent capture risk: 0% before engagement, 5% after engagement, 25% on forced defeat, or surrender without a route. Losing defenders can retreat too. Release/exchange create journeys; food includes reserves, rear wounded and prisoners. City panels support returning and disbanding personnel. NPCs use the same availability and retreat rules. See the [bilingual guide](player-guide.md) and [implementation/test record with three scenario saves](evidence/wounded-system-2026-10-26/README.md).

Saves from before the personnel schema are incompatible. The start screen can export their raw data before replacement; cancel keeps the original. Balance parameters still need long player sessions.

## October 25 battlefield update

Field battles moved from four 24×20 oblique regional templates to **15 hand-painted 48×32 battlefields** on a pure 2D, top-down, draggable board ([plan](08-battlefield-canvas-plan.md), [art kit](battlefield-art/README.md)). Battle rules did not change.

- The attacker's last route leg picks one of ten terrain types (five with a second variant); five attack directions override it. The battle heading names the battlefield.
- Square 64-unit cells, officer-portrait unit tokens with troop badges, tiled fallback terrain, and a battle camera that opens on your formations.
- Every painting was checked cell by cell against its layout; where they disagreed, the layout followed the painting.
- AI move scoring is faster with identical decisions; a 10-vs-10 AI day on 48×32 measures about 40 ms p95.
- Saves with 24×20 battles are rejected; the regional templates remain only as rules-test fixtures.

## New direction from v0.2

v0.3 is an independent Three Kingdoms strategy game with a new campaign model and save format. It reuses authored scenarios, identities and useful engineering, while dropping old-rule/old-save compatibility as a product requirement. Ink-wash style is retained; it was not first introduced in this version.

| Area            | v0.3 change                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Time            | Daily simulation instead of the old monthly campaign loop; one-day, ten-day and next-event controls, 30-day months and a saved daily cursor.                                                           |
| Distance/travel | 24 historical regional anchors/42 route estimates, party ETA, multi-hop route display and actual outbound/arrival/return journeys.                                                                     |
| Resources       | Daily rations/service accounting, reserved stock, in-transit cargo and arrival delivery; loot does not credit instantly or twice.                                                                      |
| Governors       | Capital-only direct work, autonomous other cities, month-boundary appointments with retained contingents and separate ordinary officer transfers; quantity/date/shortfall plans with player decisions. |
| Field           | 48×32 painted battlefields chosen by route and direction (originally a 24×20 grid with four regional templates), top-down React/SVG renderer, cameras and minimaps.                                    |
| Water           | All base types and elite variants can enter passable water; uniform ×0.75 attack/×1.25 incoming damage, normal shore-to-water targeting.                                                               |
| Saves           | Separate v3 envelope/key, one localStorage autosave, current-only import/export; no v1/v2 migration.                                                                                                   |

## Existing features ported or retained

Two historical scenarios and six houses per scenario, three base troop types with elite presentation, officer attributes, six tactics, morale, zone of control and manual player battle command, diplomacy/coalitions/month events and true-unification/Hegemon endings are implemented. These are not all newly invented v0.3 mechanics.

Capital/governor city work includes recruitment/assignment, loyalty/security, search, training, feast, trade, reward, fine arms and relief. Farming/commerce development uses the shared cap of 500 and retains existing values. Reward/equipment/relief use user-approved legacy rules within the shared ten-day work and protected-stock rules. Fine arms is an officer upgrade, not an inventory/siege system.

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

Geography is historically informed but approximate; battlefields are terrain-inspired, not surveyed historical sites. Current map, city, battlefield, unit/vessel and portrait assets are indexed in the [art reference](06-imagegen-and-artwork.md). Final artwork approval and player-directed revisions remain open.

The earlier 100-point development-cap mismatch has been repaired: direct and autonomous development use 500, display actual capped gains and preserve seeded/loaded values.

The 24-run final 96-month narrow-bot matrix reported no selected-player elimination, true unification or Hegemon victory. The player accepted the measured progression miss and kept the conservative rival rule after rejected tuning trials. This is diagnostic evidence, not an assertion that human pacing or win rates are satisfactory. [Raw evidence and limits](evidence/README.md).

## Acceptance and publication

Recorded October 21: 668 tests passed/one skip, 34 browser cases, six affected-case reruns, and passing build/typecheck, production subpath, tactical performance, formatting and portrait checks. [Full record](evidence/rv-implementation-2026-10-21/README.md).

Four player sessions, each 12 campaign months and three manual battles, a real low-end-machine check and specific draft-art revision/approval remain open. They were not waived for v0.3. Push/PR/remote CI remain deferred. Historical validation counts above belong to the dated candidate. See [current status](implementation-status.md) for later checks; this documentation cleanup does not change gameplay rules.
