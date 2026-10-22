# v0.3 decisions and implementation contracts

Current reference checked October 22, 2026 against `1e02e65`. [Overview](README.md) · [Implementation status](implementation-status.md) · [Original decision/design record](history/design/00-decisions-and-contracts.md). The historical record retains the original discussion; the table below states what the current game uses.

## Confirmed product decisions

| ID  | Confirmed direction                                           | Current implementation                                                                                                                                                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Historical city/distance baseline, then unit differences      | 24 anchors and 42 links; straight-line and estimated road distances separate; party-specific ETA. No hard-coded Hanzhong–Chang'an 30-day minimum.                                           |
| D2  | Daily internals, one day/ten days/next event, 30-day months   | One absolute-day calendar with serialized daily cursor and monthly settlement.                                                                                                              |
| D3  | 24×20 field                                                   | 480 logical cells, four regional templates.                                                                                                                                                 |
| D4  | High-angle oblique ink-wash presentation                      | React/SVG projection, cameras, minimaps and native rule overlays; no San10 asset copying.                                                                                                   |
| D5  | Governor cities autonomous; ruler's capital direct            | Authority is checked in the command/domain layer, not only by hiding buttons. Unassigned cities use local stewardship.                                                                      |
| D6  | Keep appointments; change governance at settlement boundary   | Monthly handover; repeated appointments do not refresh work or commitments.                                                                                                                 |
| D7  | Manual tactical command retained                              | Players control their participating armies independently of city administration.                                                                                                            |
| D8  | Executable plan, shortfall and earliest dates; reduce or wait | Supply/campaign orders support accept, reduce, wait, cancel and legal journey recall.                                                                                                       |
| D9  | New version, no old-save requirement                          | v3-only save envelope and separate localStorage key; reject old saves without deleting old data.                                                                                            |
| D10 | No siege; all units may fight on water                        | No wall/gate/engine/street phase. Water attack ×0.75, incoming troop damage ×1.25; shore attacks work in range. These multipliers are implementation defaults, not historical measurements. |
| D11 | Timeout field control by surviving troops, defender ties      | `survivor-count`: normal limit 30 battle days, raid 10; earlier outcome conditions still apply.                                                                                             |

Additional confirmed choices: legacy tactic costs/chances and officer combat attributes were ported; governor reward/fine-arms/relief use the approved legacy rules within current budgets; governor transfers remain troop-free. The conservative rival policy and measured strategic diagnostic miss are retained. Art stays draft; player sessions/real low-end checks remain open. Push/PR/remote CI are deferred.

## Source and state boundaries

| Contract            | Authoritative source / boundary                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 Geography        | `src/v03/geography/`: anchors, route estimates, versioned inputs. Artwork does not set distance.                                                                        |
| C2 Time/travel      | `calendar/`, `engine.ts`: absolute day, route snapshots, food/cargo, daily cursor. Renderer does not advance time.                                                      |
| C3 Authority/orders | `governance/`: appointments, capabilities, monthly work, preview/answer and stock reservations. UI calls shared eligibility.                                            |
| C4 Battle           | `battle/`: logical terrain, movement/ZOC, targeting, forecasts, tactics, morale, outcomes. Same helpers feed inspection and resolution.                                 |
| C5 Presentation/art | `rendering/`, `styles.css`, asset manifest: projection, cameras, hit tests, layers, native fallbacks. Units use foot anchors; painting cannot add hidden terrain rules. |
| C6 Save/application | `types.ts`, `commands.ts`, `App.tsx`, `platform/storage.ts`: serializable state and validated command/save boundary.                                                    |

Current entry is `src/main.tsx` → `src/v03/App.tsx`. Old `src/game`, `src/ui` and Pixi modules remain historical/shared code, not a second running v0.3 engine. Shared authored scenarios and type identities are reused deliberately.

The actual save fields are `format: "hegemony.save"`, `version: 3`, `ruleset: "hegemony-3"`; **not** the early proposed `formatVersion` field. Autosave key is `hegemony-v0.3:autosave`. Exact current schemas are in `types.ts` and `platform/storage.ts`.

For future parallel work, assign one editor per shared file (`App.tsx`, `engine.ts`, types/commands/storage). Domain owners provide queries and tests; rendering and artwork consume those contracts. This is a maintenance boundary, not a request to restart the completed tracks.
