# v0.3 decisions and implementation contracts

Current reference checked October 28, 2026 against the working tree. [Overview](README.md) · [Implementation status](implementation-status.md) · [Original decision/design record](history/design/00-decisions-and-contracts.md). Dated records retain earlier decisions; the table and updates below state current behavior.

## Confirmed product decisions

| ID  | Confirmed direction                                                                | Current implementation                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Historical city/distance baseline, then unit differences                           | 24 anchors and 42 links; straight-line and estimated road distances separate; party-specific ETA. No hard-coded Hanzhong–Chang'an 30-day minimum.                                                                                                                                                 |
| D2  | Daily internals, one day/ten days/next event, 30-day months                        | One absolute-day calendar with serialized daily cursor and monthly settlement.                                                                                                                                                                                                                    |
| D3  | 48×32 field, 10 terrain battlefields chosen by the last route leg (revised Oct 23) | Campaign battles use the 48×32 canvas battlefields: the attacker's last route leg picks one, five attack directions override it (`battle/battlefields/selection.ts`, plan §6–§8). Saves with 24×20 regional battles are rejected; the four regional templates remain only as rules-test fixtures. |
| D4  | Pure 2D top-down canvas, draggable and zoomable (revised Oct 23)                   | Square-grid React/SVG projection, drag/zoom camera, minimap, portrait-plus-troop unit tokens, tiled terrain fallback; painted canvases arrive per battlefield. No San10 asset copying.                                                                                                            |
| D5  | Governor cities autonomous; ruler's capital direct                                 | Authority is checked in the command/domain layer, not only by hiding buttons. Unassigned cities use local stewardship.                                                                                                                                                                            |
| D6  | Keep appointments; change governance at settlement boundary                        | Monthly handover; repeated appointments do not refresh work or commitments.                                                                                                                                                                                                                       |
| D7  | Manual tactical command retained                                                   | Manual command remains the default. Optional saved auto command can be returned to manual control on any battle day.                                                                                                                                                                              |
| D8  | Executable plan, shortfall and earliest dates; reduce or wait                      | Governor-city orders retain accept/reduce/wait/cancel and recall. Capital marches dispatch the selected officers directly.                                                                                                                                                                        |
| D9  | New version, no old-save requirement                                               | v3-only save envelope and separate localStorage key; reject old saves without deleting old data.                                                                                                                                                                                                  |
| D10 | No siege; all units may fight on water                                             | No wall/gate/engine/street phase. Water attack ×0.75, incoming troop damage ×1.25; shore attacks work in range. These multipliers are implementation defaults, not historical measurements.                                                                                                       |
| D11 | Timeout field control by surviving troops, defender ties                           | `survivor-count`: normal limit 30 battle days, raid 10; earlier outcome conditions still apply.                                                                                                                                                                                                   |

Additional confirmed choices: legacy tactic costs/chances and officer combat attributes were ported; governor reward/fine-arms/relief use shared city budgets. Governor transfers carry their contingents; ordinary officers have a separate transfer command without taking office. The conservative rival policy and measured strategic diagnostic miss are retained. Art stays draft; player sessions/real low-end checks remain open. Push/PR/remote CI are deferred.

## October 28 operating rules

Each owned city refreshes to two work points every ten actual game days, independent of staffing; unused points do not accumulate. Assignment, contingent returns, rewards, fine arms and ordinary transfers use no points. Appointments and capital changes preserve spent work. Income and office handovers remain monthly.

Feasts, rewards and fine arms support group selection with atomic cost validation. Ordinary officer transfers carry healthy/wounded contingents to a friendly city and station them on arrival. Cross-city governors wait for the legal handover; a ruler's effective appointment moves the capital. Conquest reports lead to an immediate/local governance choice or a deferred Inbox task.

Manual movement opens the unit action menu. Finishing one battlefield preserves and exposes the others; if all remaining fields already submitted, Advance 1 day can finish the shared day once, including after reload. The [governance](03-governors-and-authority.md) and [battle](04-battlefields-and-water-combat.md) references describe these boundaries.

## October 22 playability refinements

Q1: battle commitments block only the contested city and participating officers/troops; unrelated administration and diplomacy continue. The `phase` field remains a serialized world cursor.

Q2/Q2b, with later refinements: a captured ruler remains a prisoner and the most loyal free officer succeeds (stable officer ID breaks ties). A house is eliminated when no free officer remains. Recruitment/exchange attempts are monthly, including a refused exchange; release and execution remain available afterward. Recruiting a captive ruler lowers the former house's other living officers and owned cities by 10 loyalty, floored at zero. Execution has no additional loyalty penalty. Surviving houses display the current ruler's name.

Q3: one tactical formation per officer, at most ten per side including separate militia; overflow joins the weakest matching type. Q4 retains manual command by default with optional reversible automatic command. Q5 keeps governor proposal answers while capital marches dispatch chosen officers directly. Q6 retires legacy code behind `v0.2-final`. Q7 bundles Source Sans 3 and a game-character subset of Noto Serif SC.

The economic scale stays intact, with farming/commerce development capped at 500 for direct and autonomous work. Optional structured reports/logs, auto command and prisoner-month fields extend v3 saves; the envelope stays version 3. See the [implementation ledger](playability-implementation.md).

## Source and state boundaries

| Contract            | Authoritative source / boundary                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 Geography        | `src/v03/geography/`: anchors, route estimates, versioned inputs. Artwork does not set distance.                                                                        |
| C2 Time/travel      | `calendar/`, `engine.ts`: absolute day, route snapshots, food/cargo, daily cursor. Renderer does not advance time.                                                      |
| C3 Authority/orders | `governance/`: appointments, ordinary transfers, capabilities, ten-day work budgets, preview/answer and stock reservations. UI calls shared eligibility.                |
| C4 Battle           | `battle/`: logical terrain, movement/ZOC, targeting, forecasts, tactics, morale, outcomes. Same helpers feed inspection and resolution.                                 |
| C5 Presentation/art | `rendering/`, `styles.css`, asset manifest: projection, cameras, hit tests, layers, native fallbacks. Units use foot anchors; painting cannot add hidden terrain rules. |
| C6 Save/application | `types.ts`, `commands.ts`, `App.tsx`, `platform/storage.ts`: serializable state and validated command/save boundary.                                                    |

Current entry is `src/main.tsx` → `src/v03/App.tsx`. The legacy engines, UI and tests are retired behind local tag `v0.2-final`. Shared authored scenarios, traits and identities live under `src/v03/content`.

The actual save fields are `format: "hegemony.save"`, `version: 3`, `ruleset: "hegemony-3"`; **not** the early proposed `formatVersion` field. Autosave key is `hegemony-v0.3:autosave`. Exact current schemas are in `types.ts` and `platform/storage.ts`.

For future parallel work, assign one editor per shared file (`App.tsx`, `engine.ts`, types/commands/storage). Domain owners provide queries and tests; rendering and artwork consume those contracts. This is a maintenance boundary, not a request to restart the completed tracks.
